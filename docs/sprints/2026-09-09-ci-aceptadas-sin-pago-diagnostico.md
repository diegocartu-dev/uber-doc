# 09/09/2026 — CI aceptadas que nunca se pagan: diagnóstico contra producción

**Disparador.** En el Historial del admin (03–09/09) aparecían 5 consultas
inmediatas canceladas y ni una completada. Sospecha de Diego: "tenemos un
grave problema en Mercado Pago, o en esa última parte de la gestión".

**Resultado en una línea.** Mercado Pago y el checkout no fallaron: **ninguno
de los 4 pedidos aceptados llegó a apretar Pagar**. El tramo que se cae es
*aceptación → pago*: en 3 de 4 el paciente ya no estaba en la sala cuando el
profesional aceptó; en 1 de 4 estaba, con el botón de pago a la vista, y no
pagó. Todo lo de abajo es lo que se verificó para afirmarlo, en el orden en
que se verificó. Sin nombres ni identificadores: el repo es público.

## 1. Las filas (base de producción)

| Caso | Pedida | Aceptada | Pago | Cierre |
|---|---|---|---|---|
| A (07/09, mañana) | sí | 1 min después | ninguno | la canceló el profesional 62 min después de aceptar |
| B (08/09, 08:01) | sí | 25 s después | ninguno | la canceló el profesional 29 min después |
| C (08/09, 10:40) | sí | 4 min después | ninguno | la canceló el profesional **22 s** después |
| D (09/09, 12:04) | sí | 1,5 min después | ninguno | la canceló el profesional 15 min después |
| E (08/09, 11:47) | sí | nunca | — | la retiró el paciente 16 s después de pedirla |

Los 4 aceptados tienen `aceptada_at`, `resuelta_por='medico'`,
`resolucion_motivo='cancelo_profesional'`, y `pago_id`, `mp_status` y `monto`
en NULL. Tres profesionales distintos, cuatro pacientes distintos, todos
cuentas reales, registrados entre 1 y 14 minutos antes de pedir (misma
antigüedad que los pacientes de las CI que SÍ se pagaron la semana anterior).

## 2. Mercado Pago: descartado con evidencia

- `medicos_mp_accounts` de los 3 profesionales: `estado='activo'`,
  `expires_at` en 2027, `site_id='MLA'`, `live_mode=true`.
- Tokens desencriptados con la clave de producción y probados contra
  `GET https://api.mercadopago.com/users/me`: **HTTP 200, `status: active`,
  país AR, las tres cuentas.** (No se creó ninguna preferencia de prueba
  sobre cuentas reales.)
- Flag `pago_marketplace` activo sin cambios desde el 10/06. Variables MP en
  Vercel sin cambios en 4 meses. Cron `renovar-tokens-mp` en `ok`.
- Con el token de uno de estos mismos profesionales se creó una preferencia
  real y se cobró una CI el 01/09 (registro `[MP-V2] Preferencia creada` en
  los logs, webhook `approved` 24 s después).

## 3. El checkout nunca se invocó

En los logs de Vercel de las cuatro ventanas (pedido → cancelación) **no hay
ni un `POST /api/pago/crear-v2`**. En las tres CI pagas usadas de control
(23/08, 27/08, 01/09) el POST está, entre **11 y 38 segundos** después de la
aceptación, seguido del webhook `approved`.

## 4. Dónde estaba el paciente (polls de la sala de espera)

La sala pregunta `/api/consulta-estado` cada 5 s mientras la pestaña está
viva. Ese ritmo, en los logs, dice si el paciente estaba mirando.

- **Controles pagos:** polls continuos desde que entró hasta la aceptación
  (1 a 3,5 minutos), y Pagar a los 11–38 s.
- **A:** 2 polls (9 s), después `GET /triage` (volvió atrás) y nada más. La
  aceptación llegó 1 minuto después a una pestaña que ya no existía.
- **B:** polls continuos 2,5 minutos. La aceptación fue a los 25 s: la
  pantalla tuvo el botón "Pagar consulta" **~2 minutos con el paciente
  presente**, sin ningún POST de pago. Recargó la sala 10 minutos después
  (3 polls, 15 s) y se fue. Reapareció 30 minutos después, ya cancelada, y
  eligió un turno con otro profesional desde el menú de rescate (tampoco lo
  pagó).
- **C:** polls continuos 4 minutos. El profesional aceptó y canceló **22 s
  después** — menos que lo que tardaron en pagar los tres controles. El
  paciente vio el rescate 2 s después de la cancelación, eligió un turno con
  otro profesional, volvió a la clínica, eligió de nuevo al mismo profesional y
  se frenó en los términos.
- **D:** 3 polls (15 s) y se fue. El mail de aceptación —nuevo desde el 08/09—
  salió y Resend lo marcó `delivered` en el mismo segundo de la aceptación. No
  volvió en los 15 minutos que el profesional esperó. Ninguno de los 5
  pacientes tiene suscripción push.

## 5. La sala de espera funciona (prueba real)

Con cuentas test en `www.docto.com.ar`: paciente test en su sala, la
aceptación escrita en la base (mismo `UPDATE` que hace `aceptarConsulta`).
En menos de 10 s la pantalla pasó a **"Falta un paso: pagá tu consulta"** con
el botón; el botón llamó a `crear-v2` (503 por cuenta test, por diseño) →
`simular` → `info-medica`. Consola sin errores. Chromium de escritorio; **no
se probó en un teléfono real** (los logs no traen user-agent).

## 6. Lo que sí está roto o falta

1. **`permiso_notificaciones` se descartaba** (bug). El triage lo emite desde
   el 08/09, pero el endpoint `/api/funnel/track` no lo tenía en su whitelist:
   el POST llegaba con 200 y se tiraba. Cero filas. → **Corregido en este
   cierre.**
2. **`pago_intento` se emitía después de los gates** (bug del fix del 08/09).
   Cuenta de test, flag apagado, sin cuenta MP o sin token cortaban el
   request antes de registrar el intento: un 503/422 seguía sin dejar rastro,
   que era el hueco que el evento vino a cerrar. → **Movido antes de los
   gates + `pago_rechazado` con motivo en cada corte. Corregido.**
3. **Aceptar rebota al profesional.** El dashboard lo manda al workspace y el
   workspace lo devuelve al dashboard porque solo abre `pagada`/`en_curso`
   (`GET workspace` → `GET /dashboard` en el mismo segundo, en los 4 casos y
   en los 3 controles). Queda frente a una tarjeta naranja "ESPERANDO PAGO"
   con un botón "Cancelar consulta". Uno canceló a los 22 s. *Decisión de
   producto pendiente.*
4. **Una CI aceptada sin pagar no tiene plazo.** `resolver-consultas-vencidas`
   mira `pagada`/`en_curso`; `sin-respuesta` mira `esperando`. Nadie mira
   `aceptada`: el profesional espera hasta que cancela a mano (15, 29 y 62
   min). *Decisión de producto pendiente.*
5. **Nada trae de vuelta al paciente que se fue.** Mail desde el 08/09 (D lo
   recibió y no volvió), push sin permiso en los 5, WhatsApp al paciente no
   existe. *Decisión de producto pendiente.*

## 7. Qué NO se verificó

- Dispositivo y navegador de los pacientes.
- La sala en un teléfono real.
- Creación de una preferencia real de MP con el token de un profesional (se
  evitó tocar cuentas reales).

## 8. Herramienta: `vercel logs` (para la próxima)

La CLI devuelve como máximo **50 filas únicas por llamada**, cada una repetida
20 veces, sin importar `-n`. Para reconstruir una ventana hay que pedir
**minuto a minuto** y deduplicar por `id`; los minutos con más de 50 requests
quedan truncados igual. Los logs del 01/09 seguían disponibles el 09/09.

## 9. Cierre 10/09 — decisión y lo que quedó en producción

**Decisión de Diego (10/09, madrugada):** la lógica NO cambia (pide → acepta →
paga → ambos entran). Lo que falta es (a) la caja negra de la pantalla del
paciente, primero, y (b) un WhatsApp al paciente en el momento de la aceptación.

**(a) Caja negra — en producción** (commit `720de6f`, migración del CHECK de
`eventos_funnel` aplicada antes del deploy):
- `pago_vista`: el paciente VIO el botón de pagar (una vez por carga).
- `pago_toque`: TOCÓ el botón. Por beacon, antes de cualquier otra cosa.
- `pago_intento` (servidor) pasa a emitirse antes de los gates; cada gate que
  corta emite `pago_rechazado` con motivo.
- `error_cliente`: excepciones, promesas rechazadas, fallos del poll y del pago
  en la sala, y el error boundary global, con texto limpio y tope por carga.

Verificado en producción con cuentas test en un Chromium real emulando iPhone
(Playwright): aceptación escrita en la base → la sala pasó a "Falta un paso:
pagá tu consulta" → toque → quedaron `pago_vista`, `pago_toque`,
`pago_intento` y `pago_rechazado` (motivo `cuenta_test`, por diseño) en ese
orden, y el navegador siguió a `info-medica`. Con esto, la próxima vez que un
paciente esté frente al botón y no pague, vamos a saber si tocó y qué error
tuvo su teléfono.

Nota de herramienta: el panel de navegador embebido, cuando está oculto, NO
ejecuta el JavaScript de la página (la sala quedó server-rendered, sin
hidratar, sin polls, durante minutos). Las pruebas de cliente se hacen con
Playwright/Chromium desde la raíz del repo, no con el panel oculto.

**(b) WhatsApp al paciente — en PR #491**, inerte hasta tres cosas: OK de Diego
al texto de la plantilla (el primer borrador copiaba del mail la frase "si pasa
demasiado tiempo, el profesional puede tomar otro paciente…", que Diego marcó
como anti venta; esa frase sigue en el mail de aceptación del 08/09), aprobación
de Meta, y la migración `20260910_whatsapp_envios_paciente.sql`.

## 10. Cierre 10/09, 01:00 — todo lo acordado, en producción

Orden de Diego (00:45): "terminalos, corré todo y deployá; no debe quedar ningún
PR ni deploy pendiente". Estado al cierre:

| Pieza | Dónde | Estado |
|---|---|---|
| Caja negra de la sala (`pago_vista`, `pago_toque`, `error_cliente`, `pago_intento` antes de gates) | main `720de6f` | en producción, probada con Chromium/iPhone |
| WhatsApp al paciente al aceptar (`avisarPacienteAceptadaWhatsApp`, columna `paciente_id`) | PR #491 → squash `f57e33d` | en producción, migración aplicada antes del deploy |
| ContentSid de la plantilla como constante (`PLANTILLA_PACIENTE_ACEPTADA`) | main `5c194e1` | en producción |
| Mail de aceptación sin la frase "si pasa demasiado tiempo…" (anti venta, Diego) | main `fc38c75` | en producción |
| Plantilla `docto_paciente_aceptada_v2` (UTILITY, botón "Pagar e ingresar" → `/sala-espera/{{3}}`) | Twilio `HX9265…5828` | creada y enviada a Meta 00:46; **aprobación pendiente de Meta** al momento de escribir esto |

**Prueba real del lado del profesional (01:58 UTC-3 = 00:58 AR):** login del
médico test por link, panel real, cartel de notificaciones cerrado con "Ahora
no", clic en Aceptar → la consulta pasó a `aceptada` y en `whatsapp_envios`
quedó la fila `paciente_aceptada` / `aceptacion_ci` / `sin_celular` con
`paciente_id` cargado y `medico_id` NULL. Es el resultado correcto: la cuenta
test no tiene teléfono. Cuando Meta apruebe, la misma línea manda el mensaje;
hasta entonces un paciente real con teléfono dejaría `error_twilio` con el
código de Twilio, visible en la tabla.

**Texto final de la plantilla (OK de Diego):** "Hola {{1}} 👋 {{2}} aceptó tu
consulta y te está esperando. Ya podés pagar e ingresar: tocá el botón para
volver a tu sala. / No respondas este canal: es solo de avisos. Escribinos a
soporte@docto.com.ar".

**Limitaciones del entorno que condicionaron el cierre:** el clasificador de
permisos bloqueó cargar la variable de entorno desde un script (por eso el
ContentSid va como constante, como los otros dos) y cambiar el teléfono de la
cuenta test al de Diego (por eso la prueba del envío real al celular queda para
después de la aprobación, con un envío directo por la API de Twilio).

## 11. 10/09 08:16 — el primer caso real con la caja negra puesta: consulta pagada y atendida

Una consulta inmediata real, pagada y completada, con toda la cadena registrada
por primera vez. Es el caso de control que faltaba, y confirma el diagnóstico:
**el paciente que está mirando la pantalla, paga en segundos.**

| Hora (AR) | Qué pasó | Fuente |
|---|---|---|
| 08:13:50 | eligió profesional | `medico_elegido` |
| 08:13:51 → 08:16:16 | términos → formulario → confirmación | `triage_paso` ×3 |
| 08:16:40 | permiso de avisos: **imposible, iPhone sin la app instalada** | `permiso_notificaciones` |
| 08:16:41 | pedido creado; WhatsApp al profesional | `whatsapp_envios` → **delivered** en 12 s |
| 08:18:06 | la profesional **aceptó** (1 min 25 s después del pedido) | `aceptada_at` |
| 08:18:06 | mail al paciente | Resend → **delivered** |
| 08:18:06 | WhatsApp al paciente | **undelivered, error 63016** (ver abajo) |
| 08:18:07 | **vio el botón de pago** (1 s después de la aceptación) | `pago_vista` |
| 08:18:11 | **tocó el botón** (5 s después de la aceptación) | `pago_toque` |
| 08:18:11 / :12 | llegó al servidor / preferencia creada en MP | `pago_intento`, `pago_creado` |
| 08:18:43 | **pago aprobado**: $20.000, comisión 5% ($1.000), neto $19.000 | `pago_aprobado`, webhook |
| 08:18:43 → 08:34:38 | consulta en curso, **15,9 minutos** | `en_curso_at`, `completada_at` |
| cierre | 3 documentos (certificado, indicaciones, receta), evolución validada, cerrada por la profesional | `documentos`, `evolucion_validada_at` |

Cero `error_cliente` en toda la sesión.

**Lo que este caso prueba.** La distancia entre la aceptación y el pago fue de
**37 segundos**, y entre el botón apareciendo y el dedo del paciente, **4
segundos**. Los cuatro casos caídos del 07 al 09/09 no fallaron en el pago:
fallaron porque cuando el profesional aceptó, el paciente ya no estaba en la
pantalla. Acá la profesional aceptó en 1 min 25 s y el paciente seguía ahí.

**El aviso por WhatsApp al paciente NO llegó — hallazgo real.** La fila quedó
`enviado` (Twilio aceptó la llamada) y el webhook de entrega la corrigió a
`undelivered` con **código 63016** de Twilio: mensaje de texto libre fuera de la
ventana permitida. La causa consistente con todo lo demás es que la plantilla
`docto_paciente_aceptada_v2` **sigue pendiente de aprobación en Meta** (creada
00:45, todavía `pending` a las 09:41): sin aprobación, Twilio la degrada a texto
libre y Meta la rechaza porque el paciente nunca escribió a ese número. Cuando
Meta apruebe, sale sola, sin tocar código. Si después de la aprobación volviera
a fallar, la causa sería otra y hay que volver a mirar.

**Esto es exactamente lo que el StatusCallback del 31/08 vino a evitar:** sin él,
la tabla diría `enviado` y habríamos creído que el aviso llegó. La regla
"un aviso enviado no es un aviso recibido" se verificó en vivo, en el primer
caso real.

**Nota:** los 26 `medico_elegido` repetidos sobre un mismo profesional entre el
09 y el 10/09 son de **una cuenta de prueba** (nunca llegó al triage), no un
paciente real trabado. El filtro de test de los reportes ya los excluye.
