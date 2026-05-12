# Backlog — Sprint MP Fase 1 (sugerencias post-auditoría Roberto)

**Fecha:** 2026-05-12
**Origen:** Auditoría GATE 4, Roberto QA/Seguridad

---

## 1. trackEvent fire-and-forget en callback

- **Archivo:** `src/app/api/mp/oauth/callback/route.ts`
- **Problema:** Los 9 `await trackEvent(...)` agregan latencia al redirect (cada uno es un INSERT a Supabase)
- **Fix:** Cambiar a `void trackEvent(...)` para no esperar la respuesta
- **Prioridad:** Backlog Fase 2/Fase 3
- **Riesgo de no hacerlo:** Milisegundos extra en el redirect OAuth — imperceptible con volumen actual

## 2. Limpieza de mp_oauth_state expirados

- **Tabla:** `mp_oauth_state`
- **Problema:** Los states con TTL expirado (>10 min) quedan en la tabla indefinidamente
- **Fix:** Agregar Vercel Cron o pg_cron que limpie states viejos periódicamente
- **Prioridad:** Sprint Cron Fase 3 (junto con limpieza de consultas huérfanas)
- **Riesgo de no hacerlo:** Tabla crece lentamente — con volumen actual (pocos médicos) es irrelevante

## 3. IF NOT EXISTS en migración 056

- **Archivo:** `supabase/migrations/056_eventos_funnel.sql`
- **Problema:** Usa `CREATE TABLE` plano en vez de `CREATE TABLE IF NOT EXISTS` como patrón de 054
- **Decisión de Diego:** NO SE APLICA — las migraciones se ejecutan una sola vez secuencialmente
- **Estado:** Cerrado (no requiere acción)
