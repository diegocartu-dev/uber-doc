# Tooling del baseline de schema (modo institucional)

La instancia institucional nace con un proyecto Supabase **dedicado**, provisionado desde `supabase/migrations/`. Pero **no se puede asumir que esas migraciones reproducen el schema productivo del B2C**: la práctica del proyecto incluyó DDL directo por Management API / SQL Editor, hay colisiones de numeración (`030`, `032`, `033`, `054`–`056` duplicados) y existe al menos un caso verificado de drift — el constraint `medicos_aprobado_requiere_refeps` (backstop de DB del gate REFEPS) no figura en ninguna migración. Un clon ingenuo nacería sin él.

## Flujo de baseline (bloqueo duro antes de provisionar)

1. **Dump de prod B2C** (solo schema, solo lectura):
   `npx tsx scripts/institucional/dump-schema-prod.ts`
   → `scripts/institucional/out/schema-irpupskopjahbqqvckue-<fecha>.json`
2. **Migraciones en limpio:** crear un proyecto Supabase descartable y aplicarle las 144 migraciones de `supabase/migrations/` en orden.
3. **Dump del clon limpio** con el mismo script:
   `npx tsx scripts/institucional/dump-schema-prod.ts <ref-del-clon>`
4. **Diff** de los dos JSON (son determinísticos y ordenados: `diff`/`jq` alcanza). Mirar especialmente: **GRANTs de columna de `medicos`** (el outage 19-24/06 fue un grant faltante), CHECK constraints aplicados por DDL directo, triggers, funciones/RPCs y policies.
5. **Migración de baseline:** capturar todo el drift en un `.sql` (incluye re-aplicar `medicos_aprobado_requiere_refeps`). Esa migración corre en el proyecto de la instancia después de las 144 y antes de `supabase/migrations-institucional/`.
6. Fuera del diff (no viven en el schema): templates de mails de Auth (Supabase Management API, replicar a mano), **cierre del signup de Auth (sección siguiente — obligatorio)** y verificación post-provisioning de buckets con `npx tsx scripts/verify-storage-buckets.ts`.

El directorio `out/` está gitignoreado: un dump de schema de prod no se commitea.

## Cierre del signup de Auth — paso OBLIGATORIO del provisioning

El 404 del middleware sobre `/auth/register` y `/auth/registro-medico` (Capa A) bloquea solo la **UI**: el registro real es `supabase.auth.signUp` contra la API de Auth del proyecto Supabase, con la anon key que viaja en el bundle del cliente — **no pasa por Next**. En la instancia el alta es provisionada (universo cerrado): si el signup queda abierto, cualquiera se crea una cuenta `authenticated` y con eso lee todo lo granteado a ese rol (p.ej. `institucion_config`).

Al provisionar el proyecto dedicado, **deshabilitar los email signups y verificar que no haya providers OAuth habilitados**, vía Management API (mismo mecanismo que los templates de mails):

```
PATCH https://api.supabase.com/v1/projects/<ref-instancia>/config/auth
{ "disable_signup": true }
```

y confirmar en la misma config que todos los `external_*_enabled` estén en `false`.

Notas:
- `disable_signup` **no** afecta el alta provisionada (`auth.admin.createUser` con service role) ni el minteo de sesión por link de la Etapa 3 — solo cierra el signup público.
- Verificación empírica post-provisioning: un `supabase.auth.signUp` con la anon key de la instancia debe devolver error (`Signups not allowed for this instance`).
