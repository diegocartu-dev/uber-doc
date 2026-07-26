# Caso 24-25/07/2026 — Reprogramación de turno por el médico sin aceptación del paciente

## Qué pasó (todo hora argentina)

| Cuándo | Qué |
|---|---|
| 22/07 20:36 | Paciente Glauciana D.S.A. reserva turno con la Dra. Alexandra Almeida Midlej para el **24/07 14:30** ($50.000) |
| 24/07 09:28 | Pago acreditado: $47.500 netos al MP de la médica, $2.500 Docto |
| 24/07 09:57 | La médica mueve el turno **14:30 → 16:00** vía Nova |
| 24/07 13:18 | Lo mueve de nuevo: **16:00 → 17:30** |
| 24/07 14:33 | La paciente entra a la plataforma (su horario original era 14:30), no encuentra su turno e intenta una CI con otro médico (Gabriel Ferreira) que también queda cancelada sin pago |
| 24/07 17:30–18:00 | La médica espera conectada; la paciente no vuelve |
| 24/07 18:20 | El cron marca `ausente_paciente` (correcto según su regla: hora_fin + 20 min) → **sin reembolso** |
| 24/07 17:44 y 17:53 | La médica escribe al WhatsApp de avisos ("Quiero hablar con una persona") — canal solo-envío, nadie lee |
| 24/07 19:34 | Mail de la médica a soporte reclamando por la ausencia y preguntando por su saldo |

## Causa raíz

La acción `reprogramar_turno` de Nova (médico) movía un turno **pago** sin
ninguna aceptación del paciente, avisándole solo por mensaje interno de la
plataforma (ni mail, ni WhatsApp, ni push), sin límite de veces ni
anticipación mínima. La penalidad del no-show (`ausente_paciente` sin
reembolso) la pagaba el paciente aunque el horario se lo hubieran cambiado
el mismo día. Nova además le decía al médico "el paciente fue notificado".

## Decisión (Diego, 25/07)

**Un médico NO puede reprogramar un turno pago sin la aceptación del
paciente. Punto.** Como el flujo de aceptación no existe, la capacidad se
eliminó entera.

## Fixes aplicados

- **PR #303** (en prod 25/07): tool `reprogramar_turno` eliminada de Nova
  (chat + prompt) y bloqueada en `nova/confirmar` como defensa en
  profundidad. Nova ahora explica la regla y ofrece cancelar (reembolso
  completo) o soporte@. El RPC `reprogramar_turno_medico` ya estaba
  restringido a service_role (verificado: sin acceso anon/authenticated),
  no requirió migración. La reprogramación DEL PACIENTE (crédito de
  cancelación, máx. 2) no se tocó.
- **Plantillas WhatsApp v2** creadas y enviadas a aprobación de Meta
  (25/07): mismas plantillas de aviso + cierre *"No respondas este canal:
  es solo de alertas de turnos. Escribinos a soporte@docto.com.ar"*.
  SIDs: `HX25f4187f6a159560fe86ed3087ceb8ca` (aceptar_paciente_v2),
  `HX8023671239ec07bdd66e6e238438b81b` (paciente_esperando_v2). Al
  aprobarse, cambiar las constantes en `src/lib/whatsapp.ts`.

## Hallazgos anexos (pendientes)

1. **Datos del pago partidos al reprogramar**: el RPC movía `pago_id` a la
   fila nueva pero `mp_status`/`mp_application_fee`/`mp_net_amount_medico`
   quedaban en la original. Con la capacidad bloqueada no se generan casos
   nuevos; los 3 turnos históricos del 24/07 quedan como están.
2. **`turnos.paciente_id` apunta a `pacientes.id`** en este caso (no a
   `user_id` como en consultas) — revisar la doctrina de joins
   (memoria `project_esquema_atenciones_insights`) cuando se toque turnos.
3. **WhatsApp de avisos era un pozo ciego**: los médicos responden ahí y
   nadie lee (la Dra. escribió 3 veces). Mitigación: pie "no responder" en
   v2. Queda pensar si algún día hay atención humana por ese canal.

## Resolución (Diego, 25/07 — ejecutada esa misma noche)

- **Reembolso TOTAL a la paciente: EJECUTADO** (~23:55 ART del 25/07).
  Mecanismo: fila en `refunds_pendientes` (tipo `turno`, pago
  `170311817924`, neto médico $47.500 + fee $2.500) + disparo manual del
  cron `reintentar-refunds` con `CRON_SECRET` → `resueltos: 1`. El refund
  total revierte en una llamada la parte de la médica Y el fee de Docto.
  Regla confirmada por Diego: si el cambio de horario no fue aceptado por
  el paciente, el médico pierde el cobro ("se jode").
- **Mail de resolución a la Dra. Almeida Midlej: ENVIADO** (Resend
  `9b165e9e`): reembolso realizado porque la paciente no aceptó el cambio
  de horario; regla "los turnos otorgados no se reprograman porque el
  proceso de cobro ya está realizado — solo el paciente puede"; su saldo
  real ($47.500 de la consulta del 23/07, ya en su MP, liberación según
  calendario de MP); soporte SIEMPRE por soporte@docto.com.ar.
- **PR #304**: Nova responde con el copy exacto de la regla a cualquier
  médico que quiera modificar un turno.
- Queda para spec (Sofía/Elena, sin fecha): flujo médico **propone** nuevo
  horario → paciente **acepta** → recién ahí se mueve el turno.
