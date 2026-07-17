# Incidente 17/07/2026 — Outage total de API/Auth por agotamiento del compute de Supabase (1 GB)

## Resumen

**Downtime: ~4 horas (05:31 → ~09:35 ART).** PostgREST (todo el acceso a datos) y GoTrue (login/registro/sesiones) colgados por agotamiento de recursos de la instancia mínima de Supabase (sin addon de compute = ~1 GB RAM compartida entre Postgres + PostgREST + GoTrue + Realtime + pooler). **Postgres nunca se cayó — cero pérdida de datos.** Impacto usuario: sitio inutilizable (páginas estáticas cargaban; nada con datos ni login funcionaba). Ocurrió en la ventana de mínimo tráfico.

## Detección — el watchdog funcionó

La inversión del sprint de fallas silenciosas (13/07, #260) pagó: los mails de `Docto Alertas` ("cron repush-esperando terminó con HTTP 500") fueron la señal. Sin watchdog, esto seguía invisible hasta la queja de un usuario. Notas:

- Los crons de Vercel siguieron ejecutándose; sus queries morían por timeout → HTTP 500 → alerta de `withCron`.
- El anti-spam de 6 h no pudo frenar los mails: su propio registro (`cron_runs`) necesita la DB caída. Aceptable — en outage total, más mails es mejor que menos.
- El panel de Supabase reportaba `ACTIVE_HEALTHY` mientras `GET /health?services=rest,auth` daba `UNHEALTHY`: los servicios estaban zombies, no formalmente caídos.

## Línea de tiempo (ART)

| Hora | Evento |
|---|---|
| 05:31 | Último latido de TODOS los crons en `cron_runs` (la escritura del heartbeat dejó de llegar) |
| 07:41+ | Mails de alerta del watchdog a Diego (varios, HTTP 500 en crons) |
| ~09:20 | Diego reporta las alertas; diagnóstico: REST+Auth timeout, DB sana, plataforma Supabase sin incidentes → problema del proyecto |
| ~09:31 | **Restart del proyecto** vía Management API (OK de Diego) |
| ~09:34 | REST y Auth responden 200; página con datos en prod verifica 200 |
| ~09:45 | **Upgrade de compute a Small (2 GB, ~US$15/mes)** vía Management API (OK de Diego) — solución de fondo |

## Causa raíz

Proyecto **sin addon de compute** (`selected_addons: []`): la instancia por defecto (~1 GB RAM) sostenía toda la producción. Al crecer la actividad (testing intensivo de 3 días, generación de agendas con cientos de slots, ~212 sesiones acumuladas, crons cada 10 min, Realtime multi-dispositivo), la presión de memoria colgó los servicios laterales; Postgres (proceso protegido) sobrevivió. Los gráficos de RAM/CPU del periodo están en Supabase → Reports → Infrastructure.

## Remediación

1. **Inmediata:** restart del proyecto (Management API `POST /restart`) → servicios de vuelta en ~3 min.
2. **De fondo:** upgrade del compute a **Small (2 GB, 2 cores, 90 conexiones directas, ~US$15/mes)**. Revisar escalón cuando haya volumen real (Medium 4 GB ~US$60/mes).

## Verificación post-recuperación

- PostgREST 200 estable (3 pruebas: 1.1s → 0.4s → 0.1s), GoTrue health 200, Realtime healthy.
- `/dr/[slug]` (página con datos reales en prod): HTTP 200.
- Latidos de `cron_runs` reanudados tras el reinicio (verificado con el tick siguiente).

## Lecciones / follow-ups

- **El watchdog es la única razón por la que esto se detectó en horas y no en días.** Mantenerlo sagrado.
- El chequeo de salud "13/13 crons ok" mira `last_status`, que queda congelado si la DB no recibe escrituras — un chequeo de frescura (`last_run_at` vs ahora) distingue "ok viejo" de "ok vivo". El watchdog ya alerta por frescura; cualquier reporte manual debe mirar `last_run_at`, no `last_status`.
- Considerar alerta externa de disponibilidad (ping a `/rest/v1/` cada 5 min desde fuera, p. ej. UptimeRobot gratuito) para detectar outages de plataforma sin depender de los propios crons del proyecto.
