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

Registrado en los tres lugares con la misma key `verificar-cuentas-mp`:
`vercel.json`, `ESPERADOS` del watchdog y `src/lib/crons-meta.ts`.

### 3. Visible para el admin

Panel de médicos (`/admin/medicos`):

- **Chip en la fila** solo cuando hay algo que hacer: cuenta de otro país. Si es
  argentina o todavía no se verificó, la fila queda como hoy.
- **Ficha del médico**: bloque "Cobros (Mercado Pago)" con los cuatro estados
  posibles — sin cuenta conectada / cuenta de Argentina / cuenta de otro país /
  país sin verificar todavía.

### 4. Lo que NO se tocó

El flujo de cobro (`crear-v2`, webhook) quedó intacto. Esto es prevención y
detección, no un cambio del cobro.

## Migración (pendiente de aplicar)

`supabase/migrations/20260807_mp_site_id.sql` agrega `site_id` y
`site_verificado_at` a `medicos_mp_accounts`.

**El código está escrito para deployarse antes de aplicarla y no romper nada:**
el `UPDATE` que guarda el país va aparte del upsert del OAuth, el `SELECT` del
panel va aparte del select de médicos, y el cron reintenta sin esas columnas si
no existen. Motivo: PostgREST falla el statement entero si se nombra una columna
inexistente — meterlas en el upsert habría roto la conexión de Mercado Pago para
todos, y en el select del panel habría dejado el panel sin médicos.

Antes de aplicarla: el cron alerta igual (la parte que importa), solo no persiste
el país y el panel muestra "sin verificar". Después de aplicarla: todo completo.

## Test

`tests/unit/mp-site.test.ts` — 12 casos, con foco en que ningún fallo de la API
(timeout, 502, 401, respuesta sin `site_id`) se clasifique como cuenta extranjera.
