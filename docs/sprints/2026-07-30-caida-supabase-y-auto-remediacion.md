# Caída de Supabase 30/07/2026 (~28 min) + auto-remediación

## Cronología (hora argentina)

| Hora | Qué |
|---|---|
| ~17:15 | La instancia de base de datos de Supabase (proyecto Docto, sa-east-1) deja de responder. PostgREST, Auth y Storage UNHEALTHY; el control plane la sigue reportando ACTIVE_HEALTHY (instancia colgada) |
| 17:18→17:41 | **Tormenta de alertas**: cada cron que toca la base falla y manda su rojo (el throttle de 6 h TAMBIÉN se lee de la base → ilegible → sin throttle) |
| 17:26 | Diego ve el 504 MIDDLEWARE_INVOCATION_TIMEOUT en el celu; 17:32 el login falla ("Load failed") |
| 17:30-36 | Diagnóstico: sitio "responde" pero PostgREST timeout total; salud por servicio: db/rest/auth/storage UNHEALTHY. Se descarta pago/facturación (proyecto activo). Coincide con incidente abierto en status.supabase.com |
| 17:36 | Diego autoriza el **restart del proyecto** vía Management API |
| 17:43:23 | La base vuelve. Todos los servicios ACTIVE_HEALTHY |
| 17:47 | Verificación: 0 pacientes colgados, cron de avisos 200, E2E login+clínica 2/2 (tras un retry por warmup) |

## Causa raíz
Instancia de Postgres colgada del lado de Supabase (incidente de plataforma).
La firma: sonda de datos muerta + control plane reportando "sana". El restart
del proyecto la resolvió — no hizo falta esperar a Supabase.

## Lo que el incidente enseñó (fixes en PR #321)

1. **El monitor de uptime era ciego a esta caída**: probaba URLs que responden
   rápido sin tocar la base. → Sonda de base real (SELECT liviano, timeout 8 s)
   en cada chequeo del minuto.
2. **Auto-reinicio** (pedido Diego: "¿y si no estoy con la compu?"): si la
   sonda de base falla y el control plane la cree sana → restart automático
   vía Management API. Frenos: doble verificación en /health, solo con status
   ACTIVE_HEALTHY, máx. 1 intento/5 min, mail "🔁 auto-reinicio disparado".
   Requiere SUPABASE_ACCESS_TOKEN en Vercel prod (cargada 30/07).
3. **Anti-tormenta**: si el estado de alertas es ilegible (base caída) o
   uptime-estado=down, los crons individuales SE CALLAN; el monitor de uptime
   es la única voz (rojo con freno sin-estado minuto%15, verde al volver).

## Runbook manual (si el auto-reinicio no alcanza)
- Salud por servicio: `GET api.supabase.com/v1/projects/irpupskopjahbqqvckue/health?services=db,rest,auth,storage`
- Restart: `POST .../restart` (token en .env.local SUPABASE_ACCESS_TOKEN)
- Sonda directa: `GET https://irpupskopjahbqqvckue.supabase.co/rest/v1/medicos?select=id&limit=1` con anon key
- Desde el celu: claude.ai/code → "investigá la caída"
