# 12/10/2026 — El recordatorio de 10 minutos al paciente nunca existió

## Qué pasó

Un turno de la mañana del 12/10: el paciente había reservado y pagado, la
profesional recibió sus dos WhatsApp (el de la reserva y el de 15 minutos
antes) y esperó. El paciente no abrió la sala: ningún pedido con ese turno
en los logs de Vercel entre 20 minutos antes y 45 minutos después del inicio.
El turno se cerró como ausencia y la alarma de caídas sonó.

La profesional, además, no tenía en su pantalla nada que le dijera qué
faltaba: el botón «Iniciar turno» solo aparece cuando el paciente entra a la
sala, y el cartel naranja de "turno en N minutos" desaparecía justo a la hora.

## Diagnóstico (verificado, no supuesto)

- **El recordatorio de 10 minutos no corrió nunca.** La ruta
  `api/cron/recordatorios-10min` existía desde marzo, pero no estaba en
  `vercel.json`, así que Vercel no la invocaba. El watchdog no la esperaba y
  nadie supo que no corría. En `cron_runs` no tenía ni una fila.
- **Aunque hubiera corrido, buscaba tres horas tarde.** Usaba
  `new Date().getHours()` del servidor (UTC) contra `turnos.hora_inicio`
  (hora argentina). Probado contra la base: con la consulta vieja, a las 08:20
  argentinas el turno de las 08:30 no aparece; con la hora argentina, sí.
- **Mandaba solo push**, que no llega a quien no activó las notificaciones.
- **El recordatorio de 24 horas sí anda**, pero no alcanza a quien reserva el
  mismo día. Revisado en dos casos más (07/10 y 02/10): los dos pacientes
  pagaron el mismo día del turno (uno horas antes, otro media hora antes), así
  que el de 24 h no aplicaba y el de 10 min —el que les servía— no existía.

Mismo barrido, otros dos crons agendados que el watchdog no vigilaba:
`ci-aceptada-sin-pago` y `demo-cerrar-abiertas` (los dos latían bien).

## Qué se cambió

| Arreglo | Dónde |
|---|---|
| Recordatorio de 10 min: cada minuto, hora argentina, una sola vez (marca `turnos.recordatorio_10m_at`), push + mail, respeta lo que eligió el paciente; si eligió solo notificaciones y no tiene ninguna activa, va por mail | `lib/turnos/recordatorio-paciente.ts` (con test), `api/cron/recordatorios-10min`, `enviarEmailRecordatorio10m` |
| Raíz: ningún cron puede existir sin estar en `vercel.json`, en el watchdog con el mismo intervalo y con su ficha | `tests/unit/crons-agendados.test.ts`, `lib/crons-esperados.ts` |
| La agenda del profesional dice "<paciente> todavía no entró a la sala", que le avisamos por WhatsApp cuando entre y que si no entra el turno se cierra solo | `dashboard/AgendaHoy.tsx` |
| El recordatorio de 24 h calcula "mañana" en hora argentina (corrido a mano después de las 21:00 buscaba pasado mañana) | `api/cron/recordatorios` |
| El mail verde de "tarea recuperada" dice desde cuándo falló y, si la tarea no se recupera sola, que hay que revisar qué se perdió | `lib/cron-guard.ts` |

Migración aplicada en las dos bases: `20261012_turnos_recordatorio_10m.sql`.

## Barrido de agujeros de la misma familia

- **Avisos escritos y nunca llamados:** ninguno (todas las funciones
  `enviar*`/`avisar*`/`push*` de `email.ts`, `whatsapp.ts` y `push.ts`
  tienen al menos un llamado).
- **Variables de entorno que el código lee y producción no tiene:** las 16 que
  faltan tienen valor de respaldo en el código, son de la instancia
  institucional, las pone Vercel solo, o son del piloto en pausa. Ninguna
  apaga algo en silencio.
- **Hora del servidor contra hora argentina:** el único caso con impacto en
  pacientes era el del recordatorio de 24 h corrido a mano (arreglado). El
  resto de los usos ya convierte a hora argentina antes de comparar.

## Norma suprema (Diego, 12/10)

Desde hoy, lo terminado se impacta sin pedir permiso: migraciones aplicadas,
PR mergeado, deploy verificado en producción. Detalle en `CLAUDE.md`,
"Protocolo de sprint".

## Pendiente de Diego

- El caso del 12/10: reprogramar sin costo o devolver la consulta a cargo de
  Docto (si la falla es nuestra, la plata sale de Docto). El aviso que le
  faltó al paciente era nuestro.
- WhatsApp al paciente 10 minutos antes: necesita una plantilla nueva
  aprobada por Meta; el texto se le propone a Diego antes de pedirla.
