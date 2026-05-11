# Auditoría de Seguridad — Sprint MP Marketplace Fase 1

**Auditor:** Roberto (QA/Seguridad)
**Fecha:** 2026-05-11
**Veredicto:** APRUEBA (tras fix migración 055)

---

## Archivos auditados

1. `src/app/api/mp/oauth/start/route.ts`
2. `src/app/api/mp/oauth/callback/route.ts`
3. `src/app/api/mp/oauth/disconnect/route.ts`
4. `src/lib/mp-crypto.ts`
5. `supabase/migrations/054_medicos_mp_accounts.sql`
6. `supabase/migrations/055_fix_medicos_mp_accounts_rls.sql` (fix)

---

## Resultados por criterio

| # | Criterio | Resultado |
|---|----------|-----------|
| 1 | Tokens encriptados AES-256 en DB | PASA |
| 2 | Secrets solo en Vercel env vars | PASA |
| 3 | State CSRF one-time use | PASA |
| 4 | RLS medicos_mp_accounts | PASA (tras fix 055) |
| 5 | Validación sesión + rol médico | PASA |
| 6 | Logs sin tokens/secrets | PASA |
| 7 | Aislamiento entre médicos | PASA |
| 8 | Service role server-only | PASA |
| 9 | Pagos existentes intactos | PASA |

---

## Detalle

### 1. Tokens encriptados AES-256 — PASA
`mp-crypto.ts:1` usa AES-256-GCM con IV aleatorio + auth tag. `callback/route.ts:98-99` encripta ambos tokens antes del UPSERT.

### 2. Secrets solo en env vars — PASA
`MP_CLIENT_SECRET` y `MP_TOKEN_ENCRYPTION_KEY` accedidos via `process.env`. No hay valores hardcodeados. `.gitignore` excluye `.env*`.

### 3. State CSRF one-time — PASA
`start/route.ts:28` genera con `randomBytes(32)`. `callback/route.ts:19-23` valida contra DB + expiración. `callback/route.ts:36` borra inmediatamente (one-time).

### 4. RLS — PASA (tras fix)
**Hallazgo original:** policy usaba `medico_id = auth.uid()` (incorrecto).
**Fix:** migración 055 corrige a `medico_id = (SELECT id FROM medicos WHERE user_id = auth.uid())`.

### 5. Validación sesión + rol — PASA
`start/route.ts:8-26` y `disconnect/route.ts:6-25` validan sesión + rol médico. `callback/route.ts` usa state CSRF vinculado a medico_id (patrón OAuth estándar).

### 6. Logs limpios — PASA
8 `console.error` revisados. Ninguno loguea tokens, secrets, state ni code.

### 7. Aislamiento entre médicos — PASA
RLS corregida + no hay policy INSERT/UPDATE/DELETE para `authenticated`. Solo service_role escribe.

### 8. Service role server-only — PASA
`SUPABASE_SERVICE_ROLE_KEY` sin prefijo `NEXT_PUBLIC_`. Endpoints son server-side route handlers.

### 9. Pagos intactos — PASA
`git diff main` vacío para `src/app/api/pago/route.ts`, `webhook/route.ts`, `simular/route.ts`.
