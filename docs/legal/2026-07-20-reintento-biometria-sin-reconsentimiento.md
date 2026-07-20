# Dictamen — Reintento de verificación biométrica sin re-consentimiento

**Fecha:** 20/07/2026 · **Autora:** Carolina (legal salud digital) · **Contexto:** respec UX de identidad (spec Sofía 20/07), unificación del patrón de reintento entre registro y dashboard.

## Pregunta

Si Didit rechaza un intento de verificación (causa técnica: foto borrosa, reflejos) y el médico reintenta, ¿el reintento puede iniciarse directo apoyándose en el consentimiento ya registrado, o exige renovar el consentimiento expreso?

## Dictamen

**El reintento directo SIN re-consentir es defendible.** Fundamento:

- **Art. 5, Ley 25.326:** el consentimiento se presta "para el tratamiento" — la unidad jurídica es el tratamiento con su finalidad, no cada operación o intento. No existe exigencia de consentimiento "por acto" en la 25.326, el Decreto 1558/2001 ni resoluciones AAIP.
- **Art. 4 inc. 3 (finalidad):** el reintento es la misma finalidad, mismo alcance de datos, mismo encargado (Didit). No hay tratamiento nuevo; hay nueva ejecución del tratamiento consentido.
- **Decreto 1558/2001 (regl. art. 5):** el consentimiento es revocable en cualquier tiempo; a contrario sensu, mientras no se revoque sigue vigente. No caduca por intento fallido.

La cobertura se rompe (y ahí SÍ se re-consiente) solo si cambia: (1) el proveedor, (2) el alcance del tratamiento, (3) la versión del texto con cambio sustancial (bump de `CONSENTIMIENTO_VERSION`), o (4) si el titular revoca.

## Condición obligatoria (implementada en este mismo PR)

**El servidor debe VERIFICAR el consentimiento registrado, no fabricar uno nuevo.** El endpoint `crear-sesion` insertaba una fila en `aceptaciones_legales` en CADA llamada, confiando en un flag del cliente — y el reintento del dashboard mandaba ese flag hardcodeado sin checkbox real. Eso registraba actos de "consentimiento expreso" que no ocurrieron y contamina el valor probatorio de toda la tabla ante una inspección AAIP.

Patrón corregido:
- Primer intento: checkbox real → insert en `aceptaciones_legales` (como siempre).
- Reintento: el cliente no manda flag; el servidor consulta la aceptación previa de la **versión vigente**. Si existe → sesión nueva sin fila nueva ("amparada en el consentimiento registrado el [timestamp]"). Si no existe → `400 consentimiento_requerido` y el front muestra el flujo completo con checkbox.
- Bonus: el chequeo por versión hace que un bump del texto fuerce re-consentimiento naturalmente.

## Criterio interno documentado (sin plazo legal)

Reintento directo mientras el proceso de verificación siga abierto (médico nunca validado, misma cuenta, mismo flujo). La ley no fija plazo y no se inventa uno como obligación. Criterio de higiene opcional: re-mostrar el texto si la aceptación tiene más de 12 meses.

## Pendiente para decisión de Diego (NO bloquea este PR)

El texto v1 cubre el reintento tal como está. Recomendación de Carolina para un futuro `biometria_didit_v2`:

1. Línea de multi-intento + revocación: *"Si un intento falla por un problema técnico (foto borrosa, poca luz), podés reintentar sin volver a aceptar: este consentimiento cubre los intentos necesarios hasta completar la verificación. Podés revocarlo en cualquier momento escribiendo a soporte@docto.com.ar."*
2. **Gap real de art. 6, Ley 25.326** (independiente del reintento): el v1 no informa la identidad y domicilio del responsable del archivo ni la posibilidad de ejercer los derechos de acceso, rectificación y supresión. Dos líneas lo resuelven.
3. Al bumpear: documentar que las aceptaciones v1 siguen válidas para reintentos (cambio aclaratorio/aditivo) + re-sembrar `versiones_textos_legales`.
