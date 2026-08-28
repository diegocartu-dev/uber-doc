# 27/08/2026 — Pacientes que se registran y casi ninguna consulta: qué era y qué no

> Los números concretos (cuántos profesionales, cuántos disponibles, cuántos
> pedidos) NO van acá: el repo es público y la regla prohíbe publicar conteos y
> estados de la base de producción. Para reproducir la medición están los dos
> scripts que se listan al final.

## El síntoma y la hipótesis equivocada

Se registraban pacientes todos los días y entraban muy pocas consultas. La
primera hipótesis fue Mercado Pago: "los pacientes se traban en el pago".

**Era falsa, y la medición contra producción lo probó.** Los permisos de cobro
estaban vigentes, el cobro funcionó de punta a punta el mismo día —pedido,
pago, aceptación en un minuto, video, receta y certificado— y los avisos por
WhatsApp salieron y se entregaron en el minuto cero, con el profesional
aceptando.

**Lo que faltaba era oferta.** Casi nunca había un profesional en línea para
recibir el pedido. Cuando lo hay, el sistema entero funciona.

## Por qué el tablero mandaba a mirar el lugar equivocado

Ese fue el costo real: tres frenos distintos se veían como uno solo.

1. **El funnel llamaba "eligió médico, no pagó"** a un pedido que nadie había
   aceptado. La rama `eligio` se evaluaba ANTES que `ciOnline === 0`, así que
   "había médicos pero ninguno en línea" era **inalcanzable** para cualquiera
   que hubiese elegido. Un fallo de oferta entraba con etiqueta de fallo de cobro.

2. **Y llamaba "pagó"** a un pedido en `esperando` —el que nadie aceptó y nadie
   pagó— porque `pagoConsulta` usaba una lista de estados escrita a mano.

3. **El panel de médicos mostraba en verde** a quien no podía cobrar:
   `mpConectado` miraba solo `estado`, que pasa a 'expirado' recién DENTRO del
   checkout. La pantalla que tenía que avisar era la que tapaba el agujero.

## Los agujeros reales que aparecieron en el camino

Ninguno era la causa de estos días, pero los cuatro son reales y están arreglados.

- **Los permisos de MP vencen y nada los renovaba.** El `refresh_token` se
  guardaba en el alta y no se leía en ningún lado; la tabla venía preparada
  (`ultima_renovacion`, índice sobre `expires_at`) y la renovación nunca se
  escribió. Los vencimientos reales caen recién a fin de año: era una bomba de
  tiempo, no el incendio de hoy.
- **"Un profesional visible puede cobrar" era una suposición.** Ni la clínica ni
  `crearConsulta` miraban la cuenta de cobros; el único control era el candado
  del toggle "disponible", que la consulta solo al encenderlo.
- **Un error de alta dejaba al paciente sin salida.** `pacientes` tiene índices
  únicos de DNI y de EMAIL, y el clasificador solo miraba el de DNI: una
  colisión de email caía en "Ocurrió un error. Intentá de nuevo.", sin causa,
  sin salida y sin la dirección de soporte.
- **`whatsapp_envios` se escribe desde el 21/08 y ningún código la leía.** La
  respuesta a "¿le avisamos?" estaba guardada y nadie la había mirado nunca.

## Lo que quedó en producción

| Commit | Qué |
|---|---|
| `4c2f224` | El error que traba un alta dice cuál es y lleva a /ayuda |
| `308dfae` | Renovación de tokens de MP: checkout auto-reparable + cron cada 6 h |
| `8f22dbe` | Dos renovaciones simultáneas ya no apagan una cuenta sana |
| `3dd4522` | El panel marca "Permiso de cobro vencido" |
| `abb3431` | El funnel separa fallo de oferta de fallo de cobro |
| `46ce746` | Un profesional que no puede cobrar no se ofrece al paciente |
| `f2475ba` | El panel marca también "Sin cuenta de cobros" |

## Las dos comprobaciones

Solo lectura, con las credenciales de `.env.local`. **Hay que correrlas en una
máquina con acceso a producción**: una sesión en la nube no tiene `.env.local`
(está en `.gitignore`) ni salida hacia Supabase o Twilio.

```
npx tsx scripts/verify-cobros-mp.ts
npx tsx scripts/verify-avisos-whatsapp.ts [días]
```

La primera contesta si hay flags apagados, si Mercado Pago acepta hoy el token
de cada profesional (sonda viva contra su API), cuánta oferta hay en línea, y en
qué escalón muere cada pedido. La segunda contesta si el aviso salió, a qué
minuto, y qué dice Twilio de la entrega y la lectura.

**El escalón nombra el motivo REGISTRADO, no uno deducido.** La primera versión
metía en "murió antes de pagar" todo lo que no fuera atendido, así que un
paciente que se retiró por su cuenta figuraba como falla de cobros — el mismo
error del funnel, cometido de nuevo en la herramienta que venía a corregirlo.

## Lo que sigue abierto

1. **La oferta.** No es un problema técnico: es conseguir que los profesionales
   se pongan disponibles. Todo el resto de la máquina funciona.
2. **Un tercio del plantel nunca conectó Mercado Pago.** No son oferta
   potencial: no pueden cobrar aunque se prendan. Desde `46ce746` ya no se
   ofrecen al paciente.
3. **El estado de entrega de WhatsApp hacia adelante** necesita `StatusCallback`
   + webhook + columnas nuevas en `whatsapp_envios`. Hoy el pasado se recupera
   preguntándole a Twilio; el futuro no se registra.
4. **El gate de disponibilidad** (`dashboard/actions.ts`) sigue mirando `estado`
   y no `expires_at`.
5. **`/onboarding` no está exento del timeout de inactividad**: un paciente que
   navegó hace más de 8 h y recién ahí confirma su mail queda deslogueado al
   llegar. La raíz es que el timeout se apoya en una cookie que setea la
   navegación anónima — control del Anexo I, con gate de Roberto.

## La lección

La hipótesis inicial se sostuvo horas porque **el tablero la confirmaba**: decía
"no pagó" y ahí fuimos. El dato que la tiró abajo no salió de leer código sino
de medir contra producción, que es exactamente lo que la regla de evidencia
empírica del repo pide y lo que no se hizo hasta el final.
