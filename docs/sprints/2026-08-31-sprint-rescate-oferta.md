# Sprint de rescate — no perder al paciente en el momento de la caída (31/08/2026)

**Disparador:** un turno pago en el que la profesional nunca entró. La resolución
automática funcionó (21 minutos, reembolso incluido) pero la paciente no se
enteró, el panel mostró un fantasma "esperando" 18 horas, y la profesional no
recibió ninguna consecuencia. De ahí salió la pregunta de Diego: *"a todos los
pacientes debemos ofrecer alternativas cuando el profesional no los acepta o
los hace esperar"*.

**Método:** antes de escribir código se midió contra producción dónde se cae la
demanda (contrafáctico al instante exacto de cada caída, 34 días) y un panel de
cinco perspectivas + crítico revisó la propuesta. Números internos: en la
conversación con Diego, no acá (repo público).

## Los 4 momentos de caída y qué se hizo

| Momento | Qué había | Qué hay ahora |
|---|---|---|
| A · provincia sin profesionales habilitados | Formulario de mail | Igual — **decisión de Diego 31/08: la jurisdicción se mantiene** (ratifica 24/08), para CI y turnos. Sin esa llave, A no tiene oferta posible. Los leads alimentan reclutamiento provincial |
| B · hay profesionales, ninguno en línea | Popup modal de un turno (se mostró un mes entero: **cero taps**) | Card inline con precio (#458) + **piloto despertar-oferta** (#462) |
| C · pedido de CI que nadie aceptó | "Podés elegir otro" sin decir a quién | **Menú de rescate** con nombres (#459) |
| D · turno pago, profesional ausente | Un botón "Volver al inicio" | Reembolso explicado + menú de rescate (#459) + consecuencia al profesional (#453/#460) |

## Los tickets (un commit cada uno)

- **#454 `lib/oferta.ts`** — fuente única de "quién puede atender AHORA": calca
  los seis filtros de la clínica (aprobado, no oculto, carril test, identidad,
  **puede cobrar**, R2) con las mismas funciones importadas. Selección pura con
  9 tests. La página de la clínica no se refactoriza (outage 22/06); migas de
  pan cruzadas.
- **#455 contratos-con-techo** — toda espera anuncia su tope desde el minuto
  uno (10 min CI sin aceptar / 30 min CI paga / 20 min turno). Muere el banner
  que aparecía en el MISMO minuto en que el cron cancelaba.
- **#456 medición** — `rescate_ofrecido` (server, también con cero opciones) y
  `rescate_elegido` (tap). El éxito se mide por pago, nunca por tap.
- **#459 menú de rescate** — un componente, tres puertas. Reglas: solo lo vivo
  (sin cascarón vacío), especialidad SIEMPRE rotulada (el de otra especialidad
  "puede orientarte", jamás equivalente silencioso), el profesional que falló
  no aparece, regla del Uber verificada ANTES de pintar CTAs, las dos platas no
  se acoplan, CTA de CI entra por el triage (conserva la compuerta de
  emergencia → 107).
- **#457 carrera cron-vs-cambio** — si el cron canceló un segundo antes, el
  cambio de profesional sigue de largo en vez de rebotar; y el profesional no
  recibe dos avisos contradictorios.
- **#458 atajo inline** — el popup que convertía 0 pasa a primera card del
  listado, con precio (reversa del 28/07 aprobada por Diego).
- **#460 agenda despublicada al plantar** — bandera `agenda_pausada_at` (los
  slots NO se mutan: la sincronización contra modelos desharía el bloqueo).
  Cuatro puertas la respetan, incluido el guard server-side de reserva que no
  existía. Reactivación: un toque del propio profesional desde su agenda.
- **#461 StatusCallback de Twilio** — cierra "un aviso enviado no es un aviso
  recibido" (27/08): el estado real de entrega entra a `whatsapp_envios` por
  webhook firmado. Webhook a WWW (regla: el apex pierde los webhooks en el 307).
- **#462 piloto despertar-oferta** — la palanca de fondo: el grueso de la
  demanda perdida cae donde hay profesionales que existen y están apagados.
  El paciente dispara el aviso con un toque; guardrails no-negociables: opt-in
  explícito (default false, lo activa Diego con el OK de cada profesional),
  1/día por profesional, ventana 8–22, máx 3 por disparo, tope global 10/hora,
  solo activos en los últimos 14 días. **Inerte sin `TWILIO_CONTENT_SID_DEMANDA`**
  (plantilla nueva pendiente de crear en Twilio + aprobación Meta).
  **Kill criterion preescrito:** <10% de avisos entregados con profesional
  conectado a las 6 semanas → se apaga, no se "mejora".

## Decisiones de Diego que este sprint fija

1. Jurisdicción como está, para CI y turnos ("ofrecemos lo más cercano que haya
   en las dos opciones", dentro de la provincia del paciente).
2. Clínico como opción **rotulada** de un especialista, siempre.
3. D: reembolso confirmado inmediato al paciente + pago nuevo aparte (sin
   acoplar las dos platas).
4. OK al reemplazo del popup del 28/07 (con precio).
5. Alternativas recién DESPUÉS del corte del plazo, nunca durante el pedido
   pendiente (protege la tasa de aceptación y evita carreras contra el
   profesional que iba a aceptar).
6. Piloto despertar-oferta y despublicación de agenda: adentro.

## Deudas declaradas

- El tile "Turnos libres — próximos 7 días" del admin cuenta slots de agendas
  pausadas (sobreconteo de oferta en el tablero; no afecta pacientes).
- El opt-in del piloto no tiene UI: alta por SQL con el OK de cada profesional.
- Atribución del rescate a pagos ≤72h por otra sesión/dispositivo: limitada
  (los eventos llevan recurso pero no hay sesionId global).
- Motivo de consulta NO se precarga al re-pedir con otro profesional (es un
  dato de salud escrito para una persona concreta; si se precarga algún día,
  visible y editable antes de enviarse).

## Cómo se lee el resultado (Fede)

Denominador = exposiciones (`rescate_ofrecido`), nunca calendario. Nada se
concluye antes de 15 exposiciones. Semáforo: ≥10% de pagos originados = señal;
tap ≥30% sin pagos = mirar el embudo aguas abajo; 60 exposiciones con ≤1 pago =
apagar o rediseñar. No vale mover el umbral después.
