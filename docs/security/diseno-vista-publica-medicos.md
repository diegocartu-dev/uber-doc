# Diseño — Vista pública `medicos_publico` (cierre total del perfil de médico)

- **Fecha:** 2026-06-03
- **Autor del diseño / auditoría:** @roberto (empírica contra producción, transacciones con ROLLBACK)
- **Estado:** DISEÑO APROBADO — ejecución pendiente como sprint con orden estricto
- **Origen:** Decisión de Diego — el paciente solo debe ver del médico el set mínimo + funcional; cerrar el resto. La Parte 1 (revoke de columnas internas) ya está aplicada (ver `migrations/20260603_endurecer_medicos_grupo2.sql`). Esto es la Parte 2 (estructural).

## Por qué hace falta una vista (no alcanzan los grants)
Médico y paciente comparten el rol `authenticated`, y la RLS de `medicos` tiene una cláusula de lectura pública (`verificado AND aprobado AND NOT oculto`). Por eso un paciente puede leer filas de cualquier médico verificado con las columnas que el rol tenga grant. Para que el paciente vea SOLO el set mínimo hay que: (a) servir el directorio desde una vista que expone solo columnas seguras, y (b) endurecer la RLS de la tabla para que el paciente no la lea directo.

## (a) Vista + grants
```sql
CREATE OR REPLACE VIEW public.medicos_publico
WITH (security_invoker = false) AS   -- SECURITY DEFINER: el paciente lee la vista sin acceso a la tabla base
SELECT
  id, slug, nombre_completo, especialidad, foto_url,
  precio_consulta, duracion_consulta, modalidad_atencion,
  disponible, disponible_desde, disponible_hasta,
  verificado, estado_registro, identidad_validada, oculto_clinica, es_cuenta_test,
  -- datos legales que el paciente recibe impresos en receta/certificado (Ley 27.553):
  numero_matricula, tipo_matricula, domicilio, domicilio_consultorio, firma_manuscrita_url
FROM public.medicos
WHERE verificado = true
  AND estado_registro = 'aprobado'
  AND COALESCE(dado_de_baja, false) = false;

ALTER VIEW public.medicos_publico SET (security_barrier = true);
REVOKE ALL ON public.medicos_publico FROM PUBLIC;
GRANT SELECT ON public.medicos_publico TO authenticated, anon;
```
> `oculto_clinica`/`disponible` van como columnas (no en el WHERE): el filtro de grilla se hace en la app; pantallas con médico ya elegido deben poder leerlo aunque esté oculto de la grilla.

## (b) Endurecer RLS de la tabla (PASO FINAL, después de migrar el código)
```sql
DROP POLICY "Usuarios autenticados ven perfiles de medicos" ON public.medicos;
CREATE POLICY "medico_lee_su_propia_fila"
  ON public.medicos FOR SELECT TO authenticated
  USING (user_id = auth.uid());
REVOKE SELECT ON public.medicos FROM anon;   -- anon usa la vista
```

## (c) Refactor de código — patient-facing → `medicos_publico`
Migrar `.from("medicos")` → `.from("medicos_publico")`:
- `src/app/clinica/page.tsx:37`, `src/app/clinica/actions.ts:60`
- `src/app/clinica/[medicoId]/turnos/page.tsx:37`, `.../turnos/actions.ts:41`
- `src/app/consulta/[id]/confirmacion/page.tsx:38`, `.../sala/page.tsx:34`
- `src/app/sala-espera/[consultaId]/page.tsx:41`
- `src/app/mis-consultas/page.tsx:50`
- `src/app/turno/[turnoId]/confirmacion/page.tsx:36`, `.../espera/page.tsx:47`, `.../sala/page.tsx:42`, `.../pago/page.tsx:28`
- `src/lib/consultorio-url.ts:16`
- `src/app/dashboard/page.tsx:143,163,183` (paciente: nombres de médicos de sus turnos/consultas)
- `src/app/medico/consulta/[id]/workspace/WorkspaceConsulta.tsx:751`

**Excepción — NO migrar a la vista, usar `createAdminClient()`** (para no romper recetas históricas si el médico se da de baja):
- `src/app/api/documentos/[id]/pdf/route.ts:33` y la parte de PDF/histórico de `src/app/documentos/page.tsx:104`.

**Doctor-facing (56 hits) y admin (54 hits): SIN cambios** (leen su propia fila por `user_id=auth.uid()` / van por service_role).

## ORDEN DE EJECUCIÓN OBLIGATORIO (no invertir)
1. Crear vista + grants (additivo, no rompe nada — nadie la usa aún).
2. Mergear + deploy del refactor de código (patient-facing → vista; PDF → admin).
3. Validar en **preview**: grilla de clínica, booking CI, booking turno, generación de receta PDF, dashboard médico.
4. **Recién entonces** endurecer RLS + `REVOKE SELECT ON medicos FROM anon`.

> ⚠️ Si se endurece la RLS ANTES de migrar el código, las queries patient-facing devuelven **0 filas en silencio** (RLS filtra filas, no lanza error): grilla vacía, "Médico" genérico, receta sin datos. Por eso el orden es estricto.

## Riesgos
- **Orden** (arriba) — el principal.
- Linter Supabase marcará `medicos_publico` como `security_definer_view` (warning esperado y aceptable — es el patrón que necesitamos).
- Recetas históricas: mitigado con la excepción admin-client.
- `firma_manuscrita_url`/`foto_url` en la vista son URLs; el acceso al archivo lo gobierna el bucket de Storage, no la vista.

## Rollback
```sql
DROP VIEW IF EXISTS public.medicos_publico;
GRANT SELECT ON public.medicos TO anon;
DROP POLICY IF EXISTS "medico_lee_su_propia_fila" ON public.medicos;
CREATE POLICY "Usuarios autenticados ven perfiles de medicos"
  ON public.medicos FOR SELECT TO authenticated
  USING ((user_id = auth.uid()) OR (verificado = true AND estado_registro = 'aprobado' AND oculto_clinica = false));
```
(y revertir en código `medicos_publico` → `medicos`.)
