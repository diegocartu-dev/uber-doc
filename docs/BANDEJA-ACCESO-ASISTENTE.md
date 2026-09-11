# Acceso de un asistente externo a la Bandeja

Cómo se le da a un asistente externo (hoy: Grokbot) la capacidad de leer los
mails que entran a `contacto@` y `soporte@` y de proponer o mandar respuestas,
**sin darle acceso a la plataforma ni a la base de datos**.

Código: `src/app/api/bandeja/bot/route.ts`.
Manual de contenido para responder: `docs/MANUAL-SOPORTE-MAIL.md`.

---

## La idea en una línea

El asistente no entra a Docto. Entra a **una sola puerta** que solo sabe hacer
tres cosas: listar lo que está sin atender, abrir un hilo, y contestar a alguien
que ya nos escribió.

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
