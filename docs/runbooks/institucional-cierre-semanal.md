# Runbook — sellar una semana del acuerdo institucional

> Aplica **solo a la instancia institucional** (`INSTITUCIONAL=true`). En el B2C
> nada de esto existe: el cron corta en la primera línea y las rutas dan 404.
>
> Origen: hallazgo **I2 del gate #405** — `cerrarSemana(semanaAr)` aceptaba la
> semana por parámetro desde el día uno, pero el único que la llamaba era el
> cron de los lunes, que sella **siempre** la semana que acaba de terminar y
> **nunca vuelve** sobre la anterior. Una semana perdida se quedaba sin sellar
> para siempre y no había forma de pasarle el parámetro a nadie.

## Qué es el sello y por qué importa

La semana **en curso** se calcula al vuelo cada vez que alguien abre `/panel`.
La semana **cerrada** se congela en `acuerdo_semanas` y no se recalcula nunca
más: es la promesa de que el cumplimiento que la institución leyó el lunes va a
decir lo mismo en diciembre. Por eso el sello es **irreversible en la práctica**
(para corregirlo hay que reabrir la fila a mano, en un UPDATE aparte, y dejar
constancia — trigger de la migración 015).

De ahí la regla de oro de este runbook: **sellar tarde es barato; sellar un
número que todavía se está formando, no.**

## Quién puede correrlo

Admin de **Docto** (`admin_users`), no la administración de la institución. El
sello es una operación de la plataforma sobre su propio contador: el cliente no
decide cuándo se congela el número que se le factura.

## 1. Mirar antes de tocar

```bash
# `semana` = el LUNES de la semana, AAAA-MM-DD. Sin parámetro, la última terminada.
curl -s "https://<host-de-la-instancia>/api/admin/institucional/cerrar-semana?semana=2026-10-19" \
  -H "Cookie: <cookie de sesión de un admin de Docto>"
```

Respuesta:

```json
{ "semana_ar": "2026-10-19", "sellable": true, "termino": true, "faltantes": { "sin_fila": 0, "vivos": 0, "total": 0 } }
```

- **`termino`** — si la semana ya cerró (pasó el domingo a medianoche AR). Una
  semana que **no terminó** nunca es sellable, por más que `faltantes` dé cero:
  "no falta nada" es trivialmente cierto en una semana que todavía no pasó.

- **`sin_fila`** — encuentros ya terminales que el clasificador todavía no
  escribió en `encuentros_metering`. Causa típica: el cron `metering-clasificar`
  estuvo caído, o la ventana de 14 días quedó corta tras un atraso largo.
- **`vivos`** — encuentros de esa semana que **siguen abiertos**. El caso real
  que motivó el chequeo: una consulta inmediata que quedó colgada el domingo a
  la noche no es terminal el lunes a la madrugada, cuando corre el cron del
  cierre, así que se sellaba la semana sin ella y después la factura la cobraba
  igual.
  Los dos números contractuales, divergiendo en silencio.

  **Los crons se programan en UTC.** `acuerdo-cerrar-semana` es `0 7 * * 1`
  (lunes 04:00 ART) y `cerrar-huerfanas` es `0 3 * * *`, o sea **00:00 ART,
  todos los días** — no "el martes a las 3 AM". El orden importa: el sello corre
  **después** del barrido, nunca antes. Para una CI que arrancó el domingo a las
  20:00, el umbral de 4 h de `cerrar-huerfanas` se cumple a las 00:00 del lunes
  y la cierra esa misma madrugada; el caso que sobrevive es el de una CI que
  arrancó después de las 20:00. Ante la duda, mirar el cron crudo en
  `vercel.json` y convertir a ART (UTC−3), no la memoria.

> **Cambió en la Etapa 8 (extensión de alcance, reportada):** la precondición
> del cierre semanal pasó a compartir código con la del mensual
> (`encuentrosSinClasificarEnRango`). No es un refactor neutro: las consultas
> inmediatas ahora se piden con **un día de margen de cada lado** y se filtran
> por el día de su **asignación** (R31 bis), no por `created_at`. Antes la query
> pedía la semana exacta por `created_at` y el filtro en JS solo podía
> descartar, nunca sumar — así que una CI asignada en el borde de la medianoche
> no entraba a la lista de candidatos y el sello no la veía.
>
> Es un fix, pero **endurece** una precondición que ya corre en producción:
> semanas que antes sellaban ahora pueden abortar por una CI de borde. La
> respuesta sigue siendo la misma (esperar y volver a mirar), y desde la Etapa 8
> el mensual reintenta solo todos los días.

## 2. Destrabar lo que falte

| Qué dice el diagnóstico | Qué hacer |
|---|---|
| `sin_fila > 0` | Revisar el cron `metering-clasificar` (corre cada 10 min). Sus logs traen `pendientes` y `pendientes_sin_fila`. Si hay atraso, dejarlo correr y volver a mirar. |
| `vivos > 0` y la semana es reciente | **Esperar.** Van a cerrar solos: `resolver-turnos-vencidos` y `resolver-consultas-vencidas` (cada 10 min) y `cerrar-huerfanas` (`0 3 * * *` UTC = **00:00 ART, todos los días**). |
| `vivos > 0` y la semana es vieja | Hay un encuentro trabado. Buscarlo en `/admin` y resolverlo por el camino normal (cerrarlo o marcarlo como corresponda). **No** forzar el sello: no hay forma de hacerlo, y es a propósito. |

## 3. Sellar

```bash
curl -s -X POST "https://<host-de-la-instancia>/api/admin/institucional/cerrar-semana" \
  -H "Content-Type: application/json" \
  -H "Cookie: <cookie de sesión de un admin de Docto>" \
  -d '{"semana":"2026-10-19"}'
```

- **200** → `{ "semana_ar": "...", "profesionales": N, "sellados": N, "ya_estaban": N, "errores": 0 }`.
- **409** → la precondición no se cumple; el mensaje dice cuántos faltan y de
  qué tipo. Volver al paso 2.
- **422** → falta `semana`, no es un lunes, **o la semana todavía no terminó**.
  **El endpoint no adivina la semana en un POST**: el resultado es irreversible
  y la semana que se sella se dice siempre, explícitamente.

> **Por qué el 422 de "todavía no terminó" es el más importante.** Es el único
> error de tipeo que el resto de las precondiciones no atrapa. Con el lunes de
> **esta** semana (o uno futuro), `faltantes` da cero —no hay nada vivo— y
> `cumplimientoDeSemana` cuenta solo lo transcurrido: se sellaría el
> cumplimiento de un día y medio, o de cero, como si fuera la semana entera. Y
> el sello es inmutable: después el cron lo cuenta como `ya_estaban` y no
> recalcula nunca, así que el panel muestra "Cerrada" con badges definitivos
> —incluido "Incompleto"— sobre un número que nunca se midió. Corregirlo es
> reabrir filas a mano por SQL.

**Es idempotente.** Correrlo dos veces sobre una semana ya sellada no recalcula
nada: `ya_estaban` sube y `sellados` queda en 0. El primer número es el que
vale.

## 4. Verificar

Abrir `/panel?semana=2026-10-19`: el chip tiene que decir **"Cerrada"** y los
badges de la tabla de cumplimiento pasan a ser definitivos (recién ahí puede
aparecer "Incompleto" — nunca con la semana abierta, R30).

## Notas operativas relacionadas

- **`max-rows` de la instancia ≥ 1000** (hallazgo S1 del gate #405). Todas las
  lecturas del metering paginan con `.range()`, pero el tamaño de página asume
  el default de PostgREST. Si en el proyecto de la instancia quedó configurado
  en menos, revisar `PAGINA_DB` / `TAMANIO_PAGINA` antes de confiar en un
  conteo.
- **El CSV de facturación YA NO SELLA** (R32, decisión de Diego del 13/08).
  Descargar es leer: la institución puede bajar el detalle de cualquier mes las
  veces que quiera y no cambia una fila. El sello de la facturación pasó a ser
  automático y mensual — runbook aparte:
  `docs/runbooks/institucional-cierre-mensual.md`.
- **Son dos sellos distintos y no se mezclan.** El semanal congela el
  CUMPLIMIENTO (`acuerdo_semanas`, horas); el mensual congela la FACTURACIÓN
  (`encuentros_metering.facturado_periodo`, consultas). Comparten la
  precondición —el contador terminó de contar— y nada más.
