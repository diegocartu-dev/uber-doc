# 27/08/2026 — Pacientes que se registran y cero consultas: qué se encontró y qué falta

## El síntoma

Pacientes nuevos registrándose y ninguna consulta entrando. La hipótesis inicial
fue Mercado Pago: "los pacientes están frenados en el pago".

## La conclusión, y por qué la hipótesis inicial era razonable pero equivocada

El tablero decía "eligió médico, no pagó". Se lee como un problema de cobros.
**No lo era: esos pedidos nunca llegaron a Mercado Pago.**

`api/insights/funnel/route.ts` evaluaba la rama `eligio` ANTES que
`ciOnline === 0`, así que la rama "había médicos pero ninguno en línea" era
**inalcanzable** para cualquiera que hubiese elegido un profesional. Un fallo de
oferta entraba al tablero con etiqueta de fallo de cobro.

El segundo detalle lo confirma: para que una fila dijera "no pagó", la consulta
no podía estar en `pagada`, `aceptada`, `en_curso`, `completada` ni `esperando`.
Si un profesional la hubiera aceptado y el paciente se hubiera trabado pagando,
la consulta estaría en `aceptada` — y el tablero habría dicho **"pagó"**. O sea:
esas filas solo pueden ser consultas canceladas, y la cancelación que domina
desde el 22/08 es la de los 10 minutos sin que nadie acepte
(`PLAZO_SIN_ACEPTAR_MIN`, #432/#435).

## Los cinco agujeros encontrados

### 1. Los permisos de cobro de Mercado Pago vencen y nada los renovaba

El alta de OAuth guardaba `refresh_token_encrypted` y **no se leía en ningún
lado**: no había un solo `grant_type: "refresh_token"` en el repo. La tabla venía
preparada desde el día uno (`ultima_renovacion`, índice sobre `expires_at`
filtrado por `estado='activo'`) y la renovación nunca se escribió.

El vencimiento se descubría DENTRO del checkout, con el paciente ya pagando.
Hasta ese momento la fila decía `activo`, el gate de disponibilidad la dejaba
publicarse, y el pago moría con 422 al final del flujo. Ni el profesional ni el
panel se enteraban.

Mismo patrón que el caso 07/08 (cuenta de otro país) por otra puerta:
disponible, aceptando, incobrable.

### 2. El panel de admin mostraba en verde justo a quien no puede cobrar

`mpConectado: cuenta?.estado === "activo"` — el mismo campo con el punto ciego.
La pantalla que tenía que avisar era la que tapaba el agujero. La regla correcta
ya existía, escrita una sola vez en `medico/perfil/TabCobros`, y nadie más la
usaba.

### 3. El tablero contaba como "pagó" un pedido que nadie aceptó

`pagoConsulta` usaba una lista de estados a mano que incluía `esperando`. Ese es
exactamente el pedido que nadie aceptó y nadie pagó: entraba como plata cobrada.

### 4. Un error de alta dejaba al paciente sin salida

`pacientes` tiene dos índices únicos (DNI y EMAIL) y el clasificador solo miraba
el de DNI. Una colisión de email caía en "Ocurrió un error. Intentá de nuevo.":
sin causa, sin salida, sin siquiera la dirección de soporte. El paciente
reintenta y falla igual, para siempre.

### 5. No sabemos si el aviso al profesional llega ni si lo leen

`whatsapp_envios` registra cada intento desde el 21/08 y **ningún código del repo
lee esa tabla**. Peor: `resultado = 'enviado'` solo significa que Twilio aceptó
la llamada a su API. El envío no manda `StatusCallback` y no hay webhook, así que
el estado real de entrega nunca entró a la base.

**Esto importa más que los otros cuatro:** el plazo de 10 minutos se fijó sin
haber medido nunca si el aviso llega a tiempo. Si los mensajes se entregan en el
minuto 7, el problema no es que los profesionales no respondan.

## Qué se deployó (main)

| Commit | Qué |
|---|---|
| `4c2f224` | El error que traba un alta dice cuál es y lleva a /ayuda |
| `308dfae` | Renovación de tokens de MP: checkout auto-reparable + cron cada 6 h |
| `8f22dbe` | Dos renovaciones simultáneas ya no apagan una cuenta sana |
| `3dd4522` | El panel muestra "Permiso de cobro vencido — no puede cobrar" |
| `abb3431` | El funnel separa fallo de oferta de fallo de cobro |
| `53db00a`, `8bc0288`, `4d543a9` | Los dos scripts de comprobación |

## Las dos comprobaciones, y qué contesta cada una

```
npx tsx scripts/verify-cobros-mp.ts
```
Flags apagados, permisos de cobro vencidos, **sonda viva contra la API de
Mercado Pago** (un 401 es prueba directa de que no acepta ese token), y en qué
escalón mueren los pedidos.

```
npx tsx scripts/verify-avisos-whatsapp.ts [días]
```
Si se avisó, a qué minuto salió, **qué dice Twilio hoy** de cada mensaje, y si
la entrega ocurrió después del minuto 10 con el pedido ya cancelado.

Los dos son de solo lectura.

## Lo que queda abierto

1. **Nada de esto se verificó contra producción.** El diagnóstico sale de leer
   código y de tests locales. La sesión que hizo el trabajo corrió en un
   contenedor sin `.env.local` (está en `.gitignore`, no viaja con el clone) y
   con la salida a `api.supabase.com`, `*.supabase.co` y `docto.com.ar` cerrada
   por política de egress. Las dos comprobaciones existen justamente para que
   esto deje de ser una hipótesis.
2. **El estado de entrega de WhatsApp hacia adelante** necesita `StatusCallback`
   + webhook + columnas nuevas en `whatsapp_envios`: una migración que no se
   pudo aplicar ni verificar. No se deployó código que dependa de columnas que
   quizá no existen.
3. **El gate de disponibilidad** (`dashboard/actions.ts`) sigue mirando `estado`
   y no `expires_at`. Con la renovación andando, corregirlo es correcto; sin
   ella solo achica la oferta sin sumar consultas.
4. **`/onboarding` no está exento del timeout de inactividad.** Un paciente que
   navegó el sitio hace más de 8 h y recién ahí confirma su mail es deslogueado
   al llegar al onboarding. La raíz es que el timeout se apoya en una cookie que
   setea la navegación anónima — es un control de seguridad del Anexo I y tiene
   gate de Roberto.
5. **La decisión de producto**: si el plazo de 10 minutos se sostiene, y eso se
   decide con el dato de entrega de WhatsApp, no antes.
