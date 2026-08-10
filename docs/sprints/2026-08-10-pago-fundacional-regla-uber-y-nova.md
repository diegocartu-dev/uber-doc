# 2026-08-10 — El pago es fundacional: regla del Uber, plazo de la CI, plata honesta y Nova con memoria

**12 PRs a producción** (#380–#391), todos mergeados con CI verde y verificados
contra el entorno productivo real. Tres decisiones de producto del CEO quedaron
escritas como doctrina, una regresión propia se detectó y corrigió el mismo día,
y Nova empezó a guardar sus conversaciones.

> Regla de este repo: es PÚBLICO. Los casos reales se describen en genérico.

---

## Parte 1 — La receta ya no depende del CUIL (#380, #381)

El guard que descartaba la receta cuando el paciente no tenía CUIL **era
gratuito**: el PDF ya sabía salir con nombre + DNI, y el CUIL es derivable de
DNI + sexo. Además el algoritmo de cálculo estaba **mal en las tres copias** que
existían (el caso especial del prefijo 23 se dispara con `resto === 1`, no con
"el verificador dio 9"; y dos copias devolvían 27 donde va 23 para mujeres).

- Queda **una sola implementación** (`src/lib/cuil.ts`, test de 120.000 CUILes).
- Backfill aplicado en producción: pacientes sin CUIL derivable + CUILes
  inválidos de prefijo equivocado, corregidos. Un CUIL válido distinto del
  derivado se respeta: el dato de la persona gana.
- **Regla que deja:** un dato derivable no puede ser un requisito bloqueante.

## Parte 2 — La regla del Uber (#382, #383)

*"Como usar un Uber y querer pedir otro"* (Diego, 09/08). El guard viejo de
`crearConsulta` tenía las dos mitades al revés: bloqueaba a los impagos (que
deberían poder irse) y dejaba pasar a los pagos (los únicos a blindar), con un
mensaje pintado fuera de la vista y sin salida.

Tres salidas nuevas, ninguna con un cartel sin acción:
1. **Ya pagó** → no abre otra; se le muestra cuál tiene y el botón para ir.
2. **No pagó, mismo profesional** → redirect a su sala de espera, sin carteles.
3. **No pagó, otro profesional** → se le pregunta, y al que queda esperando le
   llega *"El paciente canceló esta consulta"* (cartel de 5 minutos + campana).

Un turno **agendado** no bloquea (validado por Diego): solo cuentan los turnos
donde el paciente ya está adentro. Fuente de verdad:
`src/lib/consultas/encuentro-activo.ts`. Doctrina en CLAUDE.md.

## Parte 3 — El plazo de 30 minutos de la CI (#384) y la regresión que lo tapó (#388)

La CI no tenía vencimiento: un paciente con una consulta paga cuyo profesional
nunca aparecía quedaba retenido hasta el barrido de las 3 AM. Se construyó el
plazo (Diego): **30 minutos desde el pago**, el reloj no corre si el profesional
está atendiendo a otro. Profesional ausente → reintegro del 100% inmediato y
push al paciente; paciente ausente → sin reintegro.

**La regresión (mía):** la primera versión filtraba por `estado='pagada'` — un
estado que **la plata real nunca alcanza**, porque el webhook de MP salta de
`aceptada` directo a `en_curso` al acreditar. El cron no corría sobre ninguna
consulta real mientras la regla del Uber sí retenía. Detectada por verificación
adversarial el mismo día, corregida en #388:

- La señal de "el profesional nunca entró" es **`sala_video_url IS NULL`** (esa
  columna solo la escriben acciones del profesional). Verificado empíricamente:
  todas las consultas reales atendidas la tienen; cero falsos positivos.
- Primero se toma la fila (UPDATE condicionado), después se devuelve la plata; y
  la devolución queda **reservada en `refunds_pendientes` antes de llamar a MP**,
  así una muerte del proceso deja el reintegro en una cola que ya se reintenta
  sola, nunca en el limbo.
- Concurrencia optimista en los dos writers de estado del workspace: un
  profesional que llega tarde ya no puede resucitar una consulta reembolsada.
- Los estados `medico_ausente` / `no_show_paciente` ahora tienen pantalla propia
  para el paciente y están en `ESTADOS_ANULADOS` del workspace.

## Parte 4 — Lo devuelto no es plata cobrada (#385, #387)

El tablero contaba como ingreso plata ya devuelta. Ahora, en
`src/lib/insights/plata.ts` (fuente única):

- `pagada()` = aprobada **y no devuelta**. La comisión tampoco se cuenta sobre
  lo devuelto.
- El reintegro se detecta por **dos señales** (`mp_status='refunded'` del
  webhook **o** `reintegro_estado='reembolsado'` del motor propio): cada una
  sola deja casos afuera.
- Lo devuelto se informa **con su causa** ("el profesional no llegó" es falla
  accionable; "lo canceló el paciente" es costo de operar).
- `#387` corrige el propio #385, que shippeé con un diagnóstico equivocado (ver
  Proceso). `/insights/especialidades` quedó en la misma doctrina que el resto.

## Parte 5 — Sellado diferido: no se avisa (#386)

Decisión del CEO que rechaza la premisa del dictamen, no solo la conclusión: el
sellado diferido **no fue un acto unilateral que ratificar** — fue un bug
corregido que no creó ninguna obligación nueva. No se avisa a los profesionales,
no corre plazo de ratificación, y **tampoco se adopta la revocación automática
por objeción**. La recomendación original queda tachada en el documento legal,
no borrada: un registro que se reescribe no es un registro. Las filas de
`sellado_diferido_avisos` pasan a ser registro de alcance, no deuda.

## Parte 6 — Nova guarda sus conversaciones (#389)

*"Lo que un médico le pide a la IA es la lista de lo que le falta a la app,
dicha con sus palabras"* (Diego). Nova no guardaba nada; ahora cada turno de
conversación queda en `nova_conversaciones` / `nova_mensajes`, con **qué
herramienta ejecutó Nova** en cada turno (separa "preguntó" de "hizo").

- **La experiencia del médico no cambia en nada.** Guardado best-effort con
  `waitUntil`, después de cerrar el stream. Si falla, falla mudo.
- Transcripción completa, sin filtrar: se lee en **`/admin/nova`**, agrupada por
  profesional, con buscador y filtro "solo donde Nova ejecutó algo".
- Tablas cerradas por **pertenencia** (RLS sin policies + REVOKE), no por
  contenido: sin eso, cualquier sesión autenticada leería conversaciones ajenas.
  Comprobado empíricamente con la clave pública: `permission denied`.
- Verificado E2E contra producción con la cuenta test: dos turnos de chat, la
  herramienta `ver_agenda` registrada, filas leídas de vuelta.
- Dato para reportes futuros: `nova_perfiles.medico_id` guarda el **user_id**
  pese al nombre; las tablas nuevas usan `medicos.id` y lo documentan.

## Parte 7 — El pago es fundacional (#390, #391)

Un turno reservado y nunca pagado se mostraba en admin como
`Pagado: $[precio] (sin pago)` y con una línea de tiempo vacía — costó una
investigación descubrir que no había pasado nada raro: el paciente reservó, no
llegó al checkout, y la retención venció.

Decisión de Diego: *"el pago es fundacional para decir este paciente consume
este turno"*.

- **Se eliminó la gracia de 45 minutos** de `liberar-reservas`: sin pago, a los
  15 minutos el lugar vuelve a la oferta (cron cada 10 min). La aprobación
  tardía de MP es una rareza que se maneja como excepción (alerta de estado
  fuera de sincronía), no diseñando el sistema alrededor.
- **"Pendiente de pago"** en listado, detalle y chip. Nunca "Pagado" sin pago:
  ese monto es el precio del lugar, no plata que entró.
- La ficha del turno ahora deriva y muestra la reserva (retención − 15 min) y el
  desenlace. Ciclo completo verificado E2E en producción: reserva → vencimiento
  → liberación automática por el cron.

## Proceso — la lección del día

**Cuatro afirmaciones mías resultaron falsas, todas con tipos, lint y tests en
verde.** El diagnóstico de los reintegros, la detección de `refunded`, el estado
que filtraba el cron del plazo, y "el resto está bien". Ninguna la encontré
releyendo mi trabajo: las cuatro las encontró la **verificación adversarial**
(dos corridas: 51 y 54 agentes; hallazgos confirmados: 5 y 0 bloqueantes + 5
menores cerrados preventivamente). Los tests verdes no eran evidencia: los
escribí con el mismo modelo mental equivocado que el código.

Regla de trabajo nueva (en memoria del asistente): lo que mueve plata o emite
documentos clínicos se verifica con lentes independientes **antes** del merge, y
la premisa se verifica contra el código antes de escribir el fix. El dato que
faltaba estaba escrito en un docstring del repo desde hacía dos días.

## Qué quedó abierto

1. **Plan de activación** (definido por Diego, en curso): censo nominal por
   profesional → comunicaciones segmentadas (con OK de copy) → encuesta →
   beneficio Médico Fundador → sugerir funciones, ahora medible con Nova.
2. Instrumentar el abandono en la pantalla de pago de turnos (`pago_vista`).
3. 7 PRs viejos abiertos (mayo–julio) a triar.
4. Deudas conocidas: badge "N pendientes" de la agenda cuenta reservas muertas;
   CI sin mobile-safari.
