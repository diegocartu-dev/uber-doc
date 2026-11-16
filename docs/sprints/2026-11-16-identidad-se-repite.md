# Lo que Didit no aprueba solo se hace de nuevo (16/11/2026)

## El pedido

Diego, con tres fichas frenadas por la verificación de identidad: qué se puede
hacer con Didit desde Docto y cómo agilizar las revisiones. Decisión: "esos casos
que da error o revisión o dudoso debería exigir que se realice Didit de cero". Y
una condición antes de mandar ningún aviso: confirmar que el profesional de
verdad pueda rehacer o completar la verificación.

## Qué podía hacer el profesional, estado por estado (antes de este cambio)

| Estado de la verificación | Qué veía al entrar | ¿Podía seguir solo? |
|---|---|---|
| Nunca la empezó | Cartel de identidad en la pantalla «en revisión» → pantalla de inicio | Sí (desde el 13/11) |
| La empezó y no la terminó | «Te quedó la verificación a medias» + «Continuar verificación» | Sí. Didit devuelve la misma sesión mientras no esté cerrada |
| Didit la rechazó | «No pudimos verificarte esta vez» + «Volver a intentar» | Sí, con una sesión nueva |
| **Didit la dejó en revisión** | «Estamos revisando tu verificación… Verificamos tu identidad correctamente» | **No.** Sin botón, y con un texto que no era cierto |
| Didit aprobó y el cruce de Docto no cierra | La misma pantalla de revisión | No le toca a él: se resuelve en el panel |

Cómo se confirmó: leyendo el código de las tres pantallas y de
`/api/didit/crear-sesion` (crea una sesión siempre que la identidad no esté
validada), y la documentación pública de Didit sobre sesiones repetidas: una
sesión sin terminar se reutiliza; una rechazada, en revisión, vencida o
abandonada nunca se reutiliza, así que la siguiente arranca de cero; y las
sesiones del mismo profesional no cuentan como duplicado entre sí. **No se probó
con una persona real haciendo la biometría dos veces.**

## Qué cambió

1. **Una sola traducción del estado de Didit** (`src/lib/medicos/estado-identidad.ts`,
   `pasoIdentidad`): habilitada, sin empezar, a medias, repetir, procesando, o
   cruce en revisión. La usan las dos pantallas de identidad del profesional,
   la columna Identidad del panel y `crear-sesion`.
2. **La revisión real de Didit pasa a «repetir»**: el profesional ve la pantalla
   de reintento que ya existía para el rechazo (mismo texto) y hace una
   verificación nueva. La revisión que pone Docto se distingue por
   `identidad_revision_motivo` y no cambia.
3. **Solo cuenta la verificación vigente.** El webhook ignora el aviso de una
   sesión que no es la guardada en la ficha (`esSesionVigente`): una sesión vieja
   que vence o se abandona ya no pisa el estado de la nueva. La excepción es una
   sesión anterior que Didit aprobó: es una verificación completa de la misma
   persona, pasa a ser la vigente y sigue al cruce de siempre.
4. **`crear-sesion`** mira el error al guardar la sesión antes de mandar al
   profesional a Didit, limpia el motivo de una revisión anterior, y no abre una
   verificación nueva si Didit ya aprobó y lo que falta es de Docto (409).
5. **Panel:** la ficha dice «Tiene que repetir la verificación» y la columna
   Identidad, «Debe repetirla» (antes «En revisión», que invitaba a esperar).
6. **Aviso al equipo** por una revisión de Didit: ya no pide decidir en la
   consola; dice que el profesional tiene que repetirla y que todavía no recibe
   un aviso propio.

Sin migración: no hay columnas nuevas (las que se leen existen en las dos bases).

## Lo que espera el OK de Diego: los avisos al profesional

Hoy quien termina la biometría vuelve a una pantalla que le dice que su registro
está completo. Si después Didit no la aprueba, solo se entera si vuelve a entrar.
Faltan dos mails, que son texto nuevo:

**A. A quien no empezó o no terminó la verificación** (a las 24 h del alta, y
después cada 72 h, hasta los 30 días):

> Asunto: Te falta un paso para terminar tu registro en Docto
>
> Hola, {nombre}:
>
> Recibimos tus datos y tu credencial. Para terminar tu registro falta la
> verificación de identidad: se hace desde tu cuenta, con tu DNI y la cámara del
> teléfono o la computadora.
>
> [Verificar mi identidad]
>
> Si tenés algún inconveniente, escribinos a soporte@docto.com.ar y te ayudamos.
>
> — El equipo de Docto

**B. A quien tiene que repetirla** (una vez, cuando Didit no la aprueba):

> Asunto: Tenemos que repetir tu verificación de identidad
>
> Hola, {nombre}:
>
> No pudimos confirmar la verificación de identidad que hiciste. Suele pasar por
> una foto borrosa, poca luz o un documento difícil de leer.
>
> Hacela de nuevo desde tu cuenta: con buena luz, el DNI sin reflejos y la cara
> despejada.
>
> [Repetir verificación]
>
> Si tenés algún inconveniente, escribinos a soporte@docto.com.ar y te ayudamos.
>
> — El equipo de Docto

Con esos mails andando, el aviso al equipo por la primera revisión o el primer
rechazo deja de salir; suena recién si el mismo profesional vuelve a fallar.

## Deudas

En `DECISIONES.md` §4, "Identidad que se repite, lo que quedó afuera (16/11)".
