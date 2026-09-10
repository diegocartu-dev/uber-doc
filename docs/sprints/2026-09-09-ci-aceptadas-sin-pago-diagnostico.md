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
