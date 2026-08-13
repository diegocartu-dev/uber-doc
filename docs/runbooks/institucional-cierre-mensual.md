# Runbook — cerrar un mes de facturación institucional

> Aplica **solo a la instancia institucional** (`INSTITUCIONAL=true`). En el B2C
> nada de esto existe: el cron corta en la primera línea y las rutas dan 404.
>
> Origen: **R31-R33** de `06-reglas-operativas.md` (decisiones de Diego del
> 13/08). Hermano del cierre semanal: `institucional-cierre-semanal.md`.

## Qué cambió, en una línea

Antes el mes se sellaba **cuando alguien bajaba el CSV** desde `/panel`. Ya no:
**descargar es leer** (R32). El mes se cierra **solo**, y esto es la puerta de
atrás para cuando el cierre automático no pudo.

## Qué se sella y qué NO

| | Cierre semanal | Cierre mensual |
|---|---|---|
| Qué congela | El **cumplimiento** (horas del acuerdo) | La **facturación** (consultas facturables) |
| Dónde | `acuerdo_semanas` | `encuentros_metering.facturado_periodo` |
| Cuándo | Lunes 04:00 ART | Todos los días 04:00 ART (solo tiene trabajo cuando terminó un mes) |
| Cron | `acuerdo-cerrar-semana` | `metering-cerrar-mes` |

Son dos medidores distintos y no se mezclan (R13). Comparten una sola cosa: la
precondición de que el contador terminó de contar.

## La foto y el revelado

El corte de datos es **el mes calendario completo**: entra todo lo que ocurrió
hasta las **23:59:59 del último día, hora argentina**; lo posterior es del mes
siguiente. Pero el sello se estampa **unas horas después**, en la madrugada del
día 1, porque una consulta que termina 23:55 se clasifica pasada la medianoche
(el contador espera 15 minutos tras el cierre y corre cada 10).

**La foto siempre es del mes; lo que se demora es el revelado.**

### Si el día 1 no se puede, se reintenta al día siguiente

El cron corre **todos los días** a las 04:00 ART y sella **cualquier mes
terminado que siga abierto**, no solo el anterior. Esto no es paranoia: el caso
normal de aborto es una consulta que el profesional abrió a las 22:30 del 31 y
nunca cerró. `cerrar-huerfanas` (00:00 ART) solo cierra las que llevan más de
4 h abiertas, así que a la madrugada del día 1 esa CI sigue viva y bloquea el
sello — con razón. Al día siguiente ya está cerrada y clasificada, y el mes se
sella solo.

Un mes **ya sellado** nunca vuelve a la lista, aunque tenga filas sin sello:
esas son las que llegaron después del cierre, y sellarlas ahora las metería a
una factura ya emitida por la puerta de atrás. Se ven marcadas en
`/admin/periodos`.

## Quién puede correrlo

Admin de **Docto** (`admin_users`), no la administración de la institución
(R32). El cliente puede mirar, filtrar y descargar cualquier mes las veces que
quiera; congelar el número que se le factura es una operación de la plataforma.

## 1. Mirar antes de tocar

```bash
# `periodo` = AAAA-MM. Sin parámetro, el último mes terminado.
curl -s "https://<host-de-la-instancia>/api/admin/institucional/cerrar-mes?periodo=2026-10" \
  -H "Cookie: <cookie de sesión de un admin de Docto>"
```

```json
{ "periodo": "2026-10", "sellable": true, "termino": true, "faltantes": { "sin_fila": 0, "vivos": 0, "total": 0 } }
```

- **`termino`** — si el mes ya cerró en hora AR. Un mes que **no terminó** nunca
  es sellable, por más que `faltantes` dé cero.
- **`sin_fila`** — encuentros ya terminales que el clasificador todavía no
  escribió en `encuentros_metering`.
- **`vivos`** — encuentros del mes que **siguen abiertos**. El caso que importa:
  la consulta que quedó colgada el 31 a las 22:30 no es terminal en la
  madrugada del día 1 (`cerrar-huerfanas` corre a las 00:00 ART y solo cierra
  las que llevan más de 4 h abiertas). Si se sellara igual, su fila aparecería
  después —facturable— sobre un mes ya congelado. **No hace falta hacer nada:**
  el cron vuelve a intentarlo a las 04:00 del día siguiente, cuando el barrido
  ya la cerró, y ahí sella el mes solo.

## 2. Destrabar lo que falte

Igual que en el semanal: `sin_fila > 0` → mirar el cron `metering-clasificar`;
`vivos > 0` y reciente → **esperar** (los crons de resolución y
`cerrar-huerfanas` los cierran solos); `vivos > 0` y viejo → hay un encuentro
trabado, resolverlo por el camino normal desde `/admin`. **No** se puede forzar
el sello, y es a propósito.

## 3. Cerrar

```bash
curl -s -X POST "https://<host-de-la-instancia>/api/admin/institucional/cerrar-mes" \
  -H "Content-Type: application/json" \
  -H "Cookie: <cookie de sesión de un admin de Docto>" \
  -d '{"periodo":"2026-10"}'
```

- **200** → `{ "periodo": "2026-10", "facturables": N, "selladas": N, "selladas_total": N, "ya_estaban": N }`.
  - **`selladas_total`** es el universo congelado: **todas** las filas del mes,
    facturables y no facturables. El sello se le pone al mes entero — si solo se
    le pusiera a lo facturable, el resto seguiría siendo reescribible por el job
    (una consulta "corta" con una receta que llega tarde pasaría a facturable
    sobre un mes ya facturado) y quedaría fuera del alcance de la corrección
    auditada de R33.
  - **`facturables`** es el subconjunto que la factura cobra.
- **409** → la precondición no se cumple; el mensaje dice cuántos faltan y de
  qué tipo. Volver al paso 2.
- **422** → falta `periodo`, no tiene formato `AAAA-MM`, **o el mes todavía no
  terminó**. En un POST el mes se dice siempre, explícitamente: el resultado es
  irreversible.

**Es idempotente.** Correrlo dos veces sobre un mes ya cerrado no toca ninguna
fila: `selladas` queda en 0 y `ya_estaban` muestra el total (`selladas_total`).

## 4. Verificar

Bajar el CSV del mes desde `/panel` (o `GET /api/panel/facturacion/csv`) y
comparar el total con `facturables`. La descarga no cambia nada: se puede
repetir.

## Y si hay que corregir un mes ya sellado

Se puede, **solo el superadministrador de Docto** y **con motivo obligatorio**
(R33): `/admin/periodos`. Cada corrección queda registrada —quién,
cuándo, qué fila, qué cambió y por qué— en `metering_correcciones`, y ese
registro es parte de la auditoría del período. No hay forma de corregir sin
dejar rastro: el trigger de la migración 021 rechaza el UPDATE si no viene con
su fila de auditoría.
