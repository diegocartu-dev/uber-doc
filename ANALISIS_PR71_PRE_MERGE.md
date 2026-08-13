# Análisis Pre-Merge PR #71 — Sprint Bus Fase 1 + Firma Electrónica Ola 1

**Fecha:** 21 de mayo de 2026
**Autor:** Marcos (Distinguished Engineer)
**Para:** Diego González (CEO)
**Propósito:** Documentación rigurosa del contenido de PR #71 antes de decidir merge

---

## Resumen Ejecutivo

PR #71 agrega 13 archivos al proyecto. 11 son completamente nuevos (no existen en el código actual). Los 2 que modifican código existente son el middleware (agrega timeout de inactividad de 8 horas) y el layout (agrega una línea en blanco — sin impacto). El código nuevo de firma electrónica y OTP tiene 2 bugs críticos señalados por Roberto, pero **ninguna parte del sistema actual los llama ni los ejecuta**. No hay botón, pantalla ni flujo que active ese código hoy. Se activa recién cuando se construyan las Olas 2-5. El único cambio que afecta usuarios reales es el timeout de inactividad en el middleware. El riesgo de mergear hoy es bajo si se entiende que los bugs críticos deben fixearse antes de construir la UI que los use. Alternativamente, se pueden fixear en este mismo branch antes del merge con ~2 horas de trabajo.

---

## Tarea 1 — Inventario Completo de los 13 Archivos

| # | Archivo | Nuevo/Existente | Qué hace (lenguaje no técnico) | Quién lo llama | Tests | Hallazgos Roberto |
|---|---------|-----------------|-------------------------------|----------------|-------|-------------------|
| 1 | `supabase/migrations/20260520_tabla_recetas.sql` | Nuevo | Define la estructura de la tabla de recetas electrónicas en la base de datos: qué datos guarda cada receta, quién puede ver qué, y reglas de integridad (ej: cada receta debe tener o una consulta o un turno, nunca ambos ni ninguno). | Nadie lo "llama" — es una instrucción para la base de datos. **Ya fue aplicada manualmente en producción.** | No tiene tests | Ninguno directo sobre este archivo |
| 2 | `supabase/migrations/20260520_firma_electronica.sql` | Nuevo | Define dos tablas: una para guardar las "llaves digitales" de cada médico (con las que firma recetas), y otra para los códigos de verificación temporales (OTP) que se le mandan por email antes de firmar. | Igual que arriba — instrucción de base de datos. **Ya aplicada en producción.** | No tiene tests | **4.3 IMPORTANTE**: Los registros de auditoría (tabla OTP) pueden ser borrados por un administrador. **4.4 IMPORTANTE**: La restricción UNIQUE en medico_id impide que un médico tenga más de un par de llaves (activa + históricas revocadas). |
| 3 | `src/lib/firma/crypto.ts` | Nuevo | Es la "caja de herramientas criptográficas": genera llaves RSA (como un sello digital), encripta/desencripta llaves privadas con una contraseña maestra, calcula huellas digitales (hash) de documentos, y firma/verifica documentos. Es código de matemática pura — no accede a la base de datos ni a internet. | Lo llaman `claves.ts` y `receta.ts` (ambos también nuevos en este PR). **Nada en el sistema actual lo llama.** | Sí: `tests/unit/firma-crypto.test.ts` — 8 tests que verifican generación de llaves, encriptación, hash, firma, y detección de alteraciones. **Los tests NO se ejecutan en CI** (CI solo corre Playwright E2E). | Ninguno — Roberto aprobó este archivo |
| 4 | `src/lib/firma/claves.ts` | Nuevo | Se encarga de crear y guardar las llaves digitales de un médico la primera vez que va a firmar. Si el médico ya tiene llaves, las devuelve sin crear nuevas. | Lo llamaría la UI de firma (que aún no existe). **Nada en el sistema actual lo llama.** | No tiene tests propios | Ninguno directo |
| 5 | `src/lib/firma/otp.ts` | Nuevo | Genera y valida los códigos de 6 dígitos que se mandan al email del médico para verificar su identidad antes de firmar. Incluye protecciones: máximo 5 intentos por código, cooldown de 30 segundos entre códigos, expiración a los 5 minutos. | Lo llaman las rutas API `2fa/generar` y `2fa/validar` (también nuevas en este PR). **Nada en el sistema actual lo llama.** | No tiene tests propios | **1.1 CRÍTICO**: No tiene protección contra un atacante que automatice el ciclo de pedir un código nuevo cada 30 segundos durante horas. Falta un bloqueo total después de muchos intentos fallidos. **1.3 IMPORTANTE**: Si el frontend no envía el identificador de la consulta, el código es válido para cualquier consulta del médico. |
| 6 | `src/lib/firma/receta.ts` | Nuevo | Contiene la lógica principal de firma: toma una receta en borrador, calcula su huella digital, la firma con la llave del médico, y actualiza la base de datos. También puede verificar si una receta firmada fue alterada después. | **Nada en el sistema actual lo llama.** Sería llamado por la UI de firma (Ola 2-5). | No tiene tests propios | **3.3 CRÍTICO**: El cálculo de la huella digital puede dar resultados diferentes para datos idénticos (problema de ordenamiento). **5.1 CRÍTICO**: No verifica que el médico haya completado la verificación por email (OTP) antes de firmar. |
| 7 | `src/lib/receta-constants.ts` | Nuevo | Define constantes: el código de plataforma de Docto (0270), los tipos de receta (común, controlada, psicotrópico), y los estados posibles (borrador, emitida, dispensada, anulada). | **Nada en el sistema actual lo usa.** | No tiene tests | Ninguno |
| 8 | `src/lib/cuil.ts` | Nuevo | Calcula el CUIL argentino a partir del DNI y el sexo, usando el algoritmo oficial con pesos y dígito verificador. | **Nada en el sistema actual lo llama.** | Sí: `tests/unit/cuil.test.ts` — 9 casos de prueba incluyendo hombres, mujeres, DNIs con puntos, DNIs de 7 dígitos, y el caso especial de prefijo 23. **Los tests NO se ejecutan en CI.** | Ninguno |
| 9 | `src/app/api/2fa/generar/route.ts` | Nuevo | Ruta API que, cuando un médico la llama, genera un código OTP de 6 dígitos y se lo envía por email. Verifica que el usuario está logueado y que es médico antes de proceder. | **Nadie la llama hoy.** La llamaría el modal de firma cuando se construya. Pero la ruta existe y es accesible en la URL `/api/2fa/generar` para cualquier médico logueado que haga un POST. | No tiene tests | Hereda el hallazgo 1.1 de otp.ts (sin rate limiting global) |
| 10 | `src/app/api/2fa/validar/route.ts` | Nuevo | Ruta API que recibe un código de 6 dígitos y verifica si es correcto. Tiene validación básica de formato (debe ser exactamente 6 números). | **Nadie la llama hoy.** Sería llamada por el modal de firma. Al igual que la anterior, existe y es accesible en `/api/2fa/validar`. | No tiene tests | **1.3 IMPORTANTE**: No rechaza requests sin `consultaId` ni `turnoId` (los deja pasar como opcionales). |
| 11 | `src/middleware.ts` | **Existente — modificado** | El middleware es el "portero" de la aplicación: cada vez que alguien visita cualquier página, el middleware se ejecuta primero. Hoy solo hace dos cosas: verifica la contraseña de beta y refresca la sesión. El PR le agrega una tercera función: timeout de inactividad. | El framework (Next.js) lo ejecuta automáticamente en CADA request. **Este archivo SÍ afecta a usuarios reales inmediatamente después del merge.** | Los tests E2E de CI pasan sobre la versión del PR (verificado). | Ninguno de Roberto sobre el middleware |
| 12 | `src/app/layout.tsx` | **Existente — modificado** | Es el "marco" visual de toda la aplicación. El PR le agrega exactamente una línea en blanco entre dos bloques de código. **Cero impacto funcional.** | Next.js lo usa automáticamente. | N/A | Ninguno |
| 13 | `GAP_ANALYSIS_BUS.md` | Nuevo | Documento de análisis que mapea los requisitos del Bus de Interoperabilidad (Resolución 2214/2025) contra lo que tiene Docto hoy. Identifica 12 bloqueantes, 8 urgentes, 5 deseables. | Es documentación — no se ejecuta. | N/A | Ninguno |

---

## Tarea 2 — Análisis de `src/lib/firma/receta.ts`

### a) Qué hace el archivo

Este archivo contiene dos funciones principales: `firmarReceta` y `verificarFirma`. La primera toma una receta en estado borrador, calcula una "huella digital" única de su contenido (los medicamentos, diagnóstico, indicaciones), firma esa huella con la llave privada del médico (como un sello personal infalsificable), y guarda todo en la base de datos cambiando el estado de "borrador" a "emitida". La segunda función hace lo inverso: toma una receta ya firmada, recalcula la huella y la compara con la original para detectar si alguien alteró el contenido después de la firma.

### b) Bug 3.3 — Orden de keys en hash

**Dónde exactamente:** Línea donde dice `const contenido = JSON.stringify(receta.datos_prescripcion);` — aparece dos veces, una en `firmarReceta` y otra en `verificarFirma`.

**Qué hace mal:** Convierte los datos de la receta (medicamentos, dosis, etc.) a texto para calcular la huella digital. El problema es que el orden en que aparecen los campos en ese texto no está garantizado. Por ejemplo, al firmar podría generar `{"dosis":"10mg","medicamento":"ibuprofeno"}` y al verificar podría leer `{"medicamento":"ibuprofeno","dosis":"10mg"}`. Ambos tienen exactamente la misma información, pero como el texto es diferente, la huella digital es diferente.

**Qué consecuencia tiene:** Un falso positivo de alteración. El sistema diría "este documento fue alterado" cuando en realidad nadie lo tocó. El farmacéutico vería una receta marcada como inválida cuando es perfectamente legítima. Esto socava la confianza en todo el sistema de firma.

**Si se mergea sin fixear:** El código NO se activa solo. No hay ningún botón, pantalla ni flujo que llame a `firmarReceta()` o `verificarFirma()` hoy. Se activaría recién cuando se construya la UI de firma en Olas 2-5. Si alguien construye esa UI sin fixear esto primero, las recetas firmadas podrían aparecer como "alteradas" la próxima vez que alguien las verifique.

### c) Bug 5.1 — No verifica OTP

**Dónde exactamente:** La firma de la función `firmarReceta(recetaId: string, medicoId: string)` — solo recibe 2 parámetros. En ningún lugar del cuerpo de la función se consulta la tabla `otp_firma` ni se verifica que el médico haya ingresado un código OTP válido.

**Qué hace mal:** Permite firmar una receta sin haber completado la verificación por email (2FA). El flujo debería ser: (1) médico pide código → (2) recibe código por email → (3) ingresa código → (4) sistema verifica código → (5) solo entonces permite firmar. El paso 5 no existe — la función firma sin preguntar por el paso 4.

**Qué consecuencia tiene:** Cualquier código que se ejecute en el servidor y conozca el ID de una receta y el ID de un médico puede firmar recetas sin pasar por la verificación de identidad. Esto anula el propósito del sistema OTP (2FA).

**Si se mergea sin fixear — ¿es explotable desde afuera?** Hoy: **NO**. Para explotar esto se necesitan todas estas condiciones simultáneamente:

1. Que exista una ruta API o función que llame a `firmarReceta()` — **hoy no existe ninguna**
2. Que esa ruta sea accesible desde internet — posible si alguien la construye como ruta API
3. Que el atacante tenga una sesión válida de médico en Docto — requiere credenciales reales
4. Que el atacante conozca el ID de una receta en borrador — requiere acceso a la base de datos

La condición 1 es la barrera principal: nadie puede llegar a `firmarReceta()` desde afuera porque no hay ningún endpoint que lo exponga. Si en Olas 2-5 alguien construye ese endpoint sin fixear primero, ahí sí sería explotable (con las condiciones 2-4).

### d) ¿Tiene tests?

**No.** El archivo `firma/receta.ts` no tiene tests. Los tests que existen (`firma-crypto.test.ts`) prueban la criptografía pura (generar llaves, encriptar, firmar), pero no prueban `firmarReceta()` ni `verificarFirma()`. Ningún test ejercita el comportamiento con bugs.

### e) ¿Algo en main lo llama?

**No.** Verifiqué con búsqueda exhaustiva en todo el código de main:

- No existe el directorio `src/lib/firma/` en main
- No existe el directorio `src/app/api/2fa/` en main
- Ningún archivo en main importa desde `firma/`, `cuil`, ni `receta-constants`
- La única mención de "cuil" en main es un SELECT en la página de video que lee el campo de la base de datos, pero no importa la función `calcularCuil`

**El código de firma es completamente aislado: existe solo dentro de sí mismo.**

---

## Tarea 3 — Análisis del Middleware

### a) Qué hace el middleware actual en main

El middleware actual hace 3 cosas cada vez que alguien visita cualquier página de Docto:

1. **Beta Guard:** Verifica si la página es de registro (/auth/register, /auth/registro-medico). Si lo es, chequea que el visitante tenga la contraseña de beta. Si no la tiene, lo redirige a la pantalla de acceso beta. Si la página NO es de registro, deja pasar a todos.

2. **Refresh de sesión:** Refresca la sesión de Supabase (para que no expire mientras el usuario navega).

3. **Noindex en consultorios:** Si la URL empieza con /dr/, agrega un header que le dice a Google "no indexes esta página".

### b) Qué le agrega este PR

Agrega una cuarta función que se inserta entre el Beta Guard y el refresh de sesión:

**Timeout de inactividad de 8 horas.** Cada vez que el usuario visita una página, el middleware anota la hora en una cookie invisible (HttpOnly — no manipulable por JavaScript). La próxima vez que el usuario visita una página, el middleware compara la hora actual con la última anotada. Si pasaron más de 8 horas, cierra la sesión automáticamente y redirige al login con un mensaje "sesión cerrada por inactividad".

**Exenciones:** Las páginas de video, sala de espera, APIs, auth y beta-access están exentas — si un médico está en videollamada durante 9 horas, el timeout no lo saca.

### c) Integración con PR #63 (Beta Guard fail-closed)

**Complementación, no conflicto ni duplicación.** El Beta Guard de PR #63 ya está en main y funciona exactamente igual en el PR. El PR no modifica la lógica del Beta Guard — solo le quita un comentario explicativo ("Antes era fail-open — causó breach de 77 cuentas") y agrega el timeout como paso siguiente.

El orden de ejecución es: Beta Guard → Timeout → Refresh sesión → Noindex. Si el Beta Guard bloquea, el timeout nunca se ejecuta (correcto: no tiene sentido chequear inactividad en la pantalla de acceso beta).

### d) Si se mergea: ¿qué cambia para usuarios reales?

**Sí, cambia algo.** Después del merge:

1. Si un usuario (médico o paciente) deja de usar Docto por más de 8 horas sin cerrar sesión, la próxima vez que abra una página se lo redirige al login con un mensaje de inactividad. Hoy esto no pasa — la sesión dura indefinidamente hasta que Supabase la expire por su cuenta.

2. Se crea una cookie nueva (`docto_last_activity`) en el navegador de cada usuario. Es HttpOnly (invisible para JavaScript), segura (solo HTTPS), y dura 24 horas.

3. Las páginas de video y sala de espera no se ven afectadas — el timeout no aplica ahí.

**Riesgo práctico:** Bajo. El timeout de 8 horas es generoso. Un médico que atiende un turno de mañana y otro de tarde sin cerrar el navegador no va a ser sacado. Solo afecta a quienes dejan la sesión abierta de un día para otro.

---

## Tarea 4 — Riesgos de Mergear sin Fixear

### ¿Qué riesgo hay si mergeamos PR #71 a main HOY con los CRÍTICOS dentro?

**Riesgo bajo, con una condición.** Los 2 bugs críticos (3.3 y 5.1) están en código que nadie llama. Son como una herramienta defectuosa guardada en un cajón: mientras nadie la use, no hace daño. El riesgo aparece si alguien construye la UI de firma y conecta esa UI a estas funciones sin fixear los bugs primero.

### ¿El código nuevo se ejecuta automáticamente?

- **Middleware (timeout):** SÍ, se ejecuta automáticamente en cada visita a Docto.
- **Migraciones SQL:** Ya fueron aplicadas manualmente en producción. El merge solo versiona los archivos — no vuelve a ejecutar nada en la base de datos.
- **Todo lo demás (firma, OTP, CUIL, constantes):** NO se ejecuta. Son archivos de código que están disponibles para ser importados y usados, pero nadie los importa ni los usa hoy.
- **Rutas API (`/api/2fa/generar` y `/api/2fa/validar`):** Caso especial. Después del merge, estas rutas EXISTIRÁN como endpoints accesibles en la URL de Docto. Sin embargo, para usarlas un usuario necesita: (a) estar logueado, (b) ser médico, y (c) hacer un POST con formato específico. No hay ningún botón ni pantalla que las llame. Un atacante tendría que conocer la URL exacta y construir el request manualmente.

### ¿Hay alguna forma de que un atacante externo llegue al código vulnerable después del merge?

**A las rutas API de OTP (`/api/2fa/generar` y `/api/2fa/validar`): Sí, pero con barreras.**

Un atacante necesitaría:
1. Tener credenciales válidas de médico en Docto (sesión de Supabase activa)
2. Conocer la URL `/api/2fa/generar` y hacer un POST
3. Esto le generaría un OTP — pero ¿para qué? No hay nada que pueda hacer con el OTP porque `firmarReceta()` no se puede llamar desde ningún endpoint

**A `firmarReceta()` con el bug 5.1: No.** No hay ninguna ruta API que llame a `firmarReceta()`. La función existe en el código pero no es alcanzable desde internet.

**Resumen: la superficie de ataque post-merge es nula para los bugs críticos.** Las rutas de OTP son alcanzables pero no llevan a nada peligroso sin una ruta de firma (que no existe).

### ¿Hay tests que corren en CI que ejecuten este código?

**No.** CI solo corre tests de Playwright (E2E en navegador). Los tests unitarios de firma y CUIL que están en el PR (`tests/unit/`) no se ejecutan en CI — se corren manualmente con `npx tsx`. Ningún test de Playwright toca las rutas de firma o 2FA.

---

## Tarea 5 — Alternativa: Fixear antes del merge

### ¿Es viable aplicar los fixes 3.3 y 5.1 en este branch antes del merge?

**Sí, es viable y relativamente simple.**

### Fix 3.3 — Ordenamiento de keys en hash

**Qué hay que hacer:** Antes de calcular la huella digital, ordenar los campos del documento de forma determinística. En vez de `JSON.stringify(datos)` (que no garantiza orden), usar una librería que ordene las keys alfabéticamente siempre.

**Complejidad:** Baja. ~30 minutos. Son 2 líneas de código a cambiar (una en `firmarReceta`, otra en `verificarFirma`). Se puede usar `json-stable-stringify` (librería de npm) o escribir una función de ordenamiento recursivo de ~10 líneas.

**Tests adicionales:** Un test que verifique que el hash es igual cuando los datos tienen las keys en distinto orden. ~15 minutos adicionales.

### Fix 5.1 — Verificar OTP antes de firmar

**Qué hay que hacer:** Agregar un tercer parámetro obligatorio a `firmarReceta()`: el ID del OTP ya validado. Dentro de la función, antes de firmar, verificar que: (a) el OTP existe y fue usado (validado), (b) pertenece al mismo médico, (c) corresponde a la misma consulta/turno, y (d) fue validado hace menos de 2 minutos.

**Complejidad:** Moderada. ~1 hora. Cambiar la firma de la función, agregar una consulta a la base de datos, y agregar validaciones. No requiere cambios en UI (que no existe aún).

**Tests adicionales:** Un test que verifique que llamar sin OTP falla, y otro que verifique que llamar con OTP inválido falla. ~30 minutos adicionales.

### ¿Requiere re-auditoría de Roberto?

**Sí, pero mínima.** Los fixes tocan exactamente los puntos que Roberto marcó. Una auditoría focalizada en los 2 fixes (~30 minutos de Roberto) sería suficiente — no hay que re-auditar todo el PR.

### Resumen de esfuerzo

| Fix | Esfuerzo código | Esfuerzo tests | Total |
|-----|----------------|----------------|-------|
| 3.3 Canonicalización JSON | 30 min | 15 min | 45 min |
| 5.1 Verificar OTP | 1 hora | 30 min | 1.5 horas |
| Re-auditoría Roberto | — | — | 30 min |
| **Total** | **1.5 horas** | **45 min** | **~2.5 horas** |

---

## Recomendación Final

### Opción A — Mergear HOY, fixear en Ola 2

**A favor:**
- Versiona las migraciones que ya están en producción (elimina la inconsistencia main vs prod)
- Los bugs críticos no son explotables hoy (código aislado, sin endpoints que lo llamen)
- Desbloquea Olas 2-5 inmediatamente

**En contra:**
- Código con bugs conocidos entra a main (aunque inerte)
- Si alguien construye la UI de firma sin fixear primero, los bugs se activan
- Requiere disciplina: "la primera tarea de Ola 2 es fixear 3.3 y 5.1, antes de tocar cualquier otra cosa"

**Riesgo:** Bajo si se respeta la secuencia. El único código que afecta usuarios reales (timeout middleware) está bien.

### Opción B — Fixear 3.3 + 5.1 en este branch, re-auditar, después mergear

**A favor:**
- Main recibe código limpio sin bugs conocidos
- No requiere disciplina de secuenciación — los bugs ya están resueltos
- La re-auditoría es focalizada y rápida

**En contra:**
- Agrega ~2.5 horas antes del merge
- Necesita rebase del branch (hay 22 commits de main que el branch no tiene) antes o después de los fixes

**Riesgo:** Mínimo. Los fixes son quirúrgicos y bien acotados.

### Mi recomendación como ingeniero: Opción B.

No por el riesgo técnico (que es bajo en ambos casos), sino por higiene: nunca es buena práctica mergear código con bugs CRÍTICOS documentados a main, aunque estén inertes. La inversión de 2.5 horas se paga sola en tranquilidad. Y elimina el riesgo de que en el futuro alguien construya sobre el código buggy sin leer la auditoría de Roberto primero.
