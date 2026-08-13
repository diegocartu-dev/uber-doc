# Etapa 8 — ronda de correcciones del gate

*13/08/2026. Instancia institucional, rama `institucional/etapa-8`. Sin aplicar
SQL, sin push. Complementa `2026-08-13-institucional-cierre-etapas-0-6.md`.*

La Etapa 8 implementó cuatro decisiones que Diego tomó el 13/08 sobre código ya
mergeado: **R6 flexible** (el turno publicado se puede tomar aunque la semana
esté cumplida), **R31/R32** (el mes se cierra solo; descargar es leer), **R33**
(el superadmin corrige un mes cerrado, nunca en silencio) y **R10 bis**. El gate
posterior devolvió 17 hallazgos, con solapamientos: eran **doce problemas**
distintos. Este documento es lo que se hizo con ellos.

---

## Lo que estaba mal de verdad: el sello congelaba medio mes

Tres hallazgos, una sola causa. `sellarPeriodo` marcaba `facturado_periodo`
**solo** en las filas `clasificacion = 'facturable'`. Todo el resto del mes —las
consultas cortas, las dos ausencias, la falla técnica— quedaba sin sello, y
"mes congelado" pasaba a ser media verdad:

- **El job las seguía reescribiendo.** `motivoIntocable()` protege por
  `facturado_periodo`, así que sin sello no protegía nada, y la ventana del
  clasificador son 14 días. Su regla es `segundos >= 60 || documentos > 0 →
  facturable`. Alcanza con que la receta se guarde tarde —el guardado del
  profesional es fire-and-forget— para que una consulta del 31 clasificada
  "corta" pase a **facturable el 3 del mes siguiente**. El CSV de un mes ya
  facturado sumaba una consulta: sin sello, sin auditoría, y sin aparecer en
  `/admin/periodos`.
- **Y eran inalcanzables por la puerta de R33.** La RPC aborta si la fila no
  está sellada, así que la corrección más típica —"esto se marcó como ausencia
  del paciente y en realidad se atendió, hay que facturarlo"— no se podía hacer.
  La puerta corregía en un solo sentido: sacar de la factura, nunca agregar.

**Cómo se cerró**, en tres commits que hay que leer juntos:

1. El sello se le pone al **mes entero**. `ya_estaban` pasa a medirse contra el
   universo sellado (`selladas_total`) y no contra las facturables, que es un
   subconjunto.
2. La factura de un mes sellado sale **del sello** y no del rango de fechas
   (`filtroDeFacturacion`). Una fila que aparece después del cierre no se le
   suma sola a una factura ya emitida.
3. `/admin/periodos` lista **por mes calendario**, no por sello, y marca "Llegó
   después del cierre" a las que no lo llevan. La diferencia entre los dos
   conjuntos es justamente lo que hay que ver: si el listado la escondiera, el
   auditor vería N filas y el sistema tendría N+1.

Esas filas tardías quedan **fuera** de la factura y **fuera** de la puerta
auditada, a la vista y a decisión de un humano. Es la única salida honesta: ni
cobrarlas a escondidas ni hacerlas desaparecer.

---

## El mes que no se cerraba solo

`metering-cerrar-mes` corría el día 1 a las 02:00 ART y cerraba **siempre** el
mes anterior, sin volver nunca sobre el que faltó. Dos problemas encadenados:

- **Corría antes del barrido.** Lo único que terminaliza una consulta que el
  profesional dejó abierta es `cerrar-huerfanas`, a las 00:00 ART y con 4 h de
  antigüedad mínima. Una CI abierta a las 22:30 del 31 sigue viva a las 02:00
  del día 1, la precondición la cuenta como viva y el cierre aborta — con razón.
- **Y nadie reintentaba.** La única señal era un mail rojo. Si se perdía, el mes
  quedaba sin sellar indefinidamente y en silencio: el watchdog vigila el
  latido, y el cron latía.

Ahora corre **todos los días a las 04:00 ART** —después del barrido— y sella
**todo mes terminado que siga abierto**, no solo el anterior. La CI del ejemplo
la cierra el barrido a las 00:00 del día 2, el clasificador la escribe, y a las
04:00 el mes se sella solo. Un mes **ya sellado** nunca vuelve a la lista aunque
tenga filas sin sello: esas son las tardías.

`acuerdo-cerrar-semana` tenía el mismo desfase (lunes 02:00) y también pasa a
las 04:00.

---

## La puerta de R33 tenía tres agujeros

La 021 se presentaba diciendo "no hay forma de corregir una fila sellada sin
dejar rastro, ni desde el código, ni desde el SQL Editor". No era cierto:

| Agujero | Qué permitía | Cómo se cerró |
|---|---|---|
| **Levantar el sello seguía permitido** | El cuerpo del trigger venía tal cual de la 014, con la rama que deja pasar un UPDATE que solo pone `facturado_periodo = NULL`. Los tres pasos por SQL —levantar, corregir la fila desprotegida, volver a sellar— seguían disponibles, sin una fila de auditoría. Y es el mismo actor que puede llamar a la RPC | Esa rama no existe más: cualquier UPDATE sobre una fila sellada sin constancia **de esta transacción** es un `RAISE` |
| **La constancia se podía reusar** | El gate pedía que existiera una fila de `metering_correcciones` con ese id y ese encuentro, no que fuera nueva. Una fila corregida una vez quedaba desbloqueable para siempre reusando aquel id | `txid` en la constancia + `c.txid = txid_current()` en el trigger. Con la tabla append-only, es de un solo uso |
| **El desbloqueo no estaba acotado** | Lo único que impedía era mover `facturado_periodo`: el mismo UPDATE podía cambiar el reloj, los documentos o el precio, mientras la constancia registraba solo el de→a de la clasificación | El trigger neutraliza los cuatro campos de la decisión y rechaza cualquier otro cambio |

De yapa: `admin_user_id` no tenía nada que lo atara a `admin_users` (la
verificación vivía solo dentro de la RPC), así que una constancia escrita a mano
podía atribuirse a cualquier UUID. Un trigger de INSERT exige ahora un
**superadministrador activo**. Con trigger y no con FK a propósito: el mail se
guarda desnormalizado para que la auditoría sobreviva a la baja de la cuenta.

**La 021 se corrigió en el archivo**, no con una 022: nunca se aplicó en ninguna
base, y encadenar una migración que deshaga lo que la anterior acaba de crear
deja peor registro que un solo archivo correcto.

---

## Lo menor, en una línea cada uno

- **La auditoría decía "intacta" a ciegas.** Las dos lecturas auxiliares de
  `encuentrosSelladosDePeriodo` descartaban el `error` y no paginaban: si la de
  correcciones fallaba, el badge "Corregida N×" desaparecía y la pantalla
  afirmaba que una fila corregida estaba intacta.
- **El combo de meses leía la tabla entera** en cada carga para quedarse con ~12
  strings. Pasa a un `SELECT DISTINCT` del lado del servidor.
- **El mail de un cron caído decía "HTTP 500" y nada más.** Ahora adjunta el
  cuerpo JSON de la respuesta — que es donde el cierre mensual pone el mes y el
  motivo.
- **La fila sin nada que ofrecer simulaba un botón.** Al abrir R6 flexible se le
  sacó `cursor: default` a `.lleno-sem`, y el único caso genuinamente no
  elegible (acuerdo completo + agenda vacía) quedó con manito, hover y click
  mudo. Clase propia (`no-elegible`) + `aria-disabled`.
- **"Nadie activo en este momento" era mentira** cuando el único activo estaba
  en la sección de los que ya cumplieron su acuerdo — el caso que más duele,
  con el paciente del otro lado del mostrador.
- **El doc de cierre de las Etapas 0-6** seguía acreditando el guard R6 de la
  reprogramación, que esta etapa eliminó. Anotada la reversión.

---

## Extensiones de alcance (para que las apruebe Diego)

Dos, las dos consecuencia técnica de lo de arriba y ninguna pedida en el
enunciado de la etapa:

1. **`metering-cerrar-mes` pasa de mensual a diario** (y `acuerdo-cerrar-semana`
   de las 02:00 a las 04:00). Es lo que hace que R31 —"el mes se cierra solo"—
   sea verdad cuando el día 1 aborta legítimamente. Efecto lateral bueno: el
   umbral del watchdog baja de 31 días (aviso a los ~46) a 24 h.
2. **La precondición del cierre SEMANAL cambió de comportamiento.** Al compartir
   código con la mensual (`encuentrosSinClasificarEnRango`), las consultas
   inmediatas se piden con un día de margen de cada lado y se filtran por el día
   de su **asignación** (R31 bis), no por `created_at`. Es un fix —una CI
   asignada en el borde de la medianoche no entraba a la lista de candidatos—
   pero **endurece** una precondición que ya corre en producción: semanas que
   antes sellaban pueden abortar por una CI de borde. Anotado en el runbook
   semanal, y ahora con tests (`correrDias`, `diaARdeConsulta`).

---

## Qué queda abierto

- **La fila que llega tarde no se factura sola.** Queda visible y marcada en
  `/admin/periodos`, fuera de la factura del mes que ya se emitió y fuera de la
  puerta auditada. Falta la decisión de producto: ¿se cobra en el mes siguiente,
  se descarta, o se emite una nota de débito? Hoy no hay pantalla para hacerlo,
  a propósito — inventar una regla de facturación sin que la decida Diego era
  peor que dejarla a la vista.
- **La 021 sigue sin aplicarse.** Nada de esto está probado contra una base
  real: los tests leen el `.sql` y verifican que las cláusulas están escritas,
  que es lo más cerca que se llega sin instancia. La verificación de los
  `REVOKE` del README sigue pendiente y es obligatoria post-aplicación.

## Verificación

`npm run test:unit` (306 casos, incluido el golden de la regla de oro), `tsc` y
`eslint` sobre lo tocado: verde. Un commit por hallazgo. Sin push, sin PR y sin
SQL aplicado.
