# Ruteo jurisdiccional en teleconsulta — criterio de habilitación por matrícula

**Fecha:** 2026-07-02
**Estado:** Draft asistido por IA (agente legal "Carolina"). **NO es asesoramiento vinculante.** Los 4 puntos marcados al final deben ser confirmados por un abogado matriculado antes de fijar la política en firme. Mientras tanto se lanza la posición conservadora (Regla A), que es la defendible.
**Decisión de Diego (CEO):** Regla (A). Largar con lo que sabemos que cumplimos.

## Pregunta
¿A qué pacientes puede atender un médico por teleconsulta según su(s) matrícula(s)? En particular: ¿una "Matrícula Nacional" (MN) habilita a atender a nivel nacional?

## Evidencia empírica (REFEPS, Registro Federal — verificada 2026-07-02)
Se consultó el Bus FHIR de REFEPS por DNI para médicos reales de la plataforma. Hallazgos reproducibles (`node scripts/refeps-check.mjs <dni>`):

- REFEPS asigna a **cada matrícula** un código de jurisdicción puntual en el campo `JurisdMatricula` (ej. `02`=CABA, `06`=Buenos Aires). **No existe un código "Nacional".**
- Caso Pablo Cogliandro (DNI 29362322): matrícula 138169, emisor **"Ministerio de Salud de la Nación"**, pero REFEPS la codifica como **`02` = CABA**. Su otra matrícula (334585, Colegio Distrito III) es **`06` = Buenos Aires**. Alcance real: **CABA + Buenos Aires**, no país.
- En toda la base, las únicas jurisdicciones que devuelve REFEPS son provincias/CABA concretas. Ninguna "Nacional".

## Conclusiones del análisis legal (jerarquizadas)
1. **La "Matrícula Nacional" del Min. de Salud de la Nación es territorialmente CABA**, no las 24 jurisdicciones. Es un artefacto histórico (hasta ~2003 la Nación matriculaba a los médicos de la Capital Federal). REFEPS la codifica correctamente como CABA. — *SÓLIDO en lo estructural; el alcance exacto vigente exige matriculado.*
2. **Ninguna norma habilita la teleconsulta interjurisdiccional por tener matrícula nacional.** La Ley 27.553 da alcance nacional al MEDIO (plataforma, receta electrónica), NO a la habilitación del profesional. El silencio normativo no es licencia; cada provincia lo llena a su favor y **varias exigen matrícula/registro local para telesalud** (ahí es directamente prohibido). — *ZONA GRIS / PROHIBIDO según provincia.*
3. **La matrícula es potestad provincial no delegada (art. 121 CN).** El acto médico en teleconsulta se reputa —lectura tuitiva dominante— en la jurisdicción del **paciente**. — *INTERPRETACIÓN dominante y conservadora.*
4. **"Acto aislado vs. ejercicio habitual" (Ley 17.132 art. 2)** es un argumento válido, pero Docto ES habitualidad por diseño → no salva el core asistencial. Su único hogar legítimo es **segunda opinión / interconsulta no-tratante** (no prescribe, no abre HC como tratante, no certifica). — *INTERPRETACIÓN (prometedora solo para 2ª opinión).*

## Decisión de producto (Regla A)
El **alcance de un médico = la unión de las jurisdicciones que REFEPS asigna a sus matrículas habilitadas** (`MatriculaHabilitada = true`). Se rutea un médico a un paciente **solo si** la provincia del paciente ∈ ese conjunto. Aplica tanto al ruteo como al onboarding (se acepta cualquier matrícula habilitada en REFEPS; no se exige MN).

Corolario que corrige la política previa: "exigir MN" descansaba parcialmente en el equívoco de creer que MN = alcance nacional. Como MN = CABA, exigir MN no habilitaba interjurisdiccionalmente **y** excluía supply del interior. La Regla (A) es más coherente y más expansiva.

Vía futura (no en el lanzamiento): **segunda opinión interjurisdiccional no-tratante** como track aparte, si un matriculado valida que escapa a la exigencia de matrícula local.

## Requiere confirmación de abogado matriculado humano (antes de fijar en firme)
1. Alcance territorial exacto hoy de la matrícula del ex-Min. de Salud de la Nación / Dirección de Registro.
2. Mapa provincia-por-provincia de exigencia de matrícula/registro local para telesalud (actualizado 2025-2026).
3. Si "segunda opinión no-tratante" escapa a la exigencia de matrícula local, y con qué recaudos documentales.
4. Redacción del copy de ruteo y de segunda opinión (lo que protege ante denuncia).

Relacionado: `project_matricula_nacional_requisito` (memoria), `docs/legal/` (criterios previos).
