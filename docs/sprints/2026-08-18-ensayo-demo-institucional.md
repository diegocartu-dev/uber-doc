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
