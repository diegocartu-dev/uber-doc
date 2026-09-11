# Acceso de un asistente externo a la Bandeja

Cómo se le da a un asistente externo (hoy: Grokbot) la capacidad de leer los
mails que entran a `contacto@` y `soporte@` y de proponer o mandar respuestas,
**sin darle acceso a la plataforma ni a la base de datos**.

Código: `src/app/api/bandeja/bot/route.ts`.
Manual de contenido para responder: `docs/MANUAL-SOPORTE-MAIL.md`.

---

## La idea en una línea

El asistente no entra a Docto. Entra a **una sola puerta** que solo sabe hacer
cuatro cosas: listar lo que está sin atender, abrir un hilo, ver el estado de
quien escribió, y contestarle.

## Por qué no se le da el panel ni la base

Darle un usuario admin le daría de paso `medicos`, `pacientes`, `consultas`,
`turnos` y la plata. Darle la clave de servicio de la base es lo mismo pero peor,
porque además puede escribir. La puerta acotada es la única forma de que "ver
todo lo necesario para responder bien" no signifique "ver todo".

Lo que sí ve: la tabla `correos`, que es la bandeja entera —entrantes y salidas,
con su texto—. Eso incluye lo que los usuarios nos cuentan de sí mismos. No es
poco, y por eso está la sección de datos personales más abajo.

## Los tres candados

**1. Token propio.** `BANDEJA_BOT_TOKEN`, que no se reusa de ningún otro lado.
Si se filtra, se rota solo y no toca nada más. Sin la variable seteada la ruta
responde 404: no existe.

**2. No le puede escribir a cualquiera.** Solo responde a un correo que ya está
en la bandeja, y **la dirección de destino la resuelve el servidor** leyendo ese
correo. El asistente no elige el destinatario. Si lo manda en el cuerpo, se
ignora. Así esta puerta no sirve para mandarle un mail a nadie que no nos haya
escrito primero.

**3. No envía por defecto.** `enviar: true` solo funciona si además está
`BANDEJA_BOT_ENVIO=on` en el entorno. Sin eso devuelve el borrador exacto que
mandaría, y no sale ningún mail. Es el interruptor para entrenarlo sin riesgo:
mientras esté apagado, cada respuesta pasa por una persona.

**Y aunque esté prendido, solo manda a direcciones comprobadas.** Un correo que
llegó de verdad tiene `resend_id`. Una fila escrita por el formulario público de
`/ayuda` no lo tiene, y su dirección la tipeó quien completó el formulario, sin
sesión y sin comprobar que sea suya. A esas se les redacta un borrador y lo
aprueba una persona.

## Por qué el envío automático conviene que siga apagado

No es cautela genérica, es una cadena concreta que se puede recorrer:

1. El formulario de `/ayuda` es público. Cualquiera escribe un texto y elige la
   dirección del remitente.
2. Esa fila aparece en `pendientes`, con su id, y con el cuerpo entero.
3. El cuerpo lo lee un modelo. Puede estar escrito para manipularlo.
4. Si el envío está prendido, ese mismo modelo tiene un verbo que manda mail de
   vuelta.

El candado nuevo corta el paso 4 para esas filas. Lo que NO corta es la versión
con un correo de verdad: alguien manda un mail real desde su propia dirección con
instrucciones adentro, y la respuesta le vuelve a él. Los candados del servidor
gobiernan **a quién se le escribe**, no **qué se le escribe**.

Y del otro lado, `pendientes` le entrega al asistente los cuerpos completos de
los mails de otras personas, que es lo que se pidió para que sepa responder.

Contra eso, lo único que cierra de verdad es que una persona apruebe cada
respuesta antes de que salga. Por eso el interruptor está apagado.

---

## Cómo se usa

Todo lleva `Authorization: Bearer <BANDEJA_BOT_TOKEN>`.

### Lo que está sin atender

```
GET https://docto.com.ar/api/bandeja/bot?accion=pendientes
```

Devuelve hasta 50 correos entrantes, sin atender, excluyendo los automáticos
nuestros. Cada uno trae `id`, `creado_en`, `de`, `para`, `asunto`,
`cuerpo_texto`, `leido`, `atendido`, `en_respuesta_a`.

`para` dice si entró por contacto o por soporte. Sirve para elegir desde cuál
contestar.

### Quién escribió

```
GET https://docto.com.ar/api/bandeja/bot?accion=quien&correoId=<id del correo>
```

Devuelve el **estado** de la persona que mandó ese mail. Existe porque casi toda
la bandeja son profesionales preguntando por su registro, su validación o su
cobro, y las tres cosas se miran en el panel, que el asistente no tiene.

De un **profesional**: en qué paso quedó el registro, si la matrícula figura
validada en REFEPS y en qué jurisdicciones, si la identidad está validada, si
Mercado Pago está conectado o vencido, si completó la firma, y si está disponible
ahora.

De un **paciente**: solamente si está registrado y desde cuándo. Nada clínico.

Si la dirección no figura en la base, responde `registrado: false`.

Tres límites, puestos a propósito:

1. **No se busca por correo libre.** Se entra por el id de un mail de la bandeja
   y el servidor resuelve la dirección leyéndolo. El asistente no puede preguntar
   por una persona cualquiera: solo por alguien que nos escribió. Y como los ids
   solo los conoce por la lista de pendientes, tampoco puede armar un padrón.
2. **No viaja la PII que no hace falta para contestar.** Quedan afuera DNI, CUIT,
   celular personal, domicilio, notas internas de admin, la foto de la credencial
   y el crudo de REFEPS.
3. **No viaja la categoría comercial.** El coste por uso depende de ella y la
   regla de la casa es que un porcentaje no se dice nunca sin verificarlo caso por
   caso. Dándole la categoría, el asistente podría deducirlo. Ese tema sigue
   escalando a una persona.

**El límite que este candado NO tiene, y conviene saberlo.** Una fila `entrada`
no siempre viene de un mail: el formulario público de `/ayuda` escribe una con la
dirección que la persona tipeó, y cuando no hay sesión nadie comprueba que sea
suya. O sea que alguien puede poner la dirección de un profesional ajeno y hacer
que el asistente consulte su estado. No lo ve quien lo hizo —la respuesta le sale
al titular de la dirección— pero el dato igual se movió hacia el tercero por un
pedido falso.

Mientras tanto la respuesta trae `direccion_probada`: en `true` cuando el mail
llegó de verdad como correo (tiene `resend_id`), en `false` cuando la dirección
fue tipeada en un formulario. La instrucción del asistente le prohíbe contar el
estado de una cuenta cuando viene en `false`.

El arreglo de fondo es una columna de origen en `correos`, escrita por el webhook
de entrada y por `/ayuda` según haya sesión o no. Es una migración y las
migraciones esperan el OK de Diego, así que está propuesta, no aplicada.

### Un hilo completo

```
GET https://docto.com.ar/api/bandeja/bot?accion=hilo&id=<id del correo>
```

Devuelve el correo y todas las respuestas que se le escribieron, en orden. Es lo
que hay que leer antes de contestar: puede haber una respuesta humana previa.

### Contestar

```
POST https://docto.com.ar/api/bandeja/bot
Content-Type: application/json

{
  "correoId": "<id del correo a responder>",
  "cuerpo":   "El texto de la respuesta, en texto plano.",
  "asunto":   "opcional — por defecto Re: <asunto original>",
  "desde":    "contacto | soporte  — por defecto contacto",
  "enviar":   false
}
```

Con `enviar: false` (o con el interruptor apagado) la respuesta es:

```json
{ "enviado": false, "motivo": "...", "borrador": { "para": "...", "asunto": "...", "cuerpo": "...", "desde": "..." } }
```

Con `enviar: true` **y** el interruptor prendido, sale el mail por el mismo
camino que el panel: se registra en `correos` como salida, el original queda
marcado como atendido, y la firma la agrega el servidor.

No acepta adjuntos, no acepta HTML, no puede borrar nada.

---

## Las dos variables

| Variable | Qué hace | Dónde |
|---|---|---|
| `BANDEJA_BOT_TOKEN` | Habilita la ruta y autentica. Sin ella, 404. | Vercel, Production |
| `BANDEJA_BOT_ENVIO` | `on` habilita el envío real. Cualquier otro valor o ausente = solo borradores. | Vercel, Production |

Cambiar cualquiera de las dos **necesita un deploy fresco** (`git push` o
`vercel --prod`), nunca un `redeploy`.

---

## Datos personales — lo que este archivo NO resuelve

El contenido de estos mails incluye datos de pacientes y profesionales, y sale
hacia un tercero fuera del país. Para que eso sea lícito el proveedor tiene que
estar **declarado en la Política de Privacidad**, igual que los otros seis
(Supabase, Mercado Pago, LiveKit, Vercel, Resend, Didit), y la transferencia
internacional apoyada en el consentimiento del art. 12 inc. a) de la Ley 25.326.

Hoy **no está declarado**. Ese requisito es legal, no técnico: el código de arriba
no lo cumple por sí solo. Los párrafos redactados para agregarlo esperan la
decisión de Diego, y una de las frases ("no se utiliza para entrenar modelos")
solo puede escribirse si el contrato con el proveedor lo garantiza.

Mientras eso no esté resuelto, lo prudente es dejar `BANDEJA_BOT_ENVIO` apagado
y usar la puerta para entrenar y proponer, no para contestarle a la gente.

## Lo que queda pendiente

- Declarar el proveedor en la política de privacidad (arriba).
- El asistente no marca `leido`: eso lo sigue haciendo el panel cuando una
  persona abre el correo. Si molesta, se agrega.
- No hay límite de pedidos por minuto. Con un token de un solo consumidor no hace
  falta, pero si algún día se comparte, hay que ponerlo.
