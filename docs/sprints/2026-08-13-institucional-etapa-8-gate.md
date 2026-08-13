# Etapa 8 — ronda de correcciones del gate

*13/08/2026. Instancia institucional, rama `institucional/etapa-8`. Sin aplicar
SQL, sin push. Complementa `2026-08-13-institucional-cierre-etapas-0-6.md`.*

>  # 🛑 ORDEN DE DESPLIEGUE — PRIMERO EL SQL, DESPUÉS EL CÓDIGO
>
> **Las migraciones 021, 022, 023 y 024 se aplican a la base de la instancia
> ANTES de desplegar este código.** No es una preferencia: el código de esta
> etapa **falla cerrado** a propósito —si no puede leer si un período está
> cerrado, tira, porque una lectura que falla en silencio haría que un período
> cerrado se viera abierto y el barrido lo volviera a sellar—. Con el código
> desplegado y el SQL sin aplicar, `/admin/periodos`, la card de facturación y
> los dos crons de cierre responden **500**.
>
> Las cuatro son reentrantes. Runbooks y checklist de verificación:
> `supabase/migrations-institucional/README.md`.

La Etapa 8 implementó cuatro decisiones que Diego tomó el 13/08 sobre código ya
mergeado: **R6 flexible** (el turno publicado se puede tomar aunque la semana
esté cumplida), **R31/R32** (el mes se cierra solo; descargar es leer), **R33**
(el superadmin corrige un mes cerrado, nunca en silencio) y **R10 bis**. El gate
posterior devolvió 17 hallazgos, con solapamientos: eran **doce problemas**
distintos. Este documento es lo que se hizo con ellos.

Y después una **segunda ronda**: el gate volvió a mirar el PR con las
correcciones puestas y lo bloqueó por un crítico reproducido —el cierre de un mes
ya cerrado agrandaba su factura—, dos importantes y ocho sugerencias. Está todo
más abajo, en "Segunda ronda".

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

---

## Segunda ronda: el gate bloqueó el PR

El auditor devolvió **1 crítico reproducido, 2 importantes y 8 sugerencias**.
Esto es lo que se hizo con ellos.

### El crítico: cerrar dos veces un mes cerrado lo agrandaba

`cerrarMes` no preguntaba si el mes ya estaba sellado, y el UPDATE del sello
apunta a las filas **sin** sello — que en un mes cerrado son **exactamente las
que llegaron tarde**. O sea que un `POST /api/admin/institucional/cerrar-mes`
"por las dudas" sellaba lo tardío y lo metía en una factura ya emitida: sin
constancia en `metering_correcciones`, sin motivo y sin que nadie lo pidiera. La
puerta de R33, esquivada por al lado. El cron nunca lo disparó
(`mesesPendientesDeSellar` saltea los sellados), pero la ruta manual llama a
`cerrarMes` directo — y el runbook la presentaba como idempotente, que era falso.

Un mes cerrado ahora se responde con su foto y `selladas: 0`, sin tocar la base y
sin evaluar siquiera la precondición del contador. Y la respuesta informa
`tardias`: el operador se entera de que existen por acá, no cuando no le cuadre
la factura.

Lo que `cerrarMes` toca de la base pasa por un **puerto** con default real. Es lo
que permite fijar con un test la secuencia completa —sellar, que llegue una fila
tardía, volver a cerrar, y que la factura siga diciendo lo mismo—, que contra
Postgres no se puede escribir desde el runner unitario.

### El mismo agujero tenía otras dos puertas

Cerrarlas era barato y quedaban abiertas:

- **El INSERT** (migración **022**). La 014 y la 021 blindan la fila sellada
  contra UPDATE y DELETE; una fila que **nace** con `facturado_periodo` le agrega
  una línea a una factura emitida y ningún trigger se entera. No hace falta mala
  fe: alcanza con querer "recuperar a mano" una consulta que el job perdió y
  dejarla prolijamente en su mes.
- **El mes vacío** (migración **023**). "¿Está cerrado?" se contestaba contando
  filas selladas, así que un mes con **cero** encuentros se veía igual que uno
  que nunca se cerró. El día que aparecía una fila tardía de ese mes, el barrido
  lo tomaba como abierto y la sellaba. Se resolvió con **marca explícita**
  (`metering_periodos_cerrados`) y no documentando la limitación, porque la
  consecuencia no era cosmética: era la factura de un mes cerrado moviéndose
  sola. El orden es sellar → marcar, nunca al revés (un mes marcado con sus filas
  sin sellar facturaría cero teniendo encuentros); "cerrado" es la marca **o** el
  sello, para que los meses cerrados antes de la 023 no queden en el limbo.

### El cierre semanal tampoco reintentaba

Mismo agujero que tenía el mensual, y esta etapa lo empeoró: al compartir la
precondición endurecida, el cierre semanal **aborta más seguido** sobre un cron
que sellaba siempre la semana anterior y no volvía nunca. Ahora tiene lista de
pendientes (`semanasPendientesDeSellar`, hasta 8 semanas), el cron las recorre —
si una aborta sigue con las otras y el 500 sale igual — y una semana ya sellada
no vuelve a la lista.

### Lo menor de esta ronda

- **El checklist de verificación de las migraciones no se podía correr.** Tres
  pasos rebotaban contra las defensas que la propia etapa endureció: el ataque
  del job vs. el humano arrancaba levantando el sello (hoy prohibido), la
  constancia "de otra fila" se firmaba con un UUID inventado (hoy rechazado), y
  la limpieza dejaba la fila sintética imborrable para siempre. Reordenado por
  orden de ejecución, con los dos ataques nuevos (022 y 023) y una limpieza que
  desactiva los triggers explícitamente.
- **La 021 no era reentrante** (sin `IF NOT EXISTS` ni `DROP TRIGGER IF EXISTS`,
  a diferencia de la 019) y no había orden de despliegue escrito. Las dos cosas
  ahora están, con la tabla de qué se cae si el código llega antes que el SQL.
- **La 021 declara lo que NO cierra**: una constancia habilita todos los UPDATE
  de esa transacción sobre esa fila, la firma dice quién pero no prueba quién, y
  el dueño de la base puede desactivar el trigger. Todo del lado de quien ya
  tenía service role — son los límites de lo que el registro puede afirmar.
- **El runbook mensual explica la fila tardía**: qué es, qué no hacer, quién
  decide y las tres salidas posibles.
- **Dos textos**: el comentario del reparto masivo describía la regla vieja
  ("acuerdo completo no seleccionable") y el aviso de `/admin/periodos` decía
  *"3 consultas de este mes llegó aron"*.

---

## Extensiones de alcance (para que las apruebe Diego)

Cuatro, todas consecuencia técnica de lo de arriba y ninguna pedida en el
enunciado de la etapa:

1. **`metering-cerrar-mes` pasa de mensual a diario.** Es lo que hace que R31 —"el
   mes se cierra solo"— sea verdad cuando el día 1 aborta legítimamente. Efecto
   lateral bueno: el umbral del watchdog baja de 31 días (aviso a los ~46) a 24 h.
2. **`acuerdo-cerrar-semana` pasa de los lunes a diario** (y de las 02:00 a las
   04:00). Sin eso, la lista de pendientes que se le agregó se consultaría una
   vez por semana y el reintento llegaría siete días tarde. Su umbral de watchdog
   baja de ~10,6 días a ~1,5.
3. **La precondición del cierre SEMANAL cambió de comportamiento.** Al compartir
   código con la mensual (`encuentrosSinClasificarEnRango`), las consultas
   inmediatas se piden con un día de margen de cada lado y se filtran por el día
   de su **asignación** (R31 bis), no por `created_at`. Es un fix —una CI
   asignada en el borde de la medianoche no entraba a la lista de candidatos—
   pero **endurece** una precondición que ya corre en producción: semanas que
   antes sellaban pueden abortar por una CI de borde. Anotado en el runbook
   semanal, y ahora con tests (`correrDias`, `diaARdeConsulta`).
4. **El mail de alerta de TODOS los crons del B2C ahora incluye hasta 600
   caracteres del cuerpo de la respuesta.** Es la única extensión que toca al
   B2C y hay que decirla con todas las letras. Salió de arreglar el mail del
   cierre mensual —decía "devolvió HTTP 500" y el motivo quedaba solo en los logs
   de Vercel—, pero `detalleDelCuerpo` vive en `src/lib/cron-guard.ts`, que
   envuelve a los ~25 crons del producto. Consecuencia: cuando falle un cron del
   B2C, el mail a Diego va a traer el JSON de la respuesta adentro del bloque
   "Detalle técnico". Es más información y ninguna que no fuera nuestra (son
   respuestas de nuestros propios endpoints), pero es un cambio de comportamiento
   en producción del B2C, no en la instancia.

---

## Tercera ronda: los residuales del gate

El verificador confirmó que el crítico (cerrar dos veces un mes cerrado) quedó
cerrado, y dejó siete residuales. Esto es lo que se hizo con cada uno.

### El mismo crítico seguía abierto del lado SEMANAL

Con el padrón vacío, `cerrarSemana` no tenía ninguna fila que escribir en
`acuerdo_semanas` y volvía sin dejar rastro: esa semana **nunca quedaba
registrada como cerrada**. Seguía apareciendo pendiente al día siguiente, y el
día que entraba un profesional al padrón el barrido la veía abierta y la sellaba
**con él** — cumplimiento sellado sobre una semana que la institución ya había
leído como "en curso". Es exactamente el hueco que la 023 cerró para el mes, por
la puerta que le quedaba del lado semanal.

Misma solución: **marca explícita** (`acuerdo_semanas_cerradas`, migración
**024**, inmutable), orden sellar → marcar, "cerrada" = la marca **o** las filas
selladas (transición para las semanas cerradas antes de la 024), y una semana ya
cerrada devuelve enseguida sin recalcular ni evaluar la precondición del
contador — la ruta manual llama a `cerrarSemana` directo. Lo que toca de la base
pasa por un puerto con default real, que es lo que permite fijar la secuencia
con un test: cerrar en cero, que entre alguien al padrón, volver a cerrar, y que
la semana vieja no se le selle.

### El barrido semanal se lo comían las más viejas

`pendientes.slice(0, 2)` toma las DOS MÁS VIEJAS. Alcanza con que dos semanas
viejas se traben para que monopolicen todas las corridas y la semana recién
terminada —la única que alguien va a mirar el lunes— no se toque hasta que la
ventana de ocho las expulse: seis semanas de atraso, con el watchdog en verde.

La marca de la 024 destraba el caso más común (la semana sin padrón, que nunca
llegaba a registrar sello), pero no los otros: la precondición del contador
puede abortar indefinidamente por un encuentro que quedó mal. `semanasDeLaCorrida`
reserva el último lugar de cada corrida para la pendiente más reciente.

### El golden test de la regla de oro no mordía

Recorría `CRONS_SOLO_INSTITUCIONALES` llamando al helper: eso verifica que el
helper está bien, no que los crons lo **usen**. Un cuarto cron agregado a la
lista sin la llamada en su `route.ts` pasaba en verde. Ahora el test lee los ocho
`route.ts` y exige, por cada uno: que importe el helper del módulo correcto, que
lo llame con su key, que **devuelva** el corte, y que no use el helper del otro
lado. Verificado por mutación.

### La extensión al B2C que nadie pidió, gateada

`detalleDelCuerpo` hacía que los ~25 crons del B2C mandaran hasta 600 caracteres
del cuerpo de la respuesta en el mail de alerta —varios devuelven listas con ids
de consultas y de turnos—. Era la extensión de alcance nº 4 de la ronda
anterior, y la única que tocaba producción del B2C. Queda gateada por
`esInstitucional()`: el detalle se agrega solo en la instancia. En el B2C el mail
vuelve a ser **exactamente** el de antes, verificado carácter por carácter contra
el texto de `main` (el cambio, además del cuerpo, había convertido un espacio en
un salto de línea).

### Lo menor de esta ronda

- **La 014 describía una regla que la 021 eliminó** ("el único UPDATE admitido
  sobre una fila sellada es levantar el sello"). Quien leyera la 014 sola
  aprendía lo contrario de lo que hace la base. Marcada como reemplazada, con la
  regla vigente y el puntero a la 021.
- **El checklist de ataques podía correrse contra la nada.** La preparación
  insertaba **0 filas en silencio** en una instancia sin profesionales cargados
  —que es justo cuándo se corre—, y como el resultado esperado de casi todos los
  ataques es *un error*, la ausencia de la fila se confundía con la defensa
  funcionando. Ahora falla ruidosamente. Y el ataque 7 (TRUNCATE), que es
  **destructivo** si la 019 no está aplicada, exige confirmar los dos triggers
  antes de correrse.
- **El orden de despliegue**, arriba de todo: en este documento, en el README de
  las migraciones y en los dos runbooks.

---

## Cuarta ronda: los dos residuales del cierre semanal

El verificador confirmó los cierres de la tercera ronda y dejó dos residuales,
los dos del lado semanal.

### El panel de una semana cerrada se movía solo

`cerrarSemana` ya no vuelve sobre una semana cerrada, pero el **panel** la
calculaba igual: su universo era *"el padrón de HOY ∪ los sellados"*, así que
todo profesional dado de alta **después** del cierre estrenaba una fila viva
—con sus horas comprometidas enteras y cero cumplidas— en una semana que la
institución ya había leído. En la semana cerrada **en cero** —la del padrón
vacío, justo la que la 024 existe para poder afirmar— el efecto era completo:
cero filas antes del alta, una de 10 h después.

No mueve plata. Mueve el KPI: `totalDeBolsa` suma las filas listadas, así que el
porcentaje de arriba cambiaba solo entre dos visitas al mismo panel — que es
exactamente lo que la foto viene a impedir (R30/R31: la semana cerrada no
cambia).

Ahora, si la semana está cerrada —la marca de la 024 **o** al menos una fila
sellada, la misma condición que `semanaEstaCerrada`—, el cumplimiento sale de lo
**sellado** y el universo es el que existía al cierre. La rama en vivo ni se
evalúa: no lee el padrón, ni el config, ni las cuatro tablas del cálculo. Las
lecturas del sello pasan por un puerto con default real, que es lo que permite
fijar el caso contra la función real y no contra una imitación.

### Con las dos puntas trabadas, el medio no se intentaba nunca

Reservar el último lugar de la corrida para la más reciente arregló la punta
nueva y dejó **el mismo hambre una fila más abajo**. Con `max = 2` y dos
pendientes trabadas de forma permanente —la más vieja y la más reciente— la
corrida es siempre `[la vieja rota, la reciente rota]`, y las del medio no se
intentan **nunca**: esperan a que la ventana de ocho las expulse, unas ocho
semanas de atraso sobre semanas que sí se podían sellar. Reproducido por el
verificador: con la primera y la última trabadas, seis corridas no sellaron
nada.

El cupo que queda después de la reserva ahora **rota**: cada corrida arranca un
lugar más adelante en la lista de viejas, así que toda pendiente se intenta al
menos una vez cada `viejas.length` corridas, esté trabada la que esté. Sin
guardar en ninguna tabla qué se intentó ayer — el índice sale del día
(`corridaDelBarrido`). Con `corrida = 0` el reparto es idéntico al anterior.

---

## Qué queda abierto

- **La fila que llega tarde no se factura sola.** Queda visible y marcada en
  `/admin/periodos`, fuera de la factura del mes que ya se emitió y fuera de la
  puerta auditada. Falta la decisión de producto: ¿se cobra en el mes siguiente,
  se descarta, o se emite una nota de débito? Hoy no hay pantalla para hacerlo,
  a propósito — inventar una regla de facturación sin que la decida Diego era
  peor que dejarla a la vista. **El procedimiento manual ya está escrito** en el
  runbook mensual ("La fila que llega tarde"), incluido lo que no hay que hacer.
- **Las cuatro migraciones siguen sin aplicarse** (021, 022, 023, 024). Nada de
  esto está probado contra una base real: los tests leen el `.sql` y verifican
  que las cláusulas están escritas, que es lo más cerca que se llega sin
  instancia. La verificación del README —los `REVOKE` y los once ataques— sigue
  pendiente y es obligatoria post-aplicación. **Y el orden importa: primero el
  SQL, después el deploy** (ver el cartel del principio: con la 023 o la 024 sin
  aplicar, la facturación del panel y los cierres tiran 500).
- **La marca de cierre convive con el sello de las filas**, en las dos
  ventanas. "Cerrado" es la marca **o** al menos una fila sellada, para que los
  períodos cerrados antes de la 023 / la 024 no queden en el limbo. Es deuda de
  transición: cuando todos los períodos vivos tengan marca, la segunda mitad de
  la condición se puede sacar.
- **El techo del barrido MENSUAL sigue siendo `slice(0, 3)`.** El mismo patrón
  de hambre que se corrigió en el semanal existe ahí, más diluido (3 lugares
  sobre 13 candidatos, y los meses trabados son raros). No se tocó para no
  extender el alcance sin necesidad; si algún día un mes se traba de forma
  permanente, la solución ya está escrita (`semanasDeLaCorrida` es genérica).
- **La firma de una corrección no prueba quién la hizo**, solo que es un
  superadministrador activo (ver el bloque nuevo en la 021). Atarlo de verdad
  pide que la corrección viaje por una sesión autenticada en vez de service role.
- **El golden de la regla de oro sigue siendo un test de FORMA** (deuda anotada,
  no implementada — ver abajo).

---

## Deuda: el golden de la regla de oro mira la forma, no lo que pasa

La tercera ronda lo mejoró —antes recorría `CRONS_SOLO_INSTITUCIONALES` llamando
al helper, o sea que verificaba el helper y no que los crons lo usaran; ahora lee
los ocho `route.ts`—, pero lo que hace es **buscar texto con expresiones
regulares**: que el archivo importe el helper del módulo correcto, que lo llame
con su key y que devuelva el corte. Eso deja dos huecos que el gate no ve:

1. **La posición no se verifica.** Un `cortarSiB2C` colocado *después* de trabajo
   con efectos —una lectura, un `upsert`, un mail— pasa el test igual: el texto
   está y el corte se devuelve, pero en el B2C el cron ya hizo el daño antes de
   cortar. La regla de oro dice "con el flag apagado, idéntico"; el test de hoy
   solo dice "en algún lugar del archivo hay un corte".
2. **Un cron institucional nuevo que nadie agregue a la lista no se revisa.** El
   test recorre `CRONS_SOLO_INSTITUCIONALES`: lo que no está en la lista no
   existe para él. El día que la instancia sume un cuarto cron y alguien olvide
   la línea de la lista, el archivo entra a producción sin gate y sin que nada se
   ponga rojo — que es el mismo tipo de agujero que el test vino a cerrar, un
   nivel más arriba.

**Cómo endurecerlo, en orden de costo** (no se hizo acá para no extender el
alcance de una ronda de residuales; ninguna de las tres es urgente porque hoy los
ocho `route.ts` cortan en la primera línea y están verificados a mano):

- **(a) Exigir que el corte sea lo PRIMERO del handler.** Sigue siendo forma,
  pero cierra el hueco caro: que entre el `async function handler()` y la línea
  del corte no haya ningún `await`, ni un `.from(`, ni un `createAdminClient()`.
  Es una regex más, con el texto entre las dos posiciones como evidencia del
  fallo.
- **(b) Descubrir los crons del disco en vez de leer una lista.** Recorrer
  `src/app/api/cron/*/route.ts` y exigir que **cada** uno esté declarado en
  exactamente una de las tres categorías: Capa C, solo-institucional, o "corre en
  los dos lados" (una tercera lista explícita, hoy inexistente). Un cron nuevo sin
  clasificar rompe el test hasta que alguien decida de qué lado está. Es la única
  forma de que "lo que no está en la lista" deje de ser un punto ciego.
- **(c) Probar el comportamiento y no el texto.** Importar el `route.ts`, llamar
  a su `GET` con `INSTITUCIONAL` apagado y un `createAdminClient` stubbeado que
  falle ante cualquier query, y exigir cero llamadas. Es lo único que prueba de
  verdad "no hizo nada". Cuesta más (el runner unitario no importa un route de
  Next tal cual: hay que hacer inyectable el cliente de Supabase, o mover el
  handler a un módulo aparte que el route envuelva), y es el candidato natural si
  algún día un cron de estos hace algo más pesado que leer.

## Verificación

`npm run test:unit` (**347 casos**, incluido el golden de la regla de oro —que
ahora lee los `route.ts`—, la secuencia completa de los dos cierres, el panel de
una semana cerrada y el barrido con dos semanas trabadas), `tsc` y `eslint` sobre
lo tocado: verde. Un commit por hallazgo. Sin SQL aplicado.

Los dos residuales de la cuarta ronda se verificaron **por mutación**: sacándole
la marca a `cumplimientoSaleDeLoSellado` y fijando la rotación en cero, los tres
tests nuevos se ponen rojos y el resto sigue verde.
