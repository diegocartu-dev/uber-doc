# 08–09/08/2026 — "Nada de lo que el médico escribe se pierde" + los seis hallazgos de la auditoría

Dos días de trabajo continuo. Primero el pedido de Diego —que nunca más se pierda
lo que un profesional escribió— y después una verificación integral de la
plataforma que destapó seis cosas, todas cerradas.

---

## Parte 1 — Que no se pierda nada (PRs #368, #370, #369, #372)

### El caso que lo motivó

Una consulta de junio: la médica escribió diagnóstico y evolución, la consulta
figura completada y cobrada, y **el paciente no recibió un solo documento**.
Apareció recién en una auditoría, dos meses después.

### Los tres agujeros

**#368 — Se descartaba lo escrito si la consulta ya figuraba cerrada.**
En `WorkspaceConsulta`, si la atención ya estaba cerrada cuando el médico tocaba
"Finalizar", había un `return` mudo: todo lo escrito se tiraba. Pasa de verdad —
el webhook de la sala de video cierra apenas se borra el room y le gana por
milisegundos. Ahora se emite igual, deduplicando **por tipo de documento**: se
consulta qué tipos ya salieron y se mandan solo los que faltan.

El reintento tras un error de red tampoco es a ciegas: como el cliente de
Supabase devuelve `{error}` en vez de lanzar, un POST que commiteó pero perdió la
respuesta se ve idéntico a uno que falló. Antes de reinsertar se vuelve a
preguntar qué quedó guardado. Duplicar una receta firmada es peor que reintentar.

**#370 — Los cierres automáticos no miraban el borrador.**
Docto autoguarda cada 5 s en `doc_borrador`, pero era una libreta privada:
ninguna línea de código la convertía en documentos entregados. Los cuatro caminos
que cierran sin que el médico toque "Finalizar" (desconexión, sala vacía, cron
nocturno, vencimiento de reingreso) ahora rescatan lo escrito, lo emiten y lo
sellan con atribución propia: `rescate_borrador`.

Es conservador a propósito: **ante la duda no emite**. El guard cruzado va en las
dos direcciones — el DELETE de la sala deja `cierre_origen='medico'` ANTES de
borrarla, y los cierres en vivo que ven esa marca cierran sin rescatar.

**#369 — El médico no podía volver.**
Ahora entra a una atención cerrada en modo "completar documentación" y emite lo
que faltó. No reabre nada ni toca lo ya emitido: agrega lo que falta con fecha
real (`emitido_post_cierre`), nunca antedata.

**#372 — El efecto cruzado de los tres.**
Al habilitar el regreso quedaron dos cosas mal: el médico veía **dos carteles
ámbar** sobre la misma consulta con instrucciones opuestas, y el aviso le decía
"ya figura cerrada y no vas a poder volver a entrar: escribinos a soporte@" —
falso desde #369. Ahora se reparten: la tarjeta del servidor cubre las cerradas,
el cartel del navegador cubre la que quedó abierta (lo que la tarjeta no puede
ver). El texto de "no se puede" queda solo para las atenciones **anuladas**.

### Verificado en producción con un caso real

Durante la prueba de atención del 09/08 quedó una consulta abierta con
diagnóstico escrito y se cerraron los navegadores sin finalizar. **El sistema la
cerró solo (`cierre_origen='webhook_video'`), rescató el borrador, emitió el
documento y lo firmó con `metodo_atribucion='rescate_borrador'`.**

---

## Parte 2 — Firma electrónica: el sellado histórico

26 documentos clínicos reales de 4 profesionales quedaron sin sello por una falla
del sellado automático. Se sellaron en 3 tandas, 0 fallidos. Los 91 restantes son
de cuentas de prueba y se saltean por diseño.

- Verificación pública sobre los 31 firmados: **31/31 `verificada:true, alterada:false`**.
- Cron `documentos-sin-sello`: 0 pendientes.
- Los dos lotes quedaron con su `detalle` honesto: el primero `sin_efecto` (0
  sellados, el endpoint cortaba la tanda por posición y se clavaba en documentos
  de cuentas de prueba), el segundo `completo`.

**#377 — La deuda de avisar quedaba sin anotar.** El dictamen obliga a avisarle a
cada profesional, y la corrida no escribió ni una fila en
`sellado_diferido_avisos`. Por poco la deuda desaparece sola: al relanzar el
lote, esos documentos ya no son candidatos, así que esos 4 no volvían a aparecer
nunca — el propio dictamen había previsto ese modo de falla. Ahora la fila se
escribe al sellar cada documento, no al final del lote.

**Pendiente: el envío del aviso a los 4 profesionales.** No es decisión técnica.

---

## Parte 3 — Los seis hallazgos de la verificación integral

Verificación adversarial en 6 dimensiones con evidencia empírica contra
producción: **22 hallazgos, 16 se cayeron al escrutinio**, 6 sobrevivieron.

### 1. La plataforma le decía "Dr." a 30 de las 36 médicas aprobadas (#373)

El dato correcto existía desde siempre —el médico elige su tratamiento al
registrarse, `medicos.titulo`, columna NOT NULL cargada en los 45—. Lo que
faltaba era **usarlo**: `formatNombreMedico()` tenía `"Dr."` como default fijo y
casi ninguna pantalla le pasaba el título.

47 archivos. Aparecieron de paso: la Clínica Virtual no mostraba tratamiento en
absoluto; la página pública de verificación decía el nombre pelado mientras el
PDF del mismo documento decía "Dra."; el prompt de Nova indicaba dirigirse a una
médica en masculino en cada respuesta; el wizard de onboarding tenía tres "Dr."
escritos a mano.

**La parte delicada — la firma.** La receta imprime el tratamiento, y acá todo lo
que se imprime entra al hash. El snapshot de identidad subió a `v:2` con
`medico_titulo`. Los `v:1` se leen tal como se guardaron y **no ganan la clave
nueva**: `canonicalJSON` incluye las claves que existen aunque valgan `undefined`,
así que agregarla les cambiaría el hash y los 31 documentos firmados figurarían
como alterados. Verificado: 31/31 siguen verificando, y el round-trip de v:2
reproduce el objeto canónico exacto.

Resultado en producción: **23 páginas públicas correctas, 0 equivocadas** (las
otras 13 están cerradas por el gate de identidad — ver punto 6).

### 2. Un webhook tardío podía arruinar una consulta cobrada (#374)

MP manda dos webhooks por pago y no garantiza el orden. Tres de los cuatro
handlers actualizaban a ciegas. Dos formas de romper algo cobrado: el webhook del
intento *rechazado* llegando después del aprobado, o el `pending` del *mismo*
pago llegando después del `approved`.

Regla nueva: sobre una atención ya cobrada solo pasan los webhooks del mismo pago
y en un estado posterior al cobro (devolución o contracargo). En el contracargo
el guard cubre solo el UPDATE, nunca la alerta.

Sin víctimas: toda atención real atendida tiene su pago en `approved`.

### 3. El checkout dejaba pagar en efectivo una consulta inmediata (#375)

La preferencia salía sin ninguna restricción de medio de pago. El paciente podía
elegir cupón de Rapipago para una consulta que empieza en dos minutos: el pago
queda pendiente, la atención se congela, y dos días después entra la plata para
algo que ya no puede usar (y en turnos, el lugar ya se soltó a los 15 minutos).

Se excluyen `ticket` y `atm`. Todo lo instantáneo sigue disponible.

### 4. Un archivo pesado colgaba el botón para siempre (#376)

El tope de la plataforma es duro y está en ~4,5 MB: el 413 corta ANTES de que la
petición entre a la app, así que ningún guard del servidor puede atraparlo. Dos
formularios validaban contra 10 MB — dejaban pasar justo los archivos condenados.

En la re-subida de credencial **no había `try/finally`**: el botón quedaba en
"Subiendo…" para siempre, sin error. Y el colegio médico manda PDFs pesados, o
sea que era el camino normal. Mismo patrón adjuntando estudios durante la
consulta, donde el 413 vuelve como HTML y el médico leía "Error de conexión".

El número real vive ahora en un solo lugar: `MAX_BYTES_ENVIO`.

### 5. El sellado no anotaba a quién avisar (#377)

Ver Parte 2.

### 6. Los profesionales trabados dependían de un badge que nadie mira (#378)

13 aprobados que no pueden recibir un solo paciente por falta de verificación de
identidad. Los dos frenos del mail automático están bien y no se tocaron (a un
`Declined` no se le escribe solo; se deja de insistir a los 30 días). Lo que
fallaba es lo que pasa **después**: el único rastro era un badge del panel, y uno
llevaba 38 días así.

Ahora sale un mail semanal **a Docto** —no al profesional— mientras quede alguien
trabado. Ya se disparó: `identidad-trabados → "9 trabados"`.

---

## Parte 4 — Otros arreglos del sprint

- **#371** — La alerta de deploy fallido dependía de un `VERCEL_TOKEN` que nunca
  se creó: devolvía `null` en la primera línea, siempre. Ahora el estado se lee de
  GitHub (el repo es público, sin credencial) y hay tres desenlaces explícitos:
  `ok` / `fallo` / `sin_verificar` con el motivo. Un vigía que deja de vigilar en
  silencio es peor que no tener vigía.
- **#362** — El contador de "Médicos pendientes" se actualiza al aprobar.
- **#353** — Las reservas abandonadas salen de `/insights` y `/admin`, con el
  criterio centralizado en `lib/insights/reservas.ts`.
- **Reservas vencidas** — 4 slots zombis liberados, uno bloqueado desde el 15/07.

---

## Parte 5 — Prueba de atención de punta a punta (09/08)

Dos navegadores en paralelo contra producción, cuentas de prueba (pago simulado):

| Paso | Resultado |
|---|---|
| Login paciente + médico | OK |
| Clínica → jurisdicción → triage → gate de urgencias → T&C | OK |
| Consulta creada → sala de espera | OK |
| Le aparece al médico → Aceptar | OK |
| Paciente paga (simulado) → info médica → videollamada | OK |
| Médico: workspace → diagnóstico → Generar evolución → Finalizar | OK |
| Paciente ve la pantalla de cierre | OK |
| Contra la base: `completada`, cierre=medico, borrador limpio, documento **firmado**, verificación pública en verde | OK |

---

## Parte 6 — Qué pasó el 8 de agosto

Diego notó que no hubo consultas pese a varios registros. **No fue técnico.**

- 5 pacientes registrados (4 completaron perfil), 22 aperturas de la clínica.
- **Cero médicos reales con la consulta inmediata prendida en todo el día.**
- De los 19 "medico_elegido" del funnel, 17 son de una sola cuenta clickeando al
  médico de prueba (tests automáticos). De los registrados reales: uno miró la
  agenda y no reservó, otro de Jujuy dejó su mail porque no había oferta en su
  provincia.
- Había 66 slots de turnos disponibles ese día, sin reservas.
- **Cero eventos de pago**: nadie llegó al checkout.

Los pacientes entraron y se fueron porque no había con quién atenderse. Es el
problema de oferta, no de plataforma.

---

## Hallazgo abierto — la receta que la plataforma descarta en silencio

Al preparar el reembolso de un caso real apareció un agujero que sigue vivo.

`WorkspaceConsulta.tsx` (línea ~1404 y ~1528):

```ts
const sinCuil = receta.trim() && !consulta.paciente_cuil;
...
if (receta.trim() && !sinCuil) docs.push({ tipo: "receta", contenido: receta.trim() });
```

Si el profesional escribió una receta y el paciente **no tiene el CUIL cargado en
ese momento**, la receta se descarta: los demás documentos salen normalmente, el
borrador se limpia igual, y **nadie se entera**. Ni el profesional ni el paciente.

Caso real medido (23/07): la profesional generó la evolución 14:25:46, finalizó
14:25:58, y salieron **indicaciones + certificado + orden, los tres firmados**.
La receta, no. El borrador quedó vacío.

**Qué está probado y qué es inferencia** — importa, porque de esto depende qué se
le dice a una profesional real:

- PROBADO: los tres documentos salieron bien y la receta no. El borrador se
  limpió igual.
- PROBADO (con grupo de control): la evolución de esa consulta tiene dosis
  numérica y frecuencia ("cada N horas"), señales que la plantilla auto-compuesta
  NO produce sola. En las 6 consultas reales que SÍ emitieron receta, las 6
  tienen esa señal; de las 4 que no emitieron, solo esta la tiene. O sea: hay
  medicación indicada sin receta emitida.
- INFERENCIA, no medida: que la causa haya sido el CUIL faltante. El guard
  `sinCuil` es el único camino del código que descarta una receta escrita, y
  existe desde el 18/04 —o sea que estaba vivo ese día—, pero `pacientes` no
  tiene `updated_at`, así que **no se puede probar** que el CUIL faltara en ese
  momento. Hoy el paciente sí lo tiene.

Dos cosas que sí se sostienen:

1. **No hay evidencia de que el profesional haya hecho algo mal.** Cerró, la
   emisión funcionó, tres documentos salieron firmados.
2. **El texto no está perdido**: vive en la evolución, y desde el PR #369 el
   profesional puede volver a la atención cerrada y emitir la receta que faltó.

Qué falta arreglar: que el descarte deje de ser mudo. O se frena antes de
finalizar (pidiendo el CUIL, como ya hace el modal de cobertura), o se avisa
explícitamente que la receta no salió y por qué.

## Dos casos distintos que NO hay que confundir

Aparecieron dos atenciones reales cobradas con documentación faltante, y tienen
causas y montos distintos:

| | 09/06 | 23/07 |
|---|---|---|
| Borrador con contenido | **sí** | no |
| Documentos entregados | **cero** | tres (indicaciones, certificado, orden) |
| Qué faltó | todo | la receta |
| Lectura | se escribió y no se entregó nada | se entregó casi todo, faltó una pieza |

Son fallas diferentes. La primera es la que motivó el sprint de rescate del
borrador; la segunda es el hallazgo abierto de la receta. Mezclarlas lleva a
decirle a un profesional algo que no hizo.

## Lo que quedó pendiente

1. **Arreglar el descarte mudo de la receta sin CUIL** (ver arriba). Es lo más
   importante de esta lista: sigue vivo y pierde recetas sin que nadie lo note.
2. **Reembolso del caso del 23/07** — decisión tomada por Diego: se le devuelve al
   paciente y **la plata sale de Docto, no de la profesional**. Ojo con la
   mecánica: un refund estándar de Mercado Pago le saca a ella su neto, que es
   justo lo que no se quiere. Ver "Mecánica del reembolso" abajo.
3. **Aviso a la profesional de ese caso** — el mensaje NO puede decir que abandonó
   la consulta: la evidencia muestra lo contrario. El texto lo aprueba Diego.
3. **Aviso a los 4 profesionales del sellado diferido** — la deuda está anotada en
   `sellado_diferido_avisos` (4 filas, `enviado_at` NULL). El texto lo aprueba Diego.
4. **Oferta médica** — 0 médicos con CI prendida; 13 aprobados trabados por
   identidad (12 nunca arrancaron la biometría, 1 rechazado). Es la palanca grande.
5. **UX menor** — si un paciente con consulta activa vuelve al triage, el
   formulario se queda mudo en loop en vez de llevarlo a su sala de espera.

## Nota de proceso

Durante el sprint se empujó un commit vacío directo a `main`, salteando la
protección de rama: un comando buscaba un worktree que no existía y el `cd` no
ocurrió, así que el push salió desde el repo principal. Sin cambios de código,
pero saltó el gate. Queda registrado acá porque la regla es cero bypass.

También: tres veces un loop de merge reportó "MERGEADO" sin leer el resultado real
de `gh pr merge`. Los PRs quedaron abiertos y se detectó al verificar `main`. El
loop se corrigió para leer el estado real; la lección es no confiar en un eco que
no comprueba nada.

---

## Mecánica del reembolso cuando la falla es de la plataforma

Caso del 23/07: cobrado $50.000, comisión de Docto $2.500 (5%), neto de la
profesional $47.500.

| Opción | Paciente | Profesional | Docto |
|---|---|---|---|
| Refund total por Mercado Pago | recupera $50.000 | **pierde $47.500** | pierde la comisión |
| Docto le paga al paciente aparte | recibe $50.000 | conserva $47.500 | pone $47.500 de su bolsillo |

La decisión de Diego (09/08) es la segunda: **la plata sale de Docto**. La
profesional no puede quedar castigada por una falla de la plataforma, y el refund
automático de MP hace exactamente eso — por eso este caso NO va por la cola de
`refunds_pendientes`.

Queda registrado como precedente: cuando el motivo del reembolso es una falla
nuestra, el refund no puede tocar el neto del profesional.
