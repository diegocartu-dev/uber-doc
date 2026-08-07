# Cuenta de cobros de otro país — prevención y detección (07/08/2026)

## Qué pasó

Un médico conectó a Docto una cuenta de Mercado Pago de otro país. Desde ese
momento todas sus preferencias de pago se generaron en la moneda y el checkout de
ese país, así que **ningún paciente argentino podía pagarle**: al llegar al pago,
el checkout pedía el importe en moneda extranjera.

Nadie se enteró. Ni el médico, ni el paciente, ni el panel. El médico siguió
apareciendo disponible y aceptando consultas que nunca se iban a poder cobrar. Se
descubrió porque una paciente estuvo 20 minutos intentando pagar.

## Cómo se detecta

Con el token del médico, `GET https://api.mercadopago.com/users/me` devuelve
`site_id`. Argentina es `MLA`. Cualquier otro sitio significa que la cuenta cobra
en otra moneda y en otro checkout.

## Qué se hizo

### 1. En el origen — al conectar la cuenta

`src/app/api/mp/oauth/callback/route.ts` consulta `users/me` **antes** de dar la
cuenta por activa. Si el sitio no es `MLA`:

- **No se guarda nada.** Se rechaza antes del upsert (mismo camino ya probado del
  mismatch de `live_mode`). Elegido sobre "guardarla marcada como inválida"
  porque `medicos_mp_accounts.estado` tiene un CHECK cerrado y una fila por
  médico: un estado nuevo obligaría a migrar el CHECK y a revisar todos los
  consumidores de `estado='activo'` (cobro incluido). Rechazar garantiza que una
  cuenta extranjera nunca quede activa, y deja intacta la cuenta anterior del
  médico si tenía una buena.
- El médico vuelve a su pantalla de cobros con el mensaje: *"Esa cuenta de
  Mercado Pago es de {país} y las consultas se cobran en pesos a pacientes en
  Argentina. Conectá una cuenta de Mercado Pago de Argentina para poder cobrar."*
  Mismo patrón de hoy (`?error=…` en la URL) + `?pais=…` para nombrar el país.
  Cubre las dos pantallas: perfil → cobros y el wizard de onboarding.
- Queda registrado en el funnel como `mp_oauth_callback_error` con
  `sub_tipo: "cuenta_no_argentina"` (evento ya existente: **no** hizo falta tocar
  la whitelist del CHECK de `eventos_funnel`).
- Sale un aviso al admin, con throttle de 6 h por médico.

**Si Mercado Pago no responde, no se rechaza.** Un timeout no es una cuenta
extranjera; dejar afuera a un médico legítimo por un hipo de la API es peor. Esa
cuenta queda sin `site_id` y la levanta el cron.

**Presupuesto de tiempo del callback.** Este callback es la única oportunidad de
guardar la cuenta: Mercado Pago quema el `code` al usarlo y el `state` ya se
borró. Si la función muere por timeout, el médico ve una pantalla de error de
Vercel y no quedó nada guardado. Por eso:

- `export const maxDuration = 30`.
- El token exchange tiene timeout propio (15 s). Antes no tenía ninguno: un MP
  lento colgaba el fetch hasta que Vercel mataba la función. Cortando nosotros,
  el médico ve nuestro mensaje y puede reintentar.
- `users/me` corta a los 4 s en este camino (el cron sí se toma los 8 s: ahí no
  hay nadie esperando, y no verificar el país no rompe nada porque el cron lo
  levanta al otro día).

**El `site_id` no queda pegado.** Si el chequeo NO da "argentina", el upsert ya
pisó `mp_user_id` con la cuenta nueva, así que el país guardado describe una
cuenta que ya no está conectada: se borra. Sin eso, un médico marcado como
extranjero que conecta una cuenta argentina justo cuando `users/me` no responde
quedaba con el cartel rojo "no puede cobrar" sobre una cuenta sana hasta el cron
del día siguiente. Lo mismo al desconectar: `/api/mp/oauth/disconnect` limpia el
país (update aparte, best-effort, para no arriesgar la desconexión).

### 2. Red de seguridad — cron diario

`src/app/api/cron/verificar-cuentas-mp/route.ts` (08:00 AR) recorre las cuentas
activas, consulta `users/me` de cada una y clasifica en tres, no en dos:

| Resultado | Qué hace |
|---|---|
| respondió y es `MLA` | guarda `site_id` + fecha de verificación |
| respondió y **no** es `MLA` | guarda el `site_id` real y **alerta** al admin |
| no se pudo verificar (timeout, 5xx, token vencido) | **no marca a nadie**; solo avisa si la ceguera se vuelve crónica (3 días) |

No suspende ni desconecta a nadie: la cuenta queda como está y la decisión la
toma una persona. El mail lo dice explícitamente.

**Solo cuentas reales.** El recorrido filtra `es_cuenta_test = false`, igual que
todo el panel admin. Un test user de Mercado Pago puede ser de otro sitio o tener
un token sandbox que no contesta: un 🔴 nombrando a un médico que no existe para
el negocio es ruido en el mismo canal donde vive el watchdog.

**La alerta 🔴 no se repite para siempre.** Un mail rojo por día indefinido se
vuelve paisaje y deja de leerse — es el modo de falla que enterró el incidente
Didit. La cadencia va por antigüedad del caso (`site_extranjera_desde`):

| Situación | Cadencia |
|---|---|
| hay al menos un caso detectado hace menos de 3 días | diaria |
| todos los casos ya llevan más de 3 días sin resolverse | semanal (el mail lo aclara) |

Un caso nuevo vuelve a poner todo en diario. Mientras tanto el problema sigue
visible en el panel, que es donde no caduca.

**Presupuesto de tiempo.** `maxDuration = 120` y lotes de 10. Si esta función
muere a mitad de camino, `withCron` nunca registra el latido y el watchdog recién
lo nota 36 h después: la red de seguridad se apagaría en silencio justo el día
que Mercado Pago anda mal. Con estos números entran más de 130 cuentas en el peor
caso (hoy hay ~20).

Registrado en los tres lugares con la misma key `verificar-cuentas-mp`:
`vercel.json`, `ESPERADOS` del watchdog y `src/lib/crons-meta.ts`.

### 3. Visible para el admin

Panel de médicos (`/admin/medicos`):

- **Chip en la fila** solo cuando hay algo que hacer: cuenta conectada Y de otro
  país. Si es argentina, si todavía no se verificó o si el médico no tiene cuenta
  activa, la fila queda como hoy. El gate por "cuenta activa" no es cosmético: el
  `site_id` describe la cuenta que estaba conectada, así que sin él la fila decía
  "no puede cobrar" mientras la ficha del mismo médico decía "sin cuenta
  conectada".
- **Ficha del médico**: bloque "Cobros (Mercado Pago)" con los cuatro estados
  posibles — sin cuenta conectada / cuenta de Argentina / cuenta de otro país /
  país sin verificar todavía.

El `SELECT` de las cuentas hace **el mismo reintento sin columnas que el cron**.
Sin ese reintento, antes de la migración la query fallaba entera, el mapa quedaba
vacío y **todos** los médicos con cuenta activa aparecían como "Sin cuenta
conectada" — o sea, exactamente lo contrario de lo que la ficha tiene que contar
cuando llega la alerta. Con el reintento, antes de la migración el panel sigue
sabiendo quién tiene cuenta conectada y solo muestra el país como "sin verificar
todavía".

### 4. Lo que NO se tocó

El flujo de cobro (`crear-v2`, webhook) quedó intacto. Esto es prevención y
detección, no un cambio del cobro.

## Migración (pendiente de aplicar)

`supabase/migrations/20260807_mp_site_id.sql` agrega `site_id`,
`site_verificado_at` y `site_extranjera_desde` a `medicos_mp_accounts`.
Verificado contra producción (Management API): hoy la tabla tiene 16 columnas y
ninguna de las tres existe.

**El código está escrito para deployarse antes de aplicarla y no romper nada:**
el `UPDATE` que guarda el país va aparte del upsert del OAuth y aparte del update
de la desconexión, el `SELECT` del panel va aparte del select de médicos, y
**tanto el panel como el cron reintentan sin esas columnas** si no existen.
Motivo: PostgREST falla el statement entero si se nombra una columna inexistente
— meterlas en el upsert habría roto la conexión de Mercado Pago para todos, y en
el select del panel habría dejado el panel sin médicos.

Estado por escenario, antes de aplicar la migración:

| Pieza | Antes de la migración | Después |
|---|---|---|
| Gate del OAuth (rechazo de cuenta extranjera) | funciona igual | igual |
| Alerta 🔴 del cron | sale igual | igual |
| Cadencia de la alerta | siempre diaria (no hay dónde guardar la antigüedad) | diaria 3 días, después semanal |
| Panel: quién tiene cuenta conectada | correcto | correcto |
| Panel: país de la cuenta | "sin verificar todavía" para todos | real |

## Verificación post-deploy (1 minuto, obligatoria)

Nunca se ejerció `GET /users/me` con un access_token OAuth **de un médico** (el
único precedente en el repo usa el token de la plataforma). Si ese endpoint no
acepta ese scope, todo esto es un no-op fail-open: el gate deja pasar cualquier
cuenta y el cron no marca a nadie. Por eso, apenas deployado:

1. Invocar el cron a mano con `CRON_SECRET`.
2. Mirar `argentinas` en la respuesta JSON.

- `argentinas` ≈ la cantidad de cuentas activas de médicos reales → **el
  mecanismo quedó probado punta a punta**, anotarlo acá.
- `argentinas === 0` con cuentas activas → el token OAuth no sirve para
  `users/me` y **hay que rehacer la detección**. Mitigante mientras tanto: ese
  mismo día sale el 🟡 de ceguera, así que no queda silencioso.

## Test

`tests/unit/mp-site.test.ts` — 12 casos, con foco en que ningún fallo de la API
(timeout, 502, 401, respuesta sin `site_id`) se clasifique como cuenta extranjera.
Es la clasificación lo que está cubierto por tests; la respuesta real de Mercado
Pago se valida con el paso de arriba.
