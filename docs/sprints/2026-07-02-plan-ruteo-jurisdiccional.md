# Plan — Ruteo por jurisdicción (Clínica Virtual)

**Fecha:** 2026-07-02 · **Decisión:** Regla (A) — alcance = unión de jurisdicciones REFEPS. Ver `docs/legal/2026-07-02-ruteo-jurisdiccional-teleconsulta.md`.
**Objetivo:** que un paciente vea SOLO médicos habilitados para su jurisdicción, sin dejar a ningún médico fuera de su alcance real.

## Flujo (acordado con Diego)
`/clinica` → **pantalla de provincia SIEMPRE** (pre-llenada con la guardada, se confirma) → **listado de médicos habilitados para tu jurisdicción** (con chip "Médicos habilitados para tu jurisdicción · Córdoba · cambiar" + buscador por especialidad) → elegís → triage / turnos.

- La provincia se **valida cada vez** (no en silencio): el paciente debe saber siempre a qué jurisdicción corresponde lo que ve. Se guarda solo para pre-seleccionar.
- Copy: **"Médicos habilitados para tu jurisdicción"** (no "médicos en X"). Encuadre de habilitación, no de directorio geográfico.

## Modelo de datos
- **`pacientes.provincia`** (text, nullable). Dropdown con la lista canónica.
- **`medicos.jurisdicciones`** (text[]). Set derivado de `refeps_data.matriculas` donde `habilitada=true`, mapeado a la lista canónica. Un MN nacional real (si REFEPS lo marcara "Nacional") = las 24; hoy no existe ninguno en la base.

## Lista canónica (24) + normalización
Fuente única usada por el dropdown del paciente Y el set del médico. Mapa `JurisdMatricula (REFEPS) → canónica`. Valores REFEPS observados hoy: `CABA`, `Buenos Aires`, `Santa Fe`, `Córdoba`. Un valor que NO mapee a provincia real (`Provincial`, `Nacional` sin provincia, etc.) **no cuenta como jurisdicción válida** → se marca para resolver, no se usa en silencio.

## Reglas de confiabilidad (para no dejar a nadie fuera)
1. **Backfill con verificación = GATE DE LANZAMIENTO.** El filtro no se prende hasta que una auditoría confirme que **cada médico visible tiene ≥1 jurisdicción canónica válida**. Cualquiera sin resolver se corrige antes (re-validar por Bus o cargar a mano desde el buscador público). Nunca se lanza con un médico sin resolver.
2. **Default fail-safe.** Se oculta un médico SOLO cuando sabemos positivamente sus jurisdicciones Y la provincia del paciente no está. **Nunca por ausencia de dato.** Si por lo que sea faltara, se muestra + se marca para revisar.
3. **Confiabilidad continua.** Derivación automática al validar REFEPS + rechazo/flag de valores no-canónicos. La **aprobación manual** (Bus caído) exige provincia real canónica (no "Provincial" genérico). Monitor: alerta si un médico visible queda con 0 jurisdicciones.

## Tickets (un commit por ticket)
1. **Migración `pacientes.provincia`** + lista canónica compartida (`src/lib/jurisdicciones.ts`).
2. **Migración `medicos.jurisdicciones` (text[])** + parser: al validar REFEPS, derivar y persistir el set canónico (habilitada=true). Backfill de los ya validados (dato en `refeps_data`). Corregir aprobación manual para exigir provincia canónica.
3. **Fix de datos:** Ana Belén `Provincial` → `Córdoba` (bug de carga manual).
4. **Pantalla de provincia** (siempre, pre-llenada) + guardado en `pacientes.provincia`. [Sofía]
5. **Listado de médicos** como pantalla (reusar el render del modal actual) + chip de jurisdicción + buscador por especialidad. Reemplaza la grilla de especialidades como landing. [Sofía]
6. **Filtro de ruteo** en la query de `/clinica` (CI) y en el listado de turnos: `provincia_paciente ∈ medico.jurisdicciones`. Excepción de continuidad (médico que ya atendió al paciente) → Fase 2.
7. **Auditoría/gate + monitor** (script de verificación de cobertura 100% antes de prender el filtro).

**Gates:** Sofía (4, 5) · Roberto (6, 7 — que el filtro no abra agujero ni esconda de más) · Diego OK en las migraciones (1, 2, 3) antes de aplicar.

**Pendiente humano (no bloquea el lanzamiento conservador):** abogado matriculado — 4 puntos del doc legal.
