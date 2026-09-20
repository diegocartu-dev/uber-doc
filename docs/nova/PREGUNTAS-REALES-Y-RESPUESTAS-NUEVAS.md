# Nova — lo que preguntan los profesionales, y las respuestas que faltan

> **Fecha:** 20/09/2026 · **Estado:** PROPUESTA. Nada implementado, ningún texto escrito.
> Espera decisión de Diego sobre qué habilitar y, en los casos marcados, sobre **qué decimos**.
>
> Documento hermano: `NOVA_V2_DISENO_CAPACIDADES.md` (01/06), que mira las *manos* de Nova.
> Este mira sus *respuestas*, y a diferencia de aquel no parte de un circuito de prueba:
> parte de lo que los profesionales escribieron de verdad.

## De dónde salen los números

| Fuente | Qué trae | Período |
|---|---|---|
| `nova_mensajes` | 121 preguntas de 25 profesionales, en 53 conversaciones | 10/08 → 19/09 |
| `correos` (Bandeja) | 30 mails entrantes de profesionales aprobados | 06/08 → 19/09 |
| `eventos_funnel` | 888 entradas a la clínica, para saber cuándo hay demanda | últimos 60 días |
| Prompt de Nova | qué cubre hoy, leído de `src/app/api/nova/chat/route.ts` | actual |

**Tres límites, dichos antes que las conclusiones:**

1. **Antes del 10/08 Nova no guardaba nada.** Todo lo que se preguntó desde que existe
   hasta esa fecha no está. Lo de acá es un mes y diez días, no la historia.
2. **25 de 67 aprobados usaron Nova.** Es lo que preguntan los que la abren. Los otros 42
   no sabemos qué se preguntan, ni si no la abren porque no la necesitan o porque no la
   encuentran.
3. **La Bandeja guarda desde el 30/07.** Los mails anteriores vivían en otro lado.

## El hallazgo principal no es una respuesta que falta

De las 121 preguntas, **18 son alguna forma de "¿tengo pacientes?"** — el tema más
frecuente, por lejos y por casi el doble sobre el segundo.

Un profesional la hizo **seis veces**. Las seis, Nova le contestó bien: que no, que la
agenda estaba vacía, que los nueve turnos seguían libres. Seis redacciones distintas de
la misma noticia, todas correctas, y ninguna que hiciera nada con ella.

Ese es el hueco, y no se tapa agregando un tema al prompt. Nova entrega el dato y suelta
al profesional justo en el momento en que se está preguntando si esto sirve. **La pregunta
más frecuente del producto tiene hoy la respuesta más desalentadora posible, dada seis
veces seguidas a la misma persona.**

Lo que sigue son las respuestas que faltan, en tres grupos: las que podemos dar con datos
que ya tenemos, las que necesitan que Diego decida qué decimos, y las que no son
respuestas sino arreglos.

## Lo que preguntan, por volumen

| Tema | Preguntas | ¿Nova lo cubre hoy? |
|---|---|---|
| ¿Tengo pacientes? ¿Hay demanda? | 18 | El dato sí; qué hacer con él, no |
| ¿Cómo se atiende? Receta, orden, historia clínica | 7 | **No** — dice "ese tema no es lo mío" |
| ¿Cómo me ven los pacientes? ¿Cuál es mi enlace? | 6 | **No** |
| ¿Mi perfil ya está listo para atender? | 6 | Parcial |
| Plata: cuánto cobro, cuánto cobran los demás, qué se lleva Docto | 5 | Solo su propio precio |
| Estados: disponible / confirmado / reservado / aceptar | 4 | **No** — y hay confusión real |
| ¿Cómo me entero de que llegó un paciente? | 3 | Sí, pero solo si preguntan por "avisos" |
| ¿Dónde bajo la aplicación? | 3 | Sí, con el mismo disparador estrecho |
| Capacitación, tutorial, manual | 2 | **No** — y los videos existen desde el 15/09 |
| Dos dispositivos en una consulta | 1 (+2 mails) | **No** |
| No puedo cambiar un dato de mi perfil | 1 (+3 mails) | **No** |

Las 65 restantes son el flujo normal de agenda —crear turnos, elegir horario, confirmar—
que Nova ya maneja bien, más respuestas cortas ("sí", "ok", "gracias").

## Grupo A — se pueden contestar con datos que ya tenemos

Ninguna necesita una decisión de negocio. Todas necesitan trabajo.

### A1. ¿A qué hora conviene conectarse? *(el más valioso)*

Preguntado tal cual: *"¿vos sabés si suele haber flujo de pacientes? para recomendarme a
qué horarios es más probable"*, *"¿suele haber demanda de pacientes en este horario?"*,
*"¿hay pacientes para activar la disponibilidad inmediata?"*.

**Tenemos el dato.** Entradas a la clínica por hora argentina, últimos 60 días:

| Franja | Entradas a la clínica |
|---|---|
| 09:00–11:00 | 176 |
| 14:00–15:00 | 132 |
| 20:00–21:00 | 91 |
| 04:00–06:00 | 45 (el piso) |

Y hay precedente de que **funciona**: soporte le recomendó por mail a una profesional
conectarse antes de las 9, y dos semanas después escribió que lo confirmó, que aumentaron
sus chances, y pidió más franjas. Esa recomendación hoy la da una persona por mail, de
memoria, a quien escribe. Nova puede dársela a los 67.

**Ojo con el número que se usa:** la franja que más le sirve al profesional no es la de más
demanda, sino la de más demanda **con menos oferta conectada**. Eso todavía no está
calculado; es trabajo, no un dato que exista hecho.

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

- **Qué preguntan los 42 aprobados que no usan Nova.** Puede que sea lo mismo, puede que no.
- **Si una respuesta mejor cambia la conducta.** El único indicio a favor es el caso de la
  recomendación de horario por mail, que es uno.
- **Cuál es la franja con más demanda y menos oferta.** Tengo la demanda por hora; la
  oferta conectada por hora no la calculé.
- **Si el flujo de dos dispositivos funciona.**
