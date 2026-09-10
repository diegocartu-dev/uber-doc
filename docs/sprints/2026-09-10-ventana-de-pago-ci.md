# 10/09/2026 — La ventana entre "te aceptaron" y "pagaste"

Cierre del agujero que abrió el diagnóstico del 09/09
(`2026-09-09-ci-aceptadas-sin-pago-diagnostico.md`). Decisiones de Diego del
10/09, tomadas sobre los números de abajo.

## El número que ordenó todo

Desde el 19/08, que es cuando el hito `aceptada_at` empezó a escribirse:

| | Casos |
|---|---|
| CI aceptadas por un profesional real | 12 |
| Pagaron | 6 |
| No pagaron | 6 |

**La conversión de aceptación a pago es del 50%.** Es el número nuevo a vigilar,
el escalón siguiente al 65% de intento→consulta.

**La velocidad de aceptación NO predice el pago** (hipótesis descartada, no
suposición): los que no pagaron fueron aceptados en 87 segundos promedio, los que
pagaron en 105. Los que no pagaron fueron aceptados **más rápido**.

Las seis que no se pagaron:

| Pedido | Aceptada a los | Vivió después | Quién la cerró |
|---|---|---|---|
| 08/09 10:40 | 234 s | **24 segundos** | el profesional |
| 21/08 14:21 | 74 s | 30 segundos | el paciente se retiró |
| 25/08 18:51 | 35 s | 12 minutos | el profesional |
| 09/09 12:04 | 96 s | 15 minutos | el profesional |
| 08/09 08:01 | 25 s | 29 minutos | el profesional |
| 07/09 07:48 | 61 s | 62 minutos | el profesional |

**Cinco de seis las canceló el profesional a mano.** Y a dos pacientes no les
dieron chance material de pagar: 24 y 30 segundos, cuando el pago más rápido de
la historia tardó 23 y el más lento 137.

## Por qué el profesional cancelaba

No era impaciencia. Era la pantalla.

Al aceptar, el panel lo mandaba a la sala de video. La sala de video solo abre
con la consulta `pagada` o `en_curso`, y recién aceptada está impaga: lo
rebotaba al panel en el mismo segundo (visible en los registros de los 4 casos
caídos **y de los 3 pagados**). Ahí veía una tarjeta naranja con la frase
"Esperando pago del paciente…", que no es una acción, y un botón rojo, que sí lo
era. Cancelar era lo único que podía hacer.

## Qué cambia

**En el panel del profesional**
- Aceptar ya no lo manda al video. Se queda en su panel.
- La tarjeta muestra hace cuánto acepta el paciente, que le avisamos por mail y
  WhatsApp, y a qué hora lo libera el sistema.
- **El botón de cancelar no existe durante los primeros 3 minutos** de la ventana
  de pago. Cubre el récord de 137 segundos con 30% de margen. Con la consulta ya
  pagada o en curso, cancelar sigue disponible siempre, como hasta ahora.
- Al confirmar, la cancelación **no se ejecuta: se demora 8 segundos** con un
  botón Deshacer. Revertirla después sería imposible (dispara el reembolso, y al
  paciente le aparece el cartel de caída en menos de 5 segundos con el menú para
  irse con otro). Si el profesional se va de la pantalla en esos 8 segundos, **no
  se cancela**: nunca se destruye una atención por una intención a medio
  confirmar.
- El texto de confirmación lo fijó Diego: *"¿Estás seguro? El paciente no podrá
  realizar la consulta."*

**El plazo, que es la contracara del bloqueo**
- Si al profesional le sacamos el botón, le debemos la garantía de que no queda
  atrapado. El cron `ci-aceptada-sin-pago` (cada minuto) cierra la consulta impaga
  **a los 10 minutos**, con el desenlace nuevo `sin_pago_plazo`.
- Antes esto no existía: `resolver-consultas-vencidas` mira `pagada`/`en_curso` y
  `sin-respuesta` mira `esperando`. Nadie miraba `aceptada`.

**El aviso al paciente, ahora diferido**
- El WhatsApp **ya no sale en el instante de la aceptación**. Sale a los 90
  segundos, y solo si el paciente dejó de dar señales de estar mirando.
- **Si tocó Pagar, no sale nunca.** Ese paciente está en el checkout de Mercado
  Pago y un mensaje ahí es peor que ruido. Es el caso del 22/08, que tardó 137
  segundos: con un reloj pelado de 90 s le habríamos sonado el teléfono mientras
  cargaba la tarjeta.
- La señal es un **latido de presencia**: la sala avisa cada 20 segundos que la
  pantalla está a la vista (`document.visibilityState`). El poll solo no alcanza:
  sigue corriendo con la pestaña en segundo plano.
- Efecto buscado: al que se quedó mirando dos minutos y después se fue, el aviso
  le llega **justo cuando se fue**.
- El mail sigue saliendo inmediato: no interrumpe y es el respaldo del que cierra
  todo a los diez segundos.

**Guardar el 100% de lo que se cancela** (pedido explícito de Diego)
- `consultas.cierre_evidencia` (jsonb): si el paciente vio el botón, si lo tocó,
  si el intento llegó al servidor, cuándo dio el último latido, qué pasó con el
  aviso, y cuántos errores tuvo su navegador. Se escribe al cerrar, una sola vez,
  desde los tres caminos (el profesional cancela, el paciente se retira, vence el
  plazo).
- **Por qué hacía falta:** todo eso vivía en los registros del servidor, que duran
  8 días. Por eso los dos casos de agosto del diagnóstico ya no se pudieron
  reconstruir.
- **Se sacó la policy de RLS que dejaba a los profesionales borrar sus consultas.**
  Existía, y había código (huérfano, sin montar) que la usaba. Nada se borró nunca
  —cero rastros huérfanos en cuatro tablas— y las FK de documentos, consentimientos
  y recetas bloqueaban el borrado de cualquier consulta con historia: la puerta
  estaba abierta por accidente, no por diseño. Nadie pierde nada: las canceladas ya
  desaparecen solas del panel, que solo lista esperando/aceptada/pagada/en_curso.

## Lo que NO cambia

- Los estados de `consultas`. La clasificación sigue dando `abandono` para una CI
  aceptada y no pagada, con o sin el motivo nuevo: ningún número del tablero se
  mueve por este cambio.
- El flujo de una consulta ya pagada o en curso, incluido el botón de cancelar.
- El webhook de Mercado Pago, la sala de video y la emisión de documentos.

## La revisión adversarial encontró trece defectos, y uno era grave

Antes de mergear, el cambio pasó por cinco lentes independientes (carreras,
plata, pantalla del profesional, regla del aviso, datos y migración) con
verificación por refutación. Trece hallazgos sobrevivieron y **los trece se
arreglaron**. Los que importan:

**El peor, y era culpa del cambio.** El cierre por plazo llamaba a cerrar la
entrada de sala con el motivo `timeout_sistema`. Ese valor tiene dueño:
`sala-espera-diaria` levanta TODAS las filas con ese motivo de las últimas 24 h
y le avisa al profesional que plantó pacientes. O sea que el profesional que
aceptó en 25 segundos y esperó 10 minutos habría recibido al día siguiente un
reproche por haber hecho lo correcto — exactamente lo contrario de este sprint.
Ahora el cierre sale con motivo propio, `sin_pago_plazo`.

**Plata que se podía perder.** `crear-v2` no escribe una sola columna en la
consulta: mientras el paciente está adentro del checkout de Mercado Pago, para
la base la consulta sigue impaga. El cron la cerraba a los 10 minutos, el pago
se acreditaba después sobre una consulta cancelada, y como la fila nunca recibía
`pago_id`, el reembolso automático no tenía con qué encontrar ese pago: había que
ir a buscarlo a mano. Dos arreglos: el cron **no cierra a quien está en el
checkout** (con techo de 15 minutos, para que un checkout abandonado no deje la
consulta viva para siempre), y el webhook, cuando un pago aprobado cae sobre una
consulta ya cerrada, **escribe el rastro del pago y dispara el reembolso solo**
en vez de dejar únicamente un mail de alerta.

**Una consulta que quedaba fuera del cron para siempre.** El filtro era
`pago_id IS NULL`, pero el webhook escribe `pago_id` ante un pago RECHAZADO sin
tocar el estado. Una tarjeta rebotada dejaba la consulta en `aceptada` con
`pago_id` no nulo: sin aviso y sin cierre, para siempre, mientras la pantalla le
prometía al profesional que lo liberábamos solos. El filtro correcto es "sin pago
acreditado".

**Una mentira al paciente.** Al vencer el plazo de pago, su pantalla decía
"no llegó a tomar tu consulta esta vez", que es falso y le echa la culpa al
profesional: él sí la aceptó y esperó. Ahora ese desenlace tiene su propio texto.

**Reembolsar un pago recién hecho.** La cancelación diferida disparaba a los 8
segundos sin volver a mirar el estado. Si el paciente pagaba en esos 8 segundos
—el caso que el aviso de los 90 segundos busca provocar— se cancelaba y
reembolsaba un pago recién acreditado. Ahora revalida y aborta con un mensaje.

**Dos cancelaciones a la vez.** Confirmar la cancelación de una segunda consulta
mataba en silencio la cuenta regresiva de la primera: esa consulta no se
cancelaba nunca y el profesional se quedaba creyendo que sí. Ahora es una por vez.

**La evidencia que no se guardaba.** Se disparaba con `void` justo antes del
`return`, y en Vercel el trabajo posterior a la respuesta HTTP no está
garantizado: se perdía en los dos caminos más frecuentes. Ahora se espera.

Más: el cartel de error se pintaba en todas las tarjetas del panel y no solo en
la que falló, y la consulta de evidencia podía truncarse en un día con muchos
eventos.

## Verificación

- `tsc` sin errores nuevos; lint sin errores nuevos (el de `set-state-in-effect`
  del poll ya estaba en main); **575 tests unitarios en verde**, 14 de ellos
  nuevos sobre las reglas del aviso y del cierre, incluido el caso del 22/08 y el
  veto del checkout en vuelo.
- Migración aplicada en producción y verificada pieza por pieza: policy de DELETE
  eliminada, columnas y motivo nuevos aceptados, y el índice parcial **usado** por
  la query del cron (`Index Scan using consultas_aceptada_sin_pago_idx`,
  confirmado con EXPLAIN contra producción).
- Revisión adversarial en cinco lentes independientes con verificación por
  refutación.

## La prueba end-to-end contra producción encontró un bug que nada más había visto

Con cuentas de prueba en `www.docto.com.ar`, cronometrando el flujo real:

| Momento | Qué hizo el sistema |
|---|---|
| t=54 s | `temprano`: no avisa todavía |
| t=132 s y 159 s, paciente MIRANDO | `esta_mirando`: **no le manda nada** |
| t=226 s, ya se fue | **avisa** |
| t=292 s en adelante | `ya_avisado`: no repite |
| t=611 s | debía cerrar… **y no cerró** |

El cron respondía 200 con `cerradas: 0` y sin motivo de omisión. En sus propios
registros estaba la causa: el UPDATE chocaba contra un check constraint.

**`resolucion_motivo` tenía DOS check constraints, no uno.** El original se llama
`consultas_resolucion_motivo_valida`; la migración de este sprint amplió
`consultas_resolucion_motivo_check`, **un nombre supuesto que no existía**. El
`ALTER … DROP CONSTRAINT IF EXISTS` sobre un nombre inventado no falla: no hace
nada. Así que se creó un constraint nuevo y el viejo quedó intacto, rechazando el
motivo nuevo. La verificación posterior a la migración dio verde porque preguntó
por el constraint que yo mismo había creado.

Corregido: queda uno solo, con el nombre real. Verificado de nuevo, y esta vez
ejecutando el cierre de verdad:

- `estado: cancelada`, `resuelta_por: sistema`, `resolucion_motivo: sin_pago_plazo`
- la entrada de sala se cerró con `sin_pago_plazo`, **no** con `timeout_sistema`
- y la evidencia quedó escrita: `vio_boton: true`, `toco_boton: false`,
  `intento_llego_al_servidor: false`, `seg_desde_ultimo_latido: 693`,
  `aviso_whatsapp: enviado`

Esa última línea es exactamente la pregunta que el 09/09 no se pudo responder
para los casos de agosto: **vio el botón y no lo tocó**.

**Lección:** los tipos, el lint, 575 tests y una revisión adversarial de cinco
lentes pasaron por encima de este bug. Lo encontró ejecutar el flujo real contra
producción. Un `DROP IF EXISTS` sobre un nombre que uno cree recordar es una
suposición disfrazada de idempotencia.

## Pendientes declarados

- **La plantilla de WhatsApp al paciente sigue sin aprobación de Meta** (más de 10
  horas, creada 00:45 del 10/09, sin motivo de rechazo). Hasta que apruebe, el
  aviso sale y Twilio lo rechaza con 63016, dejando el rastro en
  `whatsapp_envios`. El código no necesita cambios: cuando apruebe, funciona. La
  diferencia con las dos plantillas ya aprobadas es que esta lleva un botón con
  dirección variable.
- **Un paciente que cierra la pestaña no tiene forma de volver a su sala desde la
  app.** `/mis-consultas` lista la consulta pero no linkea a la sala de espera. Hoy
  el único camino de vuelta es el mail. No se tocó en este sprint.
- **Una entrada de sala quedó abierta** con su consulta ya `completada` (la del
  10/09 08:16). Es 1 de 111 en toda la historia, así que no es sistemático; no se
  investigó.
