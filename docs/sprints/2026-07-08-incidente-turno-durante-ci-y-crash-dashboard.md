# Incidente 08/07/2026 — turno durante CI + crash del dashboard médico (cierre)

**Reporte de Diego (video + screenshot):** estando en una CI en curso, el paciente pudo reservar y pagar un turno con el mismo médico **para la misma hora** (slot de 11:40 comprado ~11:38) y entrar a la sala de espera — dos consultas simultáneas. Después, el dashboard del médico quedó muerto ("This page couldn't load") y seguía roto al re-verificar.

## Causas raíz (verificadas, no supuestas)

1. **Crash del dashboard (el más grave):** efecto legacy (30/03) en `AgendaHoy.tsx` hacía `new Notification(...)` cuando había un turno `en_espera` hoy. **En Chrome Android ese constructor tira `TypeError` SIEMPRE** (prohibido desde Chrome 42; en desktop funciona — por eso nunca se vio). Sin ninguna error boundary en la app, React desmontaba todo → página nativa muerta. La CI simultánea NO era causal: el disparador era *turno en sala de espera + permiso notificaciones granted + Chrome Android* — o sea, a cualquier médico Android se le moría el dashboard **justo cuando un paciente lo esperaba**. Precondiciones verificadas en DB prod (suscripción push FCM del médico test; turno `en_espera` desde 11:40:40; frame del error a las 11:42; seguía reproducible horas después porque el turno seguía `en_espera`). El error del lado del PACIENTE fue probablemente OOM del tab (WebRTC activo + navegación), sin bug de código.
2. **Reserva sin guards:** `reservarTurno` no validaba ni la hora del slot (server) ni atenciones activas del paciente con ese médico.
3. **Slots deshonestos:** el server ofrecía slots de hoy ya pasados; el cliente filtraba con `>=` y la **TZ del browser** (bug viejo conocido de la auditoría de agendas — ahora cerrado).

## Fixes (un PR por ticket, todos en prod 08/07)

- **#252** — eliminado el efecto `Notification` legacy (el aviso "paciente listo" ya lo cubren popup + push server-side del 07/06) + **error boundaries nuevas** `src/app/error.tsx` y `src/app/global-error.tsx` (UI Docto, botón Reintentar): cualquier crash futuro de esta clase deja de ser una página muerta. **NO reintroducir el constructor `Notification` en componentes** — usar `showNotification` del service worker.
- **#253** — guards server-side en `reservarTurno`: (a) rechazo de slot de fecha pasada o de HOY que empiece en ≤15 min (hora AR — margen decidido por Diego); (b) rechazo si el paciente tiene **atención activa con el MISMO médico** (CI esperando/aceptada/pagada/en_curso de las últimas 24 h, o turno en_espera/en_curso). Solo mismo médico (decisión Diego): agendar futuro con otro profesional sigue permitido. Cota de 24 h porque no existe cron que expire CI `esperando`/`aceptada` stale (falla permisiva). Dualidad de IDs respetada (`consultas.paciente_id=user_id`; `turnos.paciente_id=pacientes.id`). RLS verificada contra prod: el paciente puede contar sus propias filas → el guard es efectivo.
- **#254** — slots honestos: el server (`turnos/page.tsx`) ya no ofrece slots de hoy que empiecen en ≤15 min (hora AR); el cliente (`CalendarioTurnos`) pasa de `>=` + TZ del browser a `>` + **hora Argentina** (también el mes inicial del calendario). Margen 15 idéntico en las 3 capas (page/action/cliente).

## Gates
Roberto: **APROBADO los 3**, con RLS/policies y grants verificados contra producción. Sus observaciones aplicadas (cota 24 h) o registradas abajo.

## Deuda registrada (no urgente)
- **Cron de expiración de CI `esperando`/`aceptada` stale** (hoy `cerrar-huerfanas` solo toca `en_curso`/`pagada`). Con el guard nuevo, el dato stale pasó de inofensivo a molesto (mitigado por la cota 24 h).
- `confirmarPagoTurno` no re-chequea la hora al confirmar (un pago lento puede confirmar ~1 min antes del inicio).
- Centralizar `ahoraAR()` + `MARGEN_MIN` en `src/lib/` (hoy duplicado en 3 archivos).
- `AgendaHoy` se monta 2 veces (grid desktop + stack mobile, CSS oculta pero React monta) → intervals duplicados.
- CI E2E corre solo chromium desktop — este crash era Android-only e invisible para Playwright (refuerza el pendiente `mobile-safari`/device testing pre-F&F).

---

# Parte 2 (mismo día) — resolución de turnos vencidos + salida del médico (#256)

**Reporte de Diego (video 2 + captura):** el turno colgado `en_curso` de la prueba solo se podía "completar" (paciente pagó sin recibir nada, sin reembolso) y el turno de las 12:00 que nadie tomó seguía vigente a las 17:00. El motor existente solo cubría `en_espera`, con 1 h de gracia, una vez al día (02:59).

## Decisiones de Diego
- `en_espera` + **20 min del inicio** → `ausente_medico` + reembolso, **salvo que el médico esté atendiendo** a otro paciente (CI o turno `en_curso`) — en ese caso la espera es legítima y a la sala de espera se le informa ("está atendiendo otra consulta — tu turno sigue reservado").
- `confirmado` que **nadie** tomó + **20 min del fin** → `ausente_paciente`, **SIN reembolso** (ganancia del médico), medible en reportes como consulta no realizada.

## Qué quedó en prod (#256)
- Cron **`resolver-turnos-vencidos`** cada 10 min (el diario 02:59 queda de backstop). `resolverAusentePaciente()` nueva; sin migración de estados (ya existían en el CHECK).
- **Botón del médico "No pude atender este turno"** en la card TURNO EN CURSO → dialog inline → cancela + reembolso completo ("no se te paga; queda registrada"). `cancelarTurnoPorMedico` acepta `en_curso`.
- Sala de espera del paciente: banner médico-ocupado, terminal "El médico no pudo atenderte" **sin auto-redirect** (botón Volver al inicio), copys gate Sofía (sin "El Dra.", "Te devolvemos el pago completo" presente-neutro, mensaje al ausente con hecho verificable + recurso a soporte).
- Carreras (gate Roberto): poll de `SalaConsultaPaciente` converge también en cancelación (no solo Realtime); guards de estado en TODOS los UPDATEs de cancelación; sin doble refund (idempotency key MP compartida + anti-over-refund + guards — verificado en 3 capas).
- **CRÍTICO cerrado:** `marcar_ausente_paciente()` y `expirar_turno(uuid)` eran ejecutables por PUBLIC/anon/authenticated vía PostgREST — con la política nueva, un médico podía anular el reembolso de su paciente con un POST anónimo. `REVOKE` aplicado y verificado en prod (`20260708_revoke_rpc_turnos.sql`); cierra también el backlog `project_backlog_rpc_revoke`.

## Decisiones pendientes (próximo sprint, anotadas por Roberto)
- Ventana efectiva del botón en desconexión total: el auto-cierre del rejoin marca `completado` a los 2 min — el caso que motivó el botón puede escapársele. ¿Extender la ventana / permitir cancelar post-cierre?
- `ausente_paciente` bypasseable: un paciente que entra 1 segundo a la sala queda `en_espera` para siempre (cobra reembolso a inicio+20 aunque no vuelva). ¿Gatear la entrada a T-15 min o exigir presencia reciente?
- Patrón claim-first (UPDATE antes del refund) en `cancelarTurnoPorMedico`/`resolverNoShowMedico` — elimina el refund huérfano de ventana ~1-2 s.
