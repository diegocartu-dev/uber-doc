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
{ "semana_ar": "2026-10-19", "sellable": true, "faltantes": { "sin_fila": 0, "vivos": 0, "total": 0 } }
```

- **`sin_fila`** — encuentros ya terminales que el clasificador todavía no
  escribió en `encuentros_metering`. Causa típica: el cron `metering-clasificar`
  estuvo caído, o la ventana de 14 días quedó corta tras un atraso largo.
- **`vivos`** — encuentros de esa semana que **siguen abiertos**. El caso real
  que motivó el chequeo: una consulta inmediata colgada el domingo a las 20:00
  no es terminal el lunes a las 02:00 (la cierra `cerrar-huerfanas` el martes a
  las 3 AM), así que se sellaba la semana sin ella y después la factura la
  cobraba igual. Los dos números contractuales, divergiendo en silencio.

## 2. Destrabar lo que falte

| Qué dice el diagnóstico | Qué hacer |
|---|---|
| `sin_fila > 0` | Revisar el cron `metering-clasificar` (corre cada 10 min). Sus logs traen `pendientes` y `pendientes_sin_fila`. Si hay atraso, dejarlo correr y volver a mirar. |
| `vivos > 0` y la semana es reciente | **Esperar.** Van a cerrar solos: `resolver-turnos-vencidos` (cada 10 min), `resolver-vencidas` y `cerrar-huerfanas` (3 AM). |
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
- **422** → falta `semana` o no es un lunes. **El endpoint no adivina la semana
  en un POST**: el resultado es irreversible y la semana que se sella se dice
  siempre, explícitamente.

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
- **El CSV de facturación SELLA.** Bajar el detalle de un mes ya terminado desde
  `/panel` marca `facturado_periodo` en sus filas y las vuelve inmutables. El mes
  en curso no se sella. (Si alguna vez se quiere una vista "para mirar" sin
  sellar, hay que separarla — está anotado como señal para Diego en el gate.)
