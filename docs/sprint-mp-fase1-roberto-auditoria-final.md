# Auditoria Final GATE 4 -- Sprint MP Marketplace Fase 1

**Auditor:** Roberto (QA/Seguridad)
**Fecha:** 2026-05-12
**Tipo:** Auditoria de seguridad pre-merge a main
**Base:** Auditoria 1 (2026-05-11) + Ola 1 E2E (7/7 passed)

---

## Archivos auditados

1. `src/app/api/mp/oauth/start/route.ts`
2. `src/app/api/mp/oauth/callback/route.ts`
3. `src/app/api/mp/oauth/disconnect/route.ts`
4. `src/app/api/funnel/track/route.ts`
5. `src/lib/mp-crypto.ts`
6. `src/lib/funnel.ts`
7. `src/app/medico/perfil/PerfilClient.tsx`
8. `src/app/medico/perfil/TabCobros.tsx`
9. `supabase/migrations/054_medicos_mp_accounts.sql`
10. `supabase/migrations/055_fix_medicos_mp_accounts_rls.sql`
11. `supabase/migrations/056_eventos_funnel.sql`

---

## Resultados por criterio

### Criterio 1 -- Auth en todos los endpoints MP
**Resultado: PASA**

Evidencia:
- `start/route.ts:8-14`: valida sesion con `supabase.auth.getUser()`, retorna 401 si no hay user.
- `start/route.ts:18-26`: verifica que el user sea medico via lookup en tabla medicos, retorna 403 si no.
- `disconnect/route.ts:6-14`: misma validacion de sesion (401) + rol medico (403).
- `callback/route.ts`: no valida sesion directamente -- usa state CSRF vinculado a medico_id en DB. Esto es correcto y es el patron estandar de OAuth: el callback viene del redirect de MP, no del browser autenticado. El state fue generado en start (que si valido auth), y el callback lo consume one-time.

### Criterio 2 -- RLS en medicos_mp_accounts
**Resultado: PASA**

Evidencia:
- `054_medicos_mp_accounts.sql:32`: RLS habilitada con `ENABLE ROW LEVEL SECURITY`.
- `054_medicos_mp_accounts.sql:36-39`: policy original con bug (`medico_id = auth.uid()`).
- `055_fix_medicos_mp_accounts_rls.sql:5-10`: corrige con DROP + CREATE usando subquery `medico_id = (SELECT id FROM public.medicos WHERE user_id = auth.uid())`. Correcto.
- Policy `service_role_escribe_mp` (linea 43-45): solo service_role puede escribir. No hay policies INSERT/UPDATE/DELETE para authenticated. Un medico autenticado solo puede SELECT su propio registro.
- `mp_oauth_state`: RLS habilitada, solo service_role accede. Correcto.
- `eventos_funnel` (056): RLS habilitada, solo service_role escribe, admin puede leer.

### Criterio 3 -- Cifrado de tokens
**Resultado: PASA**

Evidencia:
- `mp-crypto.ts:1`: usa `aes-256-gcm` (algoritmo correcto para cifrado autenticado).
- `mp-crypto.ts:8-13`: key derivada de env var hex de 64 chars (32 bytes = 256 bits). Valida longitud.
- `mp-crypto.ts:17`: IV aleatorio de 16 bytes con `randomBytes()` -- cada cifrado produce output diferente.
- `mp-crypto.ts:22`: auth tag extraido y concatenado al output.
- `mp-crypto.ts:24`: formato output: `iv(16) + tag(16) + ciphertext`, codificado en base64.
- `mp-crypto.ts:27-38`: decrypt correctamente extrae iv, tag, ciphertext y valida integridad via GCM.
- `callback/route.ts:103-106`: ambos tokens (access y refresh) se encriptan antes del upsert.

### Criterio 4 -- CSRF protection
**Resultado: PASA**

Evidencia:
- `start/route.ts:28`: state generado con `randomBytes(32).toString("hex")` -- 64 chars hex, 256 bits de entropia. Impredecible.
- `start/route.ts:30-31`: state guardado en DB con medico_id asociado.
- `054_medicos_mp_accounts.sql:68`: TTL de 10 minutos (`NOW() + INTERVAL '10 minutes'`).
- `callback/route.ts:21-26`: lookup en DB por state exacto (single match).
- `callback/route.ts:27`: valida expiracion (`expires_at < new Date()`).
- `callback/route.ts:39`: borra el state inmediatamente despues de usar -- one-time use, anti-replay.
- State expirado se limpia en linea 29.

### Criterio 5 -- No secrets en cliente
**Resultado: PASA**

Evidencia:
- `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_TOKEN_ENCRYPTION_KEY`, `MP_OAUTH_REDIRECT_URI`: todas accedidas via `process.env` en route handlers (server-side).
- Ninguna tiene prefijo `NEXT_PUBLIC_` -- grep confirma cero resultados en todo `/src/`.
- `TabCobros.tsx` y `PerfilClient.tsx`: ningun acceso a env vars. El cliente solo interactua via fetch a endpoints.
- El `window.location.href = "/api/mp/oauth/start"` en TabCobros es un redirect, no expone secrets.

### Criterio 6 -- Manejo de errores
**Resultado: PASA**

Evidencia:
- Todos los errores en callback redirigen a `/medico/perfil?tab=cobros&error=<tipo>`.
- Los tipos de error expuestos al usuario son genericos: `invalid_state`, `token_exchange_failed`, `mp_account_already_linked`. No filtran detalles internos.
- Los console.error logean mensajes genericos: "Error guardando OAuth state", "MP token exchange fallo: {status_code}", etc. Ninguno incluye tokens, secrets, ni el code de OAuth.
- El status code del token exchange (linea 80) es informacion operativa, no sensible.

### Criterio 7 -- Idempotencia de disconnect
**Resultado: PASA**

Evidencia:
- `disconnect/route.ts:30-41`: el update filtra `.eq("estado", "activo")`. Si ya esta revocado, `count` sera 0 y no se actualiza nada.
- `disconnect/route.ts:48`: siempre retorna `{ ok: true }` independientemente de si habia registro activo.
- La metadata del evento registra `tenia_registro: (count ?? 0) > 0` para trazabilidad.

### Criterio 8 -- Eventos funnel no bloquean
**Resultado: PASA**

Evidencia:
- `funnel.ts:16-27`: `trackEvent` esta envuelto en try/catch que loguea error pero nunca lanza excepcion.
- En `callback/route.ts`: los `await trackEvent(...)` se ejecutan antes del redirect, pero si fallan, el catch de funnel.ts los absorbe. El flujo principal (redirect) siempre se ejecuta.
- En `TabCobros.tsx:21`: el `fetch` de tracking usa `.catch(() => {})` -- fire-and-forget del lado cliente.
- Nota: los trackEvent en callback son `await` (no fire-and-forget puro), lo cual agrega latencia minima al redirect. No es un problema funcional -- el redirect ocurre igual -- pero es una oportunidad de optimizacion futura.

### Criterio 9 -- SQL migrations seguras
**Resultado: PASA**

Evidencia:
- `054_medicos_mp_accounts.sql`: CREATE TABLE nuevas (no ALTER de tablas existentes). No modifica datos existentes. Usa `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object` para idempotencia de policies.
- `055_fix_medicos_mp_accounts_rls.sql`: DROP POLICY IF EXISTS + CREATE POLICY. Idempotente.
- `056_eventos_funnel.sql`: CREATE TABLE nueva. CHECK constraint con whitelist de eventos. Idempotente via "CREATE TABLE" (fallaria si ya existe, pero es el comportamiento esperado de una migracion secuencial).
- Ninguna migracion toca tablas existentes (consultas, pacientes, medicos, etc.). Riesgo cero de regresion en datos de produccion.

### Criterio 10 -- Bugs Ola 1 cerrados
**Resultado: PASA**

Evidencia:
- **Bug 1 (disconnect no filtraba por estado):** `disconnect/route.ts:41` confirma `.eq("estado", "activo")`. Cerrado.
- **Bug 2 (stickyError):** `PerfilClient.tsx:50` declara `stickyError` como state. Linea 68-69: cuando `error === "mp_account_already_linked"`, se setea en stickyError (no en toast). Linea 76-81: se limpian los query params de la URL. Linea 103: `errorParam` usa stickyError si existe, sino cae al searchParams. Esto permite que el error persista en la UI despues de limpiar la URL. Cerrado.

### Criterio 11 -- No info sensible en logs
**Resultado: PASA**

Evidencia:
- 8 console.error en endpoints MP revisados uno por uno:
  - "Error guardando OAuth state" (start:36) -- sin datos
  - "Faltan variables MP_CLIENT_ID o MP_OAUTH_REDIRECT_URI" (start:47) -- nombres de vars, no valores
  - "Faltan variables MP para token exchange" (callback:46) -- idem
  - "MP token exchange fallo: {status}" (callback:80) -- solo status code HTTP
  - "Error de red en token exchange" (callback:89) -- sin datos
  - "Error encriptando tokens" (callback:107) -- sin datos
  - "Cuenta MP ya vinculada a otro medico" (callback:121) -- sin IDs
  - "Error guardando cuenta MP" (callback:150) -- sin datos
- `funnel.ts:25`: loguea nombre del evento + error object. El error object podria contener info de Supabase, pero nunca tokens/PII.
- Ningun console.log encontrado (solo console.error). Correcto.

### Criterio 12 -- No PII en eventos funnel
**Resultado: PASA**

Evidencia:
- Metadata en trackEvent revisada en todas las llamadas:
  - `sub_tipo`: strings constantes (invalid_state, token_exchange_failed, etc.)
  - `mp_user_id`: ID numerico de MP (no es PII -- es un identificador tecnico de plataforma)
  - `scope`: string de permisos OAuth
  - `tenia_registro`: boolean
  - `desde_estado`: string constante (A, C, D)
  - `estado_inicial`: string constante
- No se registra: email, nombre, DNI, matricula, telefono, IP, user agent.
- El medicoId es un UUID interno -- identificador tecnico, no PII.

### Criterio 13 -- Whitelist de eventos
**Resultado: PASA**

Evidencia:
- `funnel/track/route.ts:6-9`: whitelist del lado servidor: `["mp_oauth_view_tab", "mp_oauth_start_click"]`. Solo estos dos eventos pueden insertarse desde el cliente.
- `funnel/track/route.ts:25`: `.includes(evento)` valida antes de insertar. Evento no permitido retorna 200 sin insertar (silencioso, no informa al atacante).
- `056_eventos_funnel.sql:3-9`: CHECK constraint en DB como segunda capa de defensa con la whitelist completa de 5 eventos.
- `funnel.ts` (server-side helper): usado desde route handlers con eventos hardcodeados en codigo -- no acepta input del usuario. Los 3 eventos adicionales (callback_success, callback_error, disconnect) solo se insertan desde server.
- Defensa en profundidad: whitelist en API + CHECK en DB. Correcto.

---

## Observaciones no bloqueantes

1. **trackEvent con await en callback**: Los 9 `await trackEvent(...)` en callback/route.ts agregan latencia al redirect (cada uno es un INSERT a Supabase). En la practica son milisegundos, pero si se quiere optimizar, se pueden convertir a fire-and-forget con `void trackEvent(...)`. SUGERENCIA, no bloqueante.

2. **mp_oauth_state sin cleanup automatico**: Los states expirados se quedan en la tabla. No hay cron ni trigger que los limpie. Para fase 1 es aceptable (volumen minimo), pero cuando haya trafico real habria que agregar un Vercel Cron o pg_cron. SUGERENCIA.

3. **056_eventos_funnel.sql no usa IF NOT EXISTS**: A diferencia de 054 que usa `DO $$ BEGIN ... EXCEPTION`, la 056 usa CREATE TABLE plano. Si se ejecuta dos veces, falla. Las migraciones son secuenciales asi que no es un problema real, pero difiere del patron de las otras migraciones. SUGERENCIA.

---

## Veredicto

**APRUEBA PARA MERGE**

Los 13 criterios pasan. No hay vulnerabilidades criticas ni importantes. El codigo de seguridad esta bien implementado: cifrado AES-256-GCM con IV aleatorio, CSRF con state one-time de alta entropia y TTL, RLS corregida con subquery, auth en todos los endpoints, secrets solo server-side, logs limpios, whitelist de eventos con defensa en profundidad.

Las 3 observaciones son sugerencias de optimizacion para sprints futuros, ninguna bloquea el deploy.
