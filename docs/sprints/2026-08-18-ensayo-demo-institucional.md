# Ensayo E2E de la demo institucional — 18/08/2026 (madrugada)

Cierre de la preparación de la demo: se destrabó el deploy pendiente, se reparó
el puente admin→instancia y se ensayó **la cadena completa con navegadores
reales contra producción**, incluido el lado del paciente de punta a punta.

## Qué quedó verificado (todo contra producción, con navegador)

1. **Deploy fresco de la instancia** con `NEXT_PUBLIC_LIVEKIT_URL` incrustada.
   Era EL bloqueante: sin esto la videollamada no conectaba.
2. **Puente superadmin** (botón "Demo institucional" al pie del dashboard de
   `/admin` del B2C): handshake completo verificado — se acuña el pasaje de un
   solo uso y aterriza logueado en `/admin/demo` de la instancia.
3. **Alta de operador** vía la pantalla `/admin/operadores` (la tabla estaba
   vacía: sin esa fila, `/otorgador` rebota a cualquiera — quedó dada de alta
   para el usuario admin de la instancia).
4. **Call center (`/otorgador`)**: búsqueda de paciente, oferta con los dos
   profesionales y su ventana CI 00:00–23:59, asignación de consulta inmediata,
   y el modal de éxito con el link de acceso del paciente cuando el aviso
   automático no puede salir (paciente sin celular).
5. **Lado paciente de punta a punta**: link → "Hola, {nombre} / Entrar" (sin
   usuario ni contraseña) → su consulta → sala. Si el profesional ya abrió la
   sala, entra DIRECTO a la videollamada, sin pasos intermedios.
6. **Video real**: la API del servidor de LiveKit reportó **2 participantes
   simultáneos** en la sala (`medico-…` y `paciente-…`). El workspace mostró el
   tile del paciente y el timer corriendo.
7. **Cierre completo**: diagnóstico + "Generar evolución" (chips ✓✓) +
   "Finalizar y enviar al paciente" → la médica volvió al dashboard y el
   paciente vio "Consulta finalizada — tus recetas y documentos quedaron
   guardados". En DB: `cierre_origen='medico'`, `evolucion_validada_at` seteado.
8. **Cierre por sala vacía (3 veces)**: al abandonar una sala sin finalizar, el
   webhook de LiveKit cerró la consulta solo (`cierre_origen='webhook_video'`)
   con rescate de borradores. Ninguna fila quedó colgada.
9. **Guard "una atención por vez" del lado del profesional**: con una consulta
   en curso, `asignar-ci` devuelve 409 "El profesional está atendiendo a otro
   paciente" — verificado empíricamente.

## Lo que se arregló en el camino

- **Env vars del puente guardadas VACÍAS en Vercel.** El CLI viejo (54.11.1)
  guarda el valor vacío cuando el stdin no es una TTY, sin avisar. Se actualizó
  el CLI a 59.x, se regeneró el secreto y se re-deployaron ambos proyectos.
  ⚠️ Regla nueva: las env vars quedan tipo **Sensitive** — `vercel env pull`
  las devuelve enmascaradas, así que "verificar por pull" ya no sirve; la
  verificación tiene que ser **funcional** (probar el endpoint que la usa).
- **Renombre del profesional de respaldo** (los dos se llamaban igual y
  confundían al otorgador). Ojo: el saludo del dashboard lee
  `user_metadata.full_name` del auth user, y la pantalla de acceso lee
  `medicos.nombre_completo` — al renombrar un profesional de demo hay que
  actualizar los dos lados.

## Observaciones menores (no bloquean la demo)

- El buscador del otorgador muestra pacientes de TODAS las demos con el mismo
  nombre ("Paciente de demostración N" duplicado entre sesiones de demo), sin
  distinguir de cuál vienen.
- El dashboard del profesional institucional muestra la card "Tu consultorio
  particular" con link a docto.com.ar — fuga de marca en el contexto marca
  blanca.
- El popup "Activá las notificaciones" reaparece por encima del CTA "Iniciar
  consulta"; en la demo conviene tocarlo ("Ahora no") apenas aparece.

## Residuos del ensayo (deliberados)

Las consultas de prueba quedaron como `completada` en el historial de la
profesional de respaldo (la escena principal —profesional 1, su agenda y su
franja para Nova— no se tocó). La disponibilidad de la profesional de respaldo
volvió a OFF, su estado previo.

---

# Después de la reunión — dos fallas encontradas por Diego usándolo

La reunión salió bien y el sistema aguantó de punta a punta. Aparecieron dos
fallas, las dos del mismo tipo: código del B2C que en la instancia apunta a
lugares que ahí no existen.

## 1. "Eliminar demo" no borraba (PR #422)

El primer borrado real de una reunión dejó siete errores en pantalla y la
reunión sin cerrar. Cuatro causas:

- `descargas_hc` y `video_presencia` no tienen `turno_id`/`consulta_id`: apuntan
  al encuentro con `(tipo, recurso_id)`, como el metering.
- `medico_paciente_perfil` se indexa por `medico_user_id`, no por `medico_id`.
- Las agendas se borraban ANTES que los turnos, y `turnos.modelo_id` las
  retenía: el FK se reportaba como "lo retiene evidencia de firma" sin que
  hubiera ninguna firma de por medio.
- La anonimización escribía `NULL` en `medicos.titulo`, que es NOT NULL: el
  UPDATE moría entero y el sobreviviente quedaba CON su nombre — justo lo
  contrario de lo que promete el módulo.

Además, `aceptaciones_legales` y `consentimientos_informados` retenían las
cuentas auth (el "Database error deleting user"): ahora se sueltan antes.

Verificado apretando el botón en producción: las tres reuniones quedaron
`limpia`.

## 2. Al paciente se le abría una pantalla en blanco (PR #423)

Al terminar la videollamada, el paciente toca "Ver mis documentos" y aparece
una pantalla vacía; si vuelve atrás, los documentos están.

`/documentos` está en `INSTITUCIONAL_BLOCKED` y el middleware la contesta con
`new NextResponse(null, { status: 404 })`: **404 sin cuerpo**, que el navegador
pinta en blanco. Medido en producción: `HTTP 404 · 0 bytes`. Los documentos del
paciente institucional viven en SU pantalla, la del enlace, que ya los lista con
sus PDFs — por eso al ir atrás aparecían.

El destino ahora lo decide la page (server) con `rebotePaciente` y viaja como
prop. El test nuevo (`pantallas-sin-links-muertos.test.ts`) encontró **dos links
más de la misma clase, no reportados**: "Volver a mis consultas" (consulta
cancelada) y **"Salir"** (pantalla de desconexión) apuntaban a `/mis-consultas`,
también apagada. El segundo es el peor: se llega ahí justo cuando al paciente se
le cortó la llamada.

### Por qué hay un test que lee el código fuente

Esta clase de bug no la ve el tipado, ni el lint, ni un test de render: el link
está bien escrito, el tipo es `string` y en el B2C funciona. Solo se ve mirando
el conjunto — qué rutas apaga el modo y qué rutas linkean las pantallas del
paciente. El test hace exactamente eso y falla con el nombre del archivo y la
ruta muerta. Comprobado que muerde: así aparecieron los dos de arriba.

## Verificación E2E del fix (producción, navegadores reales)

Demo de prueba aparte (para no tocar la de Diego): profesional + paciente
cargados desde la pantalla de demo, CI asignada desde el call center,
videollamada, cierre con diagnóstico y evolución. Entonces, como el paciente:

- Botón "Ver mis documentos" → `href` = su pantalla, no `/documentos`.
- Esa pantalla: **HTTP 200**, "Tu consulta terminó — Te dejaron documentación",
  con el documento listado.
- "Descargar" → **HTTP 200, 34.777 bytes, `%PDF-`**: un PDF de verdad.

Después se borró la demo de prueba con el botón ya arreglado: reportó que el
documento firmado queda (append-only, por ley) y que el texto escrito a mano
adentro se borra. Comprobado en la base: `diagnostico` y `contenido` quedaron en
`(borrado al cerrar la reunión de demostración)`.

## Lo que queda anotado (no bloquea)

- Un profesional recién creado en la demo no trae el toggle "Disponible para
  consultas" hasta configurarse; para la prueba se habilitó por base. Conviene
  revisar qué ve un profesional nuevo la primera vez que entra.
- La pantalla de cierre del paciente sigue mostrando la barra "🩺 Docto" sobre
  la banda de la institución: es marca blanca, y ahí Docto debería ir al pie.
