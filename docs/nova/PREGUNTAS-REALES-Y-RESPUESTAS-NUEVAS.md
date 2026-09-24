# Nova — lo que preguntan los profesionales, y las respuestas que faltan

> **Fecha:** 20/09/2026 · **Actualizado:** 24/09/2026.
> **Estado: el grupo A está EN PRODUCCIÓN.** Lo que sigue abajo es el análisis que lo
> originó, tal como se escribió; lo construido y lo que quedó afuera están al final, en
> "Qué se hizo con esto".
>
> Documento hermano: `NOVA_V2_DISENO_CAPACIDADES.md` (01/06), que mira las *manos* de Nova.
> Este mira sus *respuestas*, y a diferencia de aquel no parte de un circuito de prueba:
> parte de lo que los profesionales escribieron de verdad.

## De dónde salen los números

| Fuente | Qué trae | Período |
|---|---|---|
| `nova_mensajes` | lo que los profesionales le escribieron a Nova | 10/08 → 19/09 |
| `correos` (Bandeja) | mails entrantes de profesionales aprobados | 06/08 → 19/09 |
| `eventos_funnel` | entradas a la clínica, para saber cuándo hay demanda | últimos 60 días |
| Prompt de Nova | qué cubre hoy, leído de `src/app/api/nova/chat/route.ts` | actual |

Las cifras exactas **no van acá: este repo es público**. Viven en `MANUAL-NOVA-DEMANDA.md`,
en la raíz y sin commitear. Lo que sigue usa proporciones y orden, no conteos.

**Tres límites, dichos antes que las conclusiones:**

1. **Antes del 10/08 Nova no guardaba nada.** Todo lo que se preguntó desde que existe
   hasta esa fecha no está. Lo de acá es un mes y diez días, no la historia.
2. **Poco más de un tercio de los aprobados usó Nova.** Es lo que preguntan los que la
   abren. Del resto no sabemos qué se preguntan, ni si no la abren porque no la necesitan o porque no la
   encuentran.
3. **La Bandeja guarda desde el 30/07.** Los mails anteriores vivían en otro lado.

## El hallazgo principal no es una respuesta que falta

El tema más frecuente, por lejos y por casi el doble sobre el segundo, es alguna forma de
**"¿tengo pacientes?"**.

Un profesional la repitió media docena de veces en distintos días. Todas las veces Nova le
contestó bien: que no, que la agenda estaba vacía, que sus turnos seguían libres. Varias
redacciones distintas de la misma noticia, todas correctas, y ninguna que hiciera algo
con ella.

Ese es el hueco, y no se tapa agregando un tema al prompt. Nova entrega el dato y suelta
al profesional justo en el momento en que se está preguntando si esto sirve. **La pregunta
más frecuente del producto tiene hoy la respuesta más desalentadora posible, repetida a la
misma persona hasta que dejó de preguntar.**

Lo que sigue son las respuestas que faltan, en tres grupos: las que podemos dar con datos
que ya tenemos, las que necesitan que Diego decida qué decimos, y las que no son
respuestas sino arreglos.

## Lo que preguntan, por volumen

| # | Tema | ¿Nova lo cubre hoy? |
|---|---|---|
| 1 | ¿Tengo pacientes? ¿Hay demanda? | El dato sí; qué hacer con él, no |
| 2 | ¿Cómo se atiende? Receta, orden, historia clínica | **No** — dice "ese tema no es lo mío" |
| 3 | ¿Cómo me ven los pacientes? ¿Cuál es mi enlace? | **No** |
| 4 | ¿Mi perfil ya está listo para atender? | Parcial |
| 5 | Plata: cuánto cobro, cuánto cobran los demás, qué se lleva Docto | Solo su propio precio |
| 6 | Estados: disponible / confirmado / reservado / aceptar | **No** — y hay confusión real |
| 7 | ¿Cómo me entero de que llegó un paciente? | Sí, pero solo si preguntan por "avisos" |
| 8 | ¿Dónde bajo la aplicación? | Sí, con el mismo disparador estrecho |
| 9 | Capacitación, tutorial, manual | **No** — y los videos existen desde el 15/09 |
| 10 | Dos dispositivos en una consulta | **No** |
| 11 | No puedo cambiar un dato de mi perfil | **No** |

Poco más de la mitad de las preguntas son el flujo normal de agenda —crear turnos, elegir
horario, confirmar— que Nova ya maneja bien, más respuestas cortas ("sí", "ok", "gracias").

## Grupo A — se pueden contestar con datos que ya tenemos

Ninguna necesita una decisión de negocio. Todas necesitan trabajo.

### A1. ¿A qué hora conviene conectarse? *(el más valioso)*

Preguntado tal cual: *"¿vos sabés si suele haber flujo de pacientes? para recomendarme a
qué horarios es más probable"*, *"¿suele haber demanda de pacientes en este horario?"*,
*"¿hay pacientes para activar la disponibilidad inmediata?"*.

**Tenemos el dato**, y también la otra mitad: cuántos profesionales estaban en línea en
cada franja (`disponibilidad_log` reconstruye el histórico, y el cron de auto-apagado
también escribe ahí, así que la oferta es confiable). El orden de las franjas, de más a
menos gente buscando: **mañana (9–12), tarde (14–17), noche (19–23)**, y la madrugada
al fondo.

Pero el dato que decide no es ese. La noche tiene **casi la misma demanda por profesional
conectado que la mañana, con bastante menos competencia**, porque hay menos gente en línea.
Una recomendación hecha solo con la demanda bruta manda a todos a la mañana, que es donde
ya están todos.

Y hay precedente de que **funciona**: soporte le recomendó por mail a una profesional
conectarse antes de las 9, y dos semanas después escribió que lo confirmó, que aumentaron
sus chances, y pidió más franjas. Esa recomendación hoy la da una persona por mail, de
memoria, y solo a quien escribe. Nova puede dársela a todos.

**El límite que manda sobre todo esto:** al volumen de hoy, la franja más cargada recibe
del orden de una persona por día, repartida entre unos pocos profesionales en línea. Nova
puede decir dónde se concentra la demanda; **no puede dar a entender que va a aparecer un
paciente**, porque la mayoría de las veces no va a aparecer y la recomendación se lee como
mentira. Ese techo no lo arregla el texto.

Tampoco alcanza para cortar por especialidad y provincia: partido así, cada celda es ruido.
Nova daría un número general, no "el suyo", y eso hay que decírselo.

### A2. ¿Qué me falta para poder atender?

Seis preguntas del tipo *"¿mi perfil ya está listo y activado para recibir pacientes?"*.

`camposFaltantesMedico` **ya calcula exactamente eso** (cobros, firma, celular, etc.) y lo
usa el gate de disponibilidad. Nova no lo consulta. Es la misma cuenta que alimentaba la
columna "¿Puede atender?" del panel de admin.

### A3. ¿Cómo me ven los pacientes? ¿Cuál es mi enlace?

Seis preguntas: *"¿aparezco en una lista de médicos disponibles o esto es solo para mis
pacientes?"*, *"quiero saber cómo los pacientes me buscan"*, *"¿cómo puedo publicar mi
enlace?"*.

`medicos.slug` existe: cada profesional tiene su link público y Nova no lo menciona nunca.
Acá se cruzan dos cosas que conviene contestar juntas: la diferencia entre Clínica Virtual
y Consultorio Particular, y su enlace propio.

### A4. La capacitación existe y Nova no sabe

Dos mails piden literalmente *"tutorial, manual o capacitación"*, uno de ellos de alguien
recién habilitado que quiere familiarizarse antes de atender. **Los videos están en
producción desde el 15/09.** Nova los desconoce.

### A5. Dónde está la app, y cómo llegan los avisos

Nova **ya tiene** la explicación de agregar Docto a la pantalla de inicio, y es buena. El
problema es el disparador: está atada a que pregunten por *avisos*. Quien escribe *"¿dónde
descargo la aplicación?"* —tres veces en Nova, una por mail buscándola en la App Store—
no pasa por esa puerta.

Además: `nova_perfiles.anticipacion_recordatorios` existe y Nova nunca lo lee ni lo
escribe, con un profesional preguntando *"cómo hago para modificar el aviso de consulta
para antes de 15 min"*.

### A6. "Aparecen 6 disponibles, pero esos no es que son para atender"

Cuatro preguntas muestran la misma confusión de vocabulario: un turno **disponible** es un
lugar vacío que ofrecés, no un paciente que viene. *"¿los tengo que aceptar, cómo
funciona?"*, *"¿el paciente necesita confirmarlos todavía?"*, *"¿uno sabe si hay algún
paciente para atender cuando aparece confirmado?"*.

Esto no es una respuesta nueva: es que Nova use las palabras con cuidado siempre, y que la
pantalla las use igual. Cuando alguien lee "6 disponibles" y entiende "6 pacientes", el
golpe llega después.

### A7. No puedo cambiar un dato de mi perfil

Un caso por mail escaló en tres mensajes hasta el sarcasmo —*"¿desidia o control de
paciencia?"*— por un teléfono equivocado que el profesional no encontraba cómo corregir.
Hoy ese campo **sí** es editable en `/medico/perfil`. Nova puede decir dónde, en un
renglón, y ese hilo no existe.

## Grupo B — necesitan que decidas qué decimos

Acá no propongo texto: la decisión es tuya y después se escribe.

| Tema | Lo que preguntan | Lo que hay que decidir |
|---|---|---|
| **Coste por uso** | *"¿ustedes se quedan con algún percentual del valor de la consulta?"* | Si Nova lo dice o lo deriva. Si lo dice, el vocabulario ya está fijado: **coste por uso de la plataforma**, nunca "comisión". |
| **Precio de referencia** | *"¿cuánto está cobrando más o menos un médico?"* · por mail: *"puse 15 mil, ¿es muy poco?"* | Soporte ya contesta un rango por mail. Que lo diga Nova mueve el precio de todo el mercado: es decisión de negocio, no de producto. |
| **Facturación y datos fiscales** | *"necesito el nombre, razón social y CUIL de la plataforma"* · *"quería saber cómo es la facturación"* | Depende de GREBA → SRL, que está pendiente. Mientras tanto, si Nova contesta, contesta algo que va a cambiar. |
| **Cómo se atiende de punta a punta** | Recetas, órdenes, historia clínica, certificados, cómo se registra el paciente (7 preguntas) | Es la superficie más grande. ¿Nova explica el producto, o su respuesta es mandar a los videos de capacitación? |

## Grupo C — no son respuestas, son arreglos

- **Segunda especialidad.** Preguntada por Nova y por mail, con un caso que insistió cuatro
  veces por correo. Hoy solo se hace por SQL: no hay pantalla. Nova puede explicar y
  derivar, pero el problema no es la explicación.
- **Dos dispositivos en una consulta** (computadora para escribir, celular para cámara y
  micrófono). Preguntado en Nova y en dos mails distintos. **No sé si funciona**: no está
  probado. Antes de que Nova conteste algo, hay que averiguarlo.

## Lo que no sé

- **Qué preguntan los aprobados que no usan Nova.** Puede que sea lo mismo, puede que no.
- **Si una respuesta mejor cambia la conducta.** El único indicio a favor es el caso de la
  recomendación de horario por mail, que es uno.
- **Cuál es la franja con más demanda y menos oferta.** Tengo la demanda por hora; la
  oferta conectada por hora no la calculé.
- **Si el flujo de dos dispositivos funciona.**


## Qué se hizo con esto (24/09/2026)

El análisis se aprobó y se construyó casi todo el grupo A en cuatro días.

| | Qué | Estado |
|---|---|---|
| A1 | Nova recomienda en qué franja del día tiene más chances | ✅ en producción |
| A1 | Nova ofrece la consulta inmediata sin que se la pidan | ✅ en producción |
| A3 | Explica los dos canales antes de hacer elegir, y da el enlace personal | ✅ en producción |
| — | La tarjeta del dashboard ofrece el trabajo que le falta a cada uno | ✅ en producción |
| — | Instrumentación de la tarjeta (`nova_widget_visto` / `nova_widget_click`) | ✅ en producción |
| A2 | "¿Qué me falta para poder atender?" (`camposFaltantesMedico` ya lo calcula) | pendiente |
| A4 | Que Nova sepa que existen los videos de capacitación | pendiente |
| A5 | Disparador de "dónde bajo la app" y la anticipación del aviso | pendiente |
| A6 | El vocabulario de disponible / confirmado / reservado | pendiente |
| A7 | "No puedo cambiar un dato": decirle dónde se cambia | pendiente |
| B | Coste por uso, precio de referencia, facturación, cómo se atiende | esperan decisión |
| C | Segunda especialidad sin pantalla · dos dispositivos sin probar | siguen abiertos |

### Las reglas de lo que Nova puede decir (decisión Diego, 20/09)

El objetivo es que el profesional **cierre más consultas**, no que audite nuestro tamaño:

- **Nunca cifras de demanda**, ni aunque las pidan: al volumen de hoy no informan y hacen
  perder confianza en la plataforma.
- **Nunca nada sobre los demás profesionales.** El ranking sí se calcula con la oferta
  conectada —sin eso la recomendación manda a todos a la misma hora— pero eso es mecánica
  interna.
- **Nunca prometer** que va a aparecer un paciente. **Una sola vez** por conversación.

El tipo que devuelve `src/lib/nova/demanda.ts` no tiene un solo `number`: es la garantía de
que no se filtre una cifra por accidente, y el script `scripts/probar-nova-demanda.mts` lo
verifica contra producción.

### Una corrección al análisis de arriba

En A1 este documento decía que la franja de la noche le ganaba a la mañana. **Era un error
de medición**: comparaba franjas de distinto ancho normalizando por día en vez de por hora
de disponibilidad, y una franja más larga acumula más demanda diaria solo por ser más
larga. Medido por hora —que es lo que al profesional le cuesta estar conectado— **gana la
mañana**. El orden correcto coincide además con la curva de registros por hora, que es una
fuente independiente.

### Lo que dijo la medición, cuatro días después

La hipótesis de este documento era que la tarjeta no se veía. **Es falsa**: se ve, y hace
clic aproximadamente uno de cada nueve, parejo entre las tres ofertas. Lo que sí se movió
es lo que importa: **las agendas armadas con Nova en esos cuatro días superaron a todas las
de la historia previa juntas**.

También quedó descartado que Nova estuviera escondida: su flag está prendido desde mayo y
la tarjeta es lo primero del dashboard, además del link en el encabezado y en la agenda.
Lo que fallaba era la oferta, no la visibilidad — el botón decía "Hablar con Nova", que
ofrece una charla en vez de un trabajo.
