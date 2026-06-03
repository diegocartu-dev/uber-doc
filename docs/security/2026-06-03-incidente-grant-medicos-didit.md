# Incidente — Médicos caían en "modo paciente" (GRANT faltante en `medicos`)

- **Fecha:** 2026-06-03
- **Severidad:** Alta (todos los médicos sin acceso a su dashboard; flujos de turnos/reservas caídos)
- **Estado:** RESUELTO
- **Detectado por:** Diego (al loguearse con `medico.test` y con su cuenta real por Google, ambos caían en modo paciente)
- **Revisión de seguridad del fix:** Roberto — APROBADO
- **Fix aplicado a producción:** 2026-06-03 vía Supabase Management API + migración `supabase/migrations/20260603_fix_grant_didit_columns.sql`

## Síntoma
Cualquier médico, al loguearse, veía la **vista de paciente** (menú "Paciente", card "Clínica Virtual") en lugar de su dashboard médico. Afectaba a **todos** los médicos, por ambos métodos de login (email/password y Google). "Ayer funcionaba."

## Causa raíz
La migración `20260602_didit_identidad_medico.sql` agregó columnas a `public.medicos`
(`identidad_validada`, `identidad_validada_at`, `didit_session_id`, `didit_status`)
**sin extender el GRANT por-columna**.

`medicos` no tiene `SELECT` a nivel de tabla para `anon`/`authenticated`: usa grants
**columna-por-columna** desde `20260527_contacto_privado_medico.sql` (control de
seguridad — REVOKE table-level + re-GRANT solo de columnas públicas, para ocultar
`celular_personal`/`email_personal`). Toda columna nueva nace **sin** grant.

Como las columnas nuevas quedaron sin grant, cualquier query de cliente que las
incluyera fallaba con `permission denied for table medicos` (SQLSTATE **42501**),
devolvía `null`, y disparaba el fallback paciente en `dashboard/page.tsx`.

## Blast radius (verificado empíricamente con `SET ROLE authenticated`)
| Flujo | Archivo | Estado durante el incidente |
|---|---|---|
| Dashboard médico → modo paciente | `src/app/dashboard/page.tsx:194` | 🔴 |
| Ver turnos de un médico | `src/app/clinica/[medicoId]/turnos/page.tsx:39` | 🔴 |
| Reservar turno | `src/app/clinica/[medicoId]/turnos/actions.ts:42` | 🔴 |
| Médico edita matrícula | `src/app/api/medico/perfil/route.ts:37` | 🔴 (500) |
| Grilla `/clinica` (solo si flag `identidad_gate_activa` ON) | `src/app/clinica/page.tsx:44` | 🟡 (flag estaba OFF → no afectó) |
| Perfil público `/dr/[slug]` (anon) | `src/app/dr/[slug]/page.tsx` | 🔴 |

## Evidencia empírica (reproducible)
- Sign-in real de médico vía GoTrue → `SELECT id FROM medicos` OK, pero el SELECT
  exacto del dashboard (incluye `identidad_validada, didit_status`) → **42501**.
- `has_column_privilege('authenticated','public.medicos','identidad_validada','SELECT')`
  → **false** (pre-fix) / **true** (post-fix).
- Post-fix: la query exacta del dashboard devuelve la fila; `celular_personal`/
  `email_personal` siguen en false/false (control del 27-may intacto).

## Fix aplicado
```sql
GRANT SELECT (identidad_validada, didit_status) ON public.medicos TO authenticated;
GRANT SELECT (identidad_validada)               ON public.medicos TO anon;
```
- `didit_status` solo a `authenticated` (ningún path público lo usa — mínimo privilegio).
- `identidad_validada_at` / `didit_session_id` quedan SIN grant (solo service_role; audit/internos).
- `celular_personal` / `email_personal` siguen ocultos (sin cambios).

## Limpieza asociada
Al avanzar para diagnosticar, se auto-creó un perfil paciente sobre el `user_id` del
médico de test (nombre "Agostina Perez"). Se borró (sin dependientes FK). El médico
quedó solo con su rol médico.

## Postmortem / prevención (próximo sprint DB — NO en este hotfix)
La convención REVOKE-tabla + GRANT-por-columna del 27-may es correcta para proteger
datos privados, pero es **frágil**: todo `ADD COLUMN` futuro sobre `medicos` nace sin
grant y rompe silenciosamente cualquier SELECT de cliente que lo incluya.

Recomendaciones (Roberto):
1. Agregar a la checklist de toda migración que toque `medicos` un test post-deploy:
   `SET ROLE authenticated` + correr el SELECT real del dashboard y confirmar fila (no 42501).
2. Comentario de advertencia en `20260527_contacto_privado_medico.sql`: "toda columna
   pública nueva debe sumarse a estos GRANT".
3. Evaluar un test automatizado en CI que valide los privilegios de columna esperados.
