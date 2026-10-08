# Docto, máquina de consultas efectivas — plan del 05/10/2026

> Diego, 05/10: *"Ya no quiero otras excusas, no tengo dudas que son fallas
> nuestras y seguimos perdiendo pacientes y consultas efectivas. Tenemos que
> migrar todo nuestro esfuerzo a que Docto sea una máquina perfecta de alcanzar
> consultas efectivas. Clientes satisfechos."*

Tenía razón. Este documento reconstruye, con datos de producción, en qué paso
exacto se cayó cada atención de la última semana y de los últimos dos meses, y
ordena los arreglos por cuántas atenciones habrían salvado. Los números reales
no van acá (el repo es público): viven en la conversación y en el manual local.

## 1. Cómo se investigó

- Línea de tiempo minuto a minuto de cada atención de la semana: eventos del
  paciente (`eventos_funnel`), entradas y latidos de la sala de espera, avisos
  de WhatsApp con su estado real de entrega (Twilio), cambios de disponibilidad
  del profesional (`disponibilidad_log`) y logs del servidor (Vercel, minuto a
  minuto).
- Para cada pago rechazado de los últimos 60 días, el motivo exacto pedido a la
  API de Mercado Pago con el token del profesional cobrador.
- Seis lentes de revisión de código en paralelo, una por punto de caída, cada
  una con la evidencia del caso real, y dos verificadores independientes por
  hallazgo intentando refutarlo.

## 2. La escalera y dónde se cae

```
pedido ──► aceptado ──► pagado ──► atendido
   │           │           │
   │           │           └─ casi no se pierde nada acá (CI). En turnos sí:
   │           │              el profesional no se presenta o cancela.
   │           └─ UN TERCIO de los aceptados nunca se paga.   ← la caída más grande
   └─ UN CUARTO de los pedidos nadie los acepta.
```

Más los pedidos que el paciente retira a los segundos, en parte empujado por
lo que ve en la sala.

## 3. Lo que está roto, por escalón

Cada ítem tiene archivo:línea en los informes de las lentes; acá va el
mecanismo en una frase y qué caso real explica.

### 3.1 Pedido → aceptación (nadie acepta)

| # | Qué pasa | Dónde |
|---|---|---|
| A1 | **"Disponible" no prueba presencia.** La clínica ofrece al profesional hasta 3 h 30 después de que prendió el interruptor; nada comprueba que siga ahí. | `src/app/clinica/disponibilidad.ts` |
| A2 | **Todo el contacto por un pedido ocurre en los primeros 20 s.** Un WhatsApp "aceptar", uno "paciente esperando", un push. Después, nuestro propio tope bloquea cualquier WhatsApp 30 min. El único reaviso es push, que un iPhone sin la app no recibe. | `src/lib/whatsapp.ts`, `src/lib/consultas/sin-respuesta.ts` |
| A3 | **Un WhatsApp "undelivered" o "failed" no dispara nada.** Nadie se entera, no hay canal de respaldo, el profesional incontactable sigue publicado. | `src/app/api/twilio/status/route.ts` |
| A4 | **Apagar la disponibilidad oculta del panel un pedido vivo**; prenderla lo hace "aparecer". El paciente sigue esperando y el reloj de 10 min sigue corriendo. Explica de punta a punta el patrón apagar/prender/aceptar visto en producción. | `src/app/dashboard/BloqueConsultaInmediata.tsx` |
| A5 | **Aceptar y Rechazar se tragan el error.** Si la acción falla, el botón vuelve a "Aceptar" y la pantalla queda idéntica; el servidor no deja log ni evento. Es la única forma encontrada en el código de generar ráfagas de toques sin ningún cambio. | `src/app/dashboard/ConsultasPendientes.tsx`, `src/app/sala-espera/[consultaId]/actions.ts` |
| A6 | **Un update que afecta 0 filas se devuelve como éxito** y la tarjeta se esconde hasta recargar: el profesional cree que aceptó. | `src/app/sala-espera/[consultaId]/actions.ts` |
| A7 | **El "mensaje interno" al profesional se escribe en una tabla que ninguna pantalla lee**, y el cartel en pantalla da el motivo equivocado ("pasaron 3 horas" cuando fue un paciente que esperó 10 min). | `src/lib/consultas/sin-respuesta.ts`, `src/app/dashboard/CampanaMedico.tsx` |
| A8 | **Si el profesional ya se había apagado, el cron libera al paciente sin avisarle a nadie.** El aviso está atado al apagado, no a la cancelación. | `src/lib/consultas/sin-respuesta.ts` |
| A9 | El panel no avisa cuando está muerto: errores del poll silenciados, sin re-poll al volver a primer plano; el toast y el sonido solo existen mientras la pestaña está viva. El toast todavía manda al workspace, que rebota. | `src/app/dashboard/DashboardMedicoProvider.tsx`, `src/components/NotificacionEspera.tsx` |
| A10 | No hay escalamiento: ni reaviso fuerte, ni llamada, ni ofrecer el pedido a otro profesional antes de dar por perdido al paciente. La alternativa aparece DESPUÉS de cancelar, solo en pantalla, a alguien que ya se fue. | `src/lib/oferta.ts`, `MenuAlternativas` |

### 3.2 Aceptación → pago (aceptado y nunca pagado)

| # | Qué pasa | Dónde |
|---|---|---|
| B1 | **Mercado Pago rechaza por "alto riesgo" y nosotros lo provocamos.** Casi todos los rechazos de 60 días son `cc_rejected_high_risk` (antifraude de MP, no la tarjeta). La preferencia de pago no manda ningún dato del pagador (nombre, DNI, mail, teléfono) ni categoría del producto ni descriptor: lo que MP documenta como requisito para no rechazar. Pacientes que intentaron 3 y 5 veces, con débito y crédito, y se fueron. | `src/app/api/pago/crear-v2/route.ts` |
| B2 | **El plazo de 10 min corre desde la aceptación aunque el paciente no se haya enterado**, y nadie le dice que hay plazo. El WhatsApp sale a los 90–150 s por diseño aunque al aceptar ya se sepa que no está mirando. | `src/lib/consultas/aceptada-sin-pago.ts` |
| B3 | **La sala de una consulta vencida es un callejón sin salida**: no se puede retomar ni pagar; el menú de alternativas excluye justo al profesional que aceptó; para reintentar hay que rehacer términos, triage y confirmación. | `src/app/sala-espera/[consultaId]/SalaEsperaCliente.tsx`, `src/app/api/rescate/alternativas/route.ts` |
| B4 | **Abrir la sala de una consulta cancelada registra una entrada nueva y avisa "paciente esperando" al profesional**; la fila queda zombie y al día siguiente se le reprocha al profesional. | `src/app/sala-espera/[consultaId]/page.tsx` |
| B5 | Al fallar "Pagar consulta" se esconde el motivo real; el poll de la sala falla en silencio; no hay re-poll al volver del segundo plano ni wake lock, y la única instrucción es "no cierres esta pestaña" en un iPhone que se bloquea solo. | `SalaEsperaCliente.tsx` |
| B6 | Hasta el primer poll, la pantalla de cierre culpa al profesional ("no llegó a tomar tu consulta") aunque el motivo sea otro. | `src/app/sala-espera/[consultaId]/page.tsx` |
| B7 | El consultorio privado calcula "Disponible ahora" con hora UTC contra la franja en hora argentina (el mismo bug ya corregido en la clínica el 01/09). | `src/app/dr/[slug]/consultorio/page.tsx` |

### 3.3 El paciente se retira a los segundos

| # | Qué pasa | Dónde |
|---|---|---|
| C1 | **La sala muestra un "Tiempo estimado ~20/30/45 min" inventado** (la duración de la consulta por una posición que siempre es 1) al lado del contrato de 10 minutos. Invita a irse. | `SalaEsperaCliente.tsx` |
| C2 | **El retiro no cierra la sala ni avisa al profesional**: al profesional le llegaron WhatsApp y push por un pedido que murió a los 5 s, nunca supo que se canceló, y la entrada quedó abierta 40 h hasta que un barrido se la reprochó. | `src/app/api/consultas/cancelar-solicitud/route.ts` |
| C3 | La jurisdicción es una elección libre que se pisa en cada visita y que el servidor nunca valida al crear el pedido. | `src/app/clinica/*`, `crearConsulta` |
| C4 | El toque de Cancelar no deja huella: no se puede separar retiro consciente de arrepentimiento. | `cancelar-solicitud` |

### 3.4 Turnos pagos

| # | Qué pasa | Dónde |
|---|---|---|
| D1 | **El profesional nunca recibe un aviso con la HORA del turno antes de que el paciente entre.** El push de reserva no trae hora; no hay WhatsApp ni mail al profesional; el WhatsApp sale recién cuando el paciente ya está en la sala. | `src/app/api/pago/webhook/route.ts` |
| D2 | **El recordatorio de 15 min es un push de una sola corrida de 60 s**, solo si el turno está "confirmado", salteado si el profesional figura en curso, sin registro. Un iPhone sin app no lo recibe nunca. | `src/app/api/cron/recordatorio-medico-15min/route.ts` |
| D3 | Un solo WhatsApp por turno: el tope de 30 min por profesional es mayor que la gracia de 20 min. | `src/lib/whatsapp.ts` |
| D4 | **Una agenda publicada se mantiene viva semanas** sin que nada le pregunte al profesional si sigue atendiendo; se pausa recién DESPUÉS de dejar plantado a un paciente pago. No hay anticipación mínima para reservar. | `src/app/clinica/[medicoId]/turnos/*`, `lib/cancelaciones.ts` |
| D5 | El panel abierto no refresca la agenda de hoy; el botón "Iniciar turno" se oculta con cualquier CI viva; el diálogo de cancelar promete cosas que no pasan ("crédito 48 hs", "el motivo se muestra al paciente"). | `src/app/dashboard/*` |
| D6 | Los recordatorios que el paciente elige al reservar (24 h / 10 min) no se honran. | `turnos/actions.ts` |

### 3.5 Transversal

- Avisos críticos disparados con `void` antes de un `redirect()` en funciones
  serverless: no está garantizado que salgan (el repo ya usa `waitUntil` donde
  lo sabe).
- El push no deja rastro de entrega: "sin registro" es ceguera nuestra.
- El tablero clasifica como "abandono del paciente" un aceptado sin pagar
  aunque el paciente nunca haya visto el botón: el patrón de este documento era
  invisible por construcción.

## 4. El plan

Cuatro pilares. Dentro de cada uno, primero lo que no necesita decisión (son
bugs) y después lo que sí. Un commit por ticket, revisión adversarial antes de
mergear, y cada sprint se mide contra la escalera de la sección 2.

### Pilar 1 — Que ningún pedido muera por un bug (sin decisiones; esta semana)

| Ticket | Cierra |
|---|---|
| P1.1 La lista de pacientes en espera se ve siempre que haya uno, con el interruptor apagado inclusive. Al apagar con un pedido vivo: "Hay un paciente esperando: ¿lo atendés o lo rechazás?" | A4 |
| P1.2 Aceptar/Rechazar: error visible en la tarjeta y en el toast, `update(...).select()` con 0 filas = error, log y evento de funnel por cada intento (éxito y falla), sin esconder por estado local. El toast se queda en el panel al aceptar. | A5, A6, A9 |
| P1.3 El cron que libera a un paciente avisa SIEMPRE al profesional (mensaje + push), se haya apagado o no; la campana lee los mensajes internos; el cartel de apagado dice el motivo real. | A7, A8 |
| P1.4 El panel se refresca al volver a primer plano (`visibilitychange`/`focus`/`online`), avisa "panel desconectado" tras N fallos, y el toast también se dispara si el pedido ya estaba al cargar. | A9 |
| P1.5 La preferencia de Mercado Pago manda pagador completo (nombre, apellido, mail, DNI, teléfono), `category_id`, `statement_descriptor` y `binary_mode`. Tras un rechazo, la pantalla dice el motivo en castellano y deja reintentar con otro medio sobre la MISMA reserva, que se mantiene retenida mientras reintenta. | B1 |
| P1.6 La sala no registra entrada ni avisa al profesional si la consulta no está viva; toda cancelación (paciente, profesional, admin, plazo) cierra la entrada de sala y le avisa al otro lado. | B4, C2 |
| P1.7 Sala: `resolucion_motivo` en el render del servidor (nunca "no llegó a tomar tu consulta" si no es cierto); motivo real al fallar Pagar; re-poll al volver del segundo plano; "Reconectando…" tras 2 fallos; wake lock mientras esté visible; sacar "Tiempo estimado ~N min". | B5, B6, C1 |
| P1.8 WhatsApp al paciente en el acto si al aceptar no hay latido fresco (el cron queda para el que estaba mirando y se fue). | B2 (parte) |
| P1.9 Consultorio privado: hora argentina, con el helper de la clínica. | B7 |
| P1.10 Turno: WhatsApp al profesional al confirmarse el pago con fecha y hora; recordatorio de 15 min por WhatsApp (no solo push), con ventana de varios minutos y registro; el tope de 30 min no aplica a estos avisos. | D1, D2, D3 |
| P1.11 Un WhatsApp "undelivered"/"failed" al profesional: alerta al equipo y marca "no contactable" visible en el panel admin. | A3 |
| P1.12 Avisos críticos con `waitUntil`; registro de entrega de push; el tablero distingue "nunca vio el botón" de "vio y no pagó" de "fue a MP y falló". | 3.5 |

### Pilar 2 — Presencia y escalamiento (necesita decisiones D1–D3)

| Ticket | Cierra |
|---|---|
| P2.1 **Latido del panel.** Cada poll del panel deja `ultima_senal_at`. "Disponible" se apaga sola a los N minutos sin señal, salvo que el profesional conteste "Sigo disponible" a un WhatsApp con botón. La clínica muestra "En línea ahora" solo con señal fresca. | A1 |
| P2.2 **Escalamiento por pedido:** WhatsApp y push al segundo 0; WhatsApp otra vez a los 3 min; **llamada telefónica automática** a los 5 min (la cuenta de Twilio ya tiene números con voz). Todo registrado con estado de entrega. | A2, A10 |
| P2.3 **Ofrecer el pedido a otro profesional** de la misma especialidad y jurisdicción si a los N min nadie respondió, dicho al paciente en la sala desde el minuto uno y con su consentimiento (rótulo visible, nunca sustitución silenciosa). | A10 |
| P2.4 Jurisdicción validada en el servidor al crear el pedido; la clínica recuerda la provincia del paciente. | C3 |

### Pilar 3 — Del aceptado al pago sin perder a nadie (necesita D4)

| Ticket | Cierra |
|---|---|
| P3.1 **El plazo de pago arranca cuando el paciente se enteró** (entrega/lectura del WhatsApp o primer latido posterior a la aceptación), con techo absoluto; el plazo se dice en el WhatsApp, en el mail y en la pantalla con cuenta regresiva; el profesional ve "le avisamos hace N min". | B2 |
| P3.2 **Volver es un toque.** Si el paciente vuelve a una consulta vencida y el profesional sigue disponible, puede pagar sobre la misma consulta (o pedir de nuevo sin rehacer términos ni triage). El menú de alternativas no excluye al profesional que aceptó. | B3 |
| P3.3 Precio y lo que va a pasar, visibles ANTES de pedir; el toque de Cancelar deja huella y pide confirmación también después de aceptada. | C1, C4 |

### Pilar 4 — Turnos que se cumplen (necesita D5)

| Ticket | Cierra |
|---|---|
| P4.1 Anticipación mínima para reservar (por ejemplo 60 min), salvo profesional con señal fresca. | D4 |
| P4.2 Agenda viva: confirmación semanal por WhatsApp ("¿Seguís atendiendo estos horarios?"); sin respuesta, la agenda se pausa ANTES de plantar a alguien. | D4 |
| P4.3 Panel: agenda de hoy que se refresca sola; "Iniciar turno" siempre a mano; diálogo de cancelar que diga la verdad; recordatorios del paciente honrados. | D5, D6 |

### Estado (05/10, noche)

- **Pilar 1: mergeado y en producción** (PR #524, un commit por ticket): P1.1
  a P1.11, la parte de P3.2 que no necesita decisión ("volver a pedir" crea un
  pedido nuevo con lo ya escrito) y el arreglo de `liberar-reservas` (una
  reserva con pago rechazado vuelve a la oferta). "Tiempo estimado" ya no se
  muestra (D6, primera mitad).
- **P1.12 en parte:** `waitUntil` en el aviso "aceptar paciente" y alerta al
  equipo por WhatsApp no entregado. Falta: rastro de entrega del push y la
  medida en el tablero.
- **Plantillas de turnos:** creadas en Twilio y enviadas a Meta el 05/10
  (`docto_turno_reservado_v1`, `docto_turno_15min_v1`), cableadas como
  constantes en `src/lib/whatsapp.ts`. Hasta que Meta las apruebe, el envío
  falla y queda registrado en `whatsapp_envios`; no hay que tocar nada cuando
  se aprueben.
- **Pago (06/10, PR #528):** solo con cuenta de Mercado Pago, modo binario
  puesto, botón "Pagá con Mercado Pago", alarma por cada rechazo con el motivo
  y registro de desde dónde paga cada paciente. Regla en CLAUDE.md.
- **06–08/10, cada caída con su porqué y lo que destapó la prueba completa:**
  - #530: una CI con pago rechazado ya no queda trabada en "aceptada".
  - #531 y #532: cada consulta y cada turno pago que se cae recibe su porqué
    (suceso, falla o sin datos) y el revisor de caídas avisa solo las fallas.
  - #533: el estado de entrega de los WhatsApp ya no se pierde; a las cuentas de
    prueba no se les manda WhatsApp; la caja negra la escribe solo el servidor;
    prueba de punta a punta contra producción; reporte de medición
    (`scripts/medir-pagos.mts`).
  - #534: "Rechazar" fallaba siempre desde el 16/05 (el estado no existía).
  - #535: quien toca el link de su sala sin sesión vuelve a ella después del
    login, y la llegada queda registrada.
  - #536: el profesional cuyo WhatsApp no recibe avisos queda bloqueado hasta
    actualizar el celular (regla en CLAUDE.md).
- **Pilares 2 a 4:** decisiones aprobadas (sección 5), sin implementar.

### Plantillas de WhatsApp de turnos (aprobadas por Diego el 05/10)

Las dos van al profesional, con botón que abre su panel. El texto que quedó en
Twilio agrega "Lo atendés desde tu panel" y el pie habitual de Docto.

- **docto_turno_reservado_v1** (al confirmarse el pago):
  > Hola {{1}}. Un paciente reservó y pagó un turno con vos para **{{2}} a las {{3}}**. Lo esperás en tu panel de Docto a esa hora; quince minutos antes te volvemos a avisar.
- **docto_turno_15min_v1** (15 minutos antes):
  > Hola {{1}}. En 15 minutos empieza tu turno de las **{{3}}** ({{2}}). Entrá a tu panel de Docto: el paciente va a estar en la sala.

### Orden y ritmo

1. Pilar 1 entero (sin decisiones): son bugs. Se despliega en tandas por
   ticket, cada una con revisión adversarial.
2. Pilares 2 y 3 apenas haya decisión; las plantillas de WhatsApp con botón
   necesitan aprobación de Meta (1–2 días), así que se piden el día uno.
3. Pilar 4 en paralelo con 3.

### La medida

Una sola: **consultas efectivas sobre pedidos**, semanal, con los tres
escalones a la vista (aceptación, pago, atención) y, por cada atención perdida,
el escalón y el motivo. Vive en el tablero. Si un escalón no sube después de su
pilar, el pilar no está cerrado.

## 5. Decisiones — APROBADAS por Diego el 05/10/2026

Diego aprobó las seis propuestas tal como estaban escritas ("los 3 ok"). Lo que
sigue es lo que se implementa; cualquier cambio de número vuelve a Diego.

- **D1 Presencia — sí.** 15 min sin señal del panel → WhatsApp "¿Seguís
  disponible?" con botón; sin respuesta en 5 min → disponibilidad apagada. La
  clínica muestra "En línea ahora" solo con señal fresca. (P2.1)
- **D2 Llamada — sí.** Llamada telefónica automática al profesional a los 5 min
  de un pedido sin respuesta, desde el número de Twilio que ya tenemos. (P2.2)
- **D3 Otro profesional — sí, a los 4 min.** El pedido se ofrece a otro
  profesional de la misma especialidad y jurisdicción, con el paciente avisado
  desde el minuto uno, rótulo visible y su consentimiento; nunca sustitución
  silenciosa. (P2.3)
- **D4 Plazo de pago — sí.** El reloj arranca cuando el paciente se enteró de
  la aceptación, con techo de 30 min; si vuelve con el profesional todavía
  disponible, paga sobre la misma consulta. (P3.1, P3.2)
- **D5 Turnos — sí.** Anticipación mínima de 60 min para reservar, salvo
  profesional con señal fresca; confirmación semanal de agenda por WhatsApp, y
  sin respuesta la agenda se pausa antes de plantar a alguien. (P4.1, P4.2)
- **D6 Textos — sí.** "Tiempo estimado" ya salió (#524); falta mostrar el
  precio antes de pedir. (P3.3)

Las plantillas de WhatsApp con botón que necesitan D1, D4 y D5 hay que pedirlas
a Meta el primer día (tardan 1–2 días); sus textos van a Diego antes, como
siempre.
