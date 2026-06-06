# Decisiones de Producto — Docto
## Comunicaciones, Cancelaciones, Pagos y Agenda
### Documento oficial — No rediscutir

---

## 1. CANALES DE COMUNICACIÓN

### Regla general
- **El médico** se comunica exclusivamente por **mensajería interna** dentro de Docto.
- **El paciente** recibe comunicaciones por **email** (canal principal externo).
- No hay WhatsApp ni SMS en esta fase.

### 1.1 Email transaccional — Solo para el paciente

| Evento | Paciente recibe email | Médico |
|---|---|---|
| Turno confirmado | ✅ Email + adjunto .ics para calendario | Mensajería interna |
| Recordatorio 24hs antes | ✅ Email | — nada — |
| Recordatorio 10 min antes | ✅ Email ("Ingresá ahora") | — nada — |
| Turno cancelado por médico | ✅ Email + link reprogramar + .ics cancelación | Mensajería interna |
| Turno cancelado por paciente | ✅ Email + link reprogramar + .ics cancelación | Mensajería interna |
| Consulta finalizada + documentos | ✅ Email con link a docs | — nada — |

**Regla inamovible:** Ningún email contiene diagnóstico, medicación ni datos clínicos. Solo datos logísticos.

### 1.2 Archivo .ics (calendario)

- Al confirmar turno: se adjunta `.ics` con `METHOD:REQUEST` (agrega al calendario).
- Al cancelar turno: se adjunta `.ics` con `METHOD:CANCEL` (elimina del calendario automáticamente).
- El evento del calendario incluye: fecha, hora, nombre del médico y link directo a la sala de espera.
- Compatible con Google Calendar, Apple Calendar y Outlook.

### 1.3 Link de reprogramación en emails de cancelación

- El email de cancelación incluye botón **"Elegir nueva fecha"** → `/dr/[slug del médico]`.
- Si el médico no tiene fechas disponibles → se muestra opción de reembolso directamente.
- El link usa el crédito existente, el paciente no vuelve a pagar.
- El email distingue quién canceló:
  - Médico canceló: *"Tu médico canceló el turno. Podés reprogramar sin costo."*
  - Paciente canceló: *"Cancelaste tu turno. Podés reprogramar usando tu crédito."*

### 1.4 Mensajería interna — Para todo lo demás

Tabla `mensajes` en Supabase con polling de 5 segundos (nunca Realtime).

**Contextos donde existe el chat:**

| Contexto | Participantes | Duración |
|---|---|---|
| Sala de espera CI | Paciente ↔ Médico | Hasta que inicia la videollamada |
| Durante consulta | Paciente ↔ Médico | Duración de la consulta |
| Post-consulta | Paciente ↔ Médico | 48hs desde finalización |
| Turno cancelado | Sistema → ambos | 24hs para coordinación |

**UX de mensajería:**
- **Ícono de sobre con globito rojo** en navbar de ambos lados cuando hay mensajes sin leer.
- **ChatPopup flotante** en esquina inferior derecha — abre y cierra sin interrumpir la videollamada.
- Z-index por encima de todo MENOS del iframe de Daily.co.
- Burbujas: azul `#E6F1FB` paciente / verde `#E1F5EE` médico.
- Mensajes de sistema: fondo gris, centrados, tipografía más pequeña.
- Límite: 500 caracteres por mensaje.
- Al abrir el popup: todos los mensajes se marcan como leídos.

**Mensajes automáticos del sistema** (rol_emisor = 'sistema'):
- Al cancelar turno (médico): *"El Dr. [nombre] canceló el turno del [fecha]. Podés reprogramar desde docto.com.ar/dr/[slug]"*
- Al cancelar turno (paciente): *"Cancelaste el turno del [fecha]. Tu crédito está disponible para reprogramar."*
- Al reprogramar: *"Tu turno fue reprogramado al [nueva fecha] a las [hora]."*

---

## 2. CANCELACIONES

### 2.1 Cancelación por el paciente

| Cuándo cancela | Penalidad | Reembolso |
|---|---|---|
| Más de 48hs antes | Sin cargo | 100% reembolso |
| Menos de 48hs antes | Cargo total | 0% — no hay reembolso |

- Tope de **2 reprogramaciones por médico**. Al tercer intento solo puede cancelar e iniciar de cero.
- El turno cancelado vuelve al pool disponible automáticamente.
- Si el mismo paciente retoma ese slot exacto → el turno queda pagado (usa el pago original).

### 2.2 Cancelación por el médico

- El médico puede cancelar **cualquier turno confirmado** en cualquier momento, siempre que sea **antes de la hora del turno**. Sin restricción de tiempo mínimo.
- Al cancelar, el sistema dispara automáticamente el flujo — el médico no necesita hacer nada más.

**Flujo post-cancelación del médico:**
1. Turno → estado `cancelado_medico`
2. Crédito del paciente queda disponible por **48hs**
3. Email al paciente con dos opciones:
   - **"Elegir nueva fecha"** → `/dr/[slug]` con disponibilidad actual
   - **"Quiero el reembolso"** → procesa reembolso
4. Si en 48hs el paciente no hace nada → **reembolso automático**
5. Si no hay fechas disponibles con ese médico → **reembolso automático**

### 2.3 Cómo puede cancelar el médico

**Dos vías, misma acción, mismo resultado:**

**A) Botón en el calendario:**
- Cada turno confirmado/en_espera muestra un checkbox a la izquierda.
- Al seleccionar 1 o más turnos → aparece botón "Cancelar seleccionados (N)" en naranja `#D85A30` en el header del día.
- Antes de ejecutar: confirm dialog *"Vas a cancelar N turno(s). El paciente recibirá un email con la opción de reprogramar o solicitar reembolso. ¿Confirmás?"*
- Turnos ya cancelados/completados NO tienen checkbox pero SÍ aparecen en el listado.

**B) Nova (asistente IA):**
- Nova entiende frases como: *"Cancelá el turno del martes"*, *"Cancelá todos los turnos del jueves"*, *"No voy a poder atender el viernes"*.
- Nova siempre confirma antes de ejecutar.
- Nova ejecuta la misma server action `cancelarTurnoMedico()` que el botón.
- Un solo punto de verdad — Nova y el botón son idénticos en el resultado.

### 2.4 Historial de turnos cancelados

**Regla inamovible:** Los turnos cancelados SIEMPRE aparecen en el historial, con la misma jerarquía visual que los completados. Nunca se eliminan ni se mueven a una sección separada.

**Badges por estado:**

| Estado | Color badge | Texto (médico ve) | Texto (paciente ve) |
|---|---|---|---|
| `completado` | Verde `#1D9E75` | Completado | Completado |
| `cancelado_medico` | Naranja `#D85A30` | Cancelado por el médico | Cancelado por el médico |
| `cancelado_paciente` | Naranja `#D85A30` | Cancelado por el paciente | Cancelaste este turno |
| `ausente_paciente` | Gris `#888780` | Paciente ausente | Turno no asistido |
| `ausente_medico` | Gris `#888780` | Médico ausente | Médico ausente |

Orden: fecha DESC. Todos los estados en el mismo listado.

---

## 3. REPROGRAMACIONES

### 3.1 Reglas

- El paciente puede reprogramar hasta **2 veces por médico**.
- Al reprogramar: el crédito del pago original se aplica al nuevo turno.
- **Mercado Pago no se toca** — el crédito vive internamente en Docto (campo `turno_origen_id`).
- Si el médico subió el precio entre la reserva original y la reprogramación: **el paciente no paga la diferencia**. El médico absorbe la diferencia. Canceló él, es su responsabilidad.
- Al reprogramar se genera un nuevo turno con `turno_origen_id` apuntando al turno original cancelado.

### 3.2 Lista de espera

- Si un turno se libera por cancelación, el slot vuelve al pool disponible para cualquier paciente.
- (Lista de espera activa: pendiente de implementar como feature futuro.)

---

## 4. EXCEPCIONES Y AUSENCIAS

### 4.1 Médico no se conecta (no-show)

| Situación | Qué pasa |
|---|---|
| Médico no está en app a los 10 min del turno | Sistema ofrece al paciente: reprogramar o 100% reembolso |
| Médico conectado pero atendiendo otro paciente | Se informa al paciente a los 15 min, se ofrece esperar o reembolso. Repite cada 15 min. |
| Médico no se conecta nunca | 100% reembolso automático |

### 4.2 Paciente no se conecta (no-show)

- A los 15 minutos de la hora del turno: estado → `ausente_paciente`
- No se reintegra nada.
- El sistema expira el turno automáticamente, sin intervención del médico.
- El paciente recibe notificación informando que el médico estuvo esperando y el turno se registró como ausente.

### 4.3 Caída de videollamada durante la consulta

- Ambos deben reconectar manualmente.
- Si no reconectan en 5 minutos: el paciente decide si la consulta se llevó a cabo o no.
  - *"Sí, la consulta se realizó"* → estado = `completado`, ir a documentos.
  - *"No, no pudimos conectarnos"* → opciones de reprogramación en el mismo día si hay slots.

---

## 5. MERCADO PAGO — ARQUITECTURA (pendiente de implementar)

### 5.1 Arquitectura objetivo: Marketplace con Split de pagos

- Cada médico conecta su cuenta de MP via **OAuth** (botón en su perfil de Docto).
- Al pagar, MP divide automáticamente:
  - Parte del médico → va directo a la cuenta MP del médico.
  - Comisión de Docto → va a la cuenta MP de Docto.
- Docto **nunca toca** la plata del médico.
- La integración usa el parámetro `application_fee` en la API de MP.
- Las credenciales OAuth son válidas por 6 meses y deben renovarse.

### 5.2 Quién absorbe el fee de MP en cancelaciones

| Quién cancela | Fee de MP | Comisión Docto |
|---|---|---|
| Médico cancela (en tiempo) | Médico absorbe | Docto no cobra |
| Paciente cancela (en tiempo, >48hs) | Paciente absorbe | Docto no cobra |
| Paciente cancela tarde (<48hs) | Paciente absorbe | Docto cobra igual |
| Reprogramación (cualquiera) | Nadie paga fee nuevo | Docto no cobra de nuevo |

**En reprogramaciones:** el crédito vive en Docto, no se toca MP. Cero costo adicional.

### 5.3 Captura diferida (para turnos en menos de 7 días)

- Para turnos dentro de los próximos 7 días: usar captura diferida de MP.
- El pago se autoriza al reservar pero se captura (acredita) al finalizar la consulta.
- Garantiza que la plata está disponible si hay cancelación antes de la consulta.
- Límite técnico de MP: la captura debe realizarse dentro de los 7 días de la autorización.

### 5.4 Médico sin saldo para reembolso

- Si el médico cancela y no tiene saldo en su cuenta MP: reembolso parcial posible.
- MP devuelve proporcionalmente desde cada cuenta (médico + Docto).
- Si la cuenta del médico no tiene saldo: Docto cubre su parte y decide cómo recuperar del médico.
- **Política de beta:** manejar manualmente hasta tener volumen real.

### 5.5 Diagnóstico actual de MP (pendiente respuesta de Marcos)

Marcos debe reportar:
1. ¿Los pagos van a una sola cuenta MP (la de Docto) o hay OAuth por médico?
2. ¿Dónde está el código de pago? (archivo/s)
3. ¿Se usa Checkout Pro, Checkout API o Bricks?
4. ¿Existe lógica de captura diferida o es cobro inmediato siempre?
5. ¿El `payment_id` del turno se guarda en la DB? ¿En qué tabla y columna?

---

## 6. AGENDA — TOPE DE 45 DÍAS

### Regla inamovible

**Ningún turno puede reservarse a más de 45 días de la fecha actual.**

El sistema no permite crear ni mostrar disponibilidad más allá de ese horizonte.

**Implementación:**
- El cron generador de slots (3AM Argentina, Vercel) nunca genera slots con fecha mayor a `hoy + 45 días`.
- Si el médico intenta habilitar manualmente un slot más allá de 45 días: el sistema rechaza con mensaje *"Solo podés habilitar turnos dentro de los próximos 45 días."*
- El calendario del paciente directamente no muestra fechas más allá de 45 días.

**Justificación:** Reduce riesgo de cancelaciones, fuerza al médico a mantener la agenda actualizada, y es suficiente para que cualquier paciente planifique una consulta programada.

---

## 7. SERVICIO DE EMAIL — Resend

### Decisión: Resend

- **Plan gratuito:** 3.000 emails/mes (sin límite diario en pago, 100/día en free).
- **Plan Pro:** $20/mes → 50.000 emails.
- SDK oficial para Next.js. Templates con React Email (mismo stack que Docto).
- **Proyección:** Con 1.000 turnos/mes → aprox. 5.000 emails → gratis.
- Configurar dominio: `no-reply@docto.com.ar` con SPF + DKIM.

### Alternativas evaluadas y descartadas

| Servicio | Por qué no |
|---|---|
| Brevo | Límite de 300/día en free (problema en picos). Menos nativo para Next.js. |
| SendGrid | Sin plan gratuito permanente. Más caro a igual volumen. |
| Amazon SES | Setup técnico complejo. Sin dashboard visual. Para fases posteriores si escala. |

---

## 8. ESTADOS DE TURNO (referencia completa)

```
disponible          → slot libre en el calendario
reservado_pendiente → paciente reservó, tiene 5 min para pagar
confirmado          → pagó, esperando el día del turno
en_espera           → paciente entró a la sala de espera
en_curso            → videollamada activa
completado          → turno terminado ✅
ausente_paciente    → 15 min en espera sin que el paciente entre
ausente_medico      → médico no se conectó
cancelado_paciente  → paciente canceló
cancelado_medico    → médico canceló
reprogramado        → (trazabilidad — el nuevo turno tiene turno_origen_id)
bloqueado           → slot bloqueado por el médico
```

---

## 9. REGLAS TÉCNICAS INAMOVIBLES

1. **Supabase Realtime nunca** — Todo con polling de 5 segundos vía API routes internas con `credentials: 'include'`.
2. **iframe Daily.co nunca se desmonta** — Usar CSS hiding para evitar reconexiones WebRTC.
3. **RLS es la primera línea de defensa** — paciente A nunca ve datos de paciente B.
4. **Ningún email contiene datos clínicos** — Solo información logística.
5. **El médico no recibe emails** — Todo por mensajería interna.
6. **Turnos cancelados siempre visibles** — Nunca se eliminan del historial.
7. **Tope de agenda: 45 días** — El sistema no permite slots más allá de ese horizonte.
8. **Reprogramación no toca MP** — El crédito vive en Docto internamente.
9. **Nova y el botón son la misma acción** — Un solo punto de verdad: `cancelarTurnoMedico()`.
10. **Siempre Vercel preview antes de mergear a main** — Roberto audita, Sofía valida, luego merge.

---

## 10. VERIFICACIÓN DE IDENTIDAD DEL MÉDICO (Didit + RENAPER)

### Contexto y decisión (02/06/2026)
DNI, CUIT y matrícula están en cualquier receta → alguien podría registrarse
suplantando a un médico real. Para cerrarlo, Docto valida la identidad del médico
**una sola vez, en el registro**, con Didit (escaneo de DNI + selfie + prueba de
vida + cruce contra RENAPER), y cruza el DNI verificado contra la matrícula en
REFEPS. El médico completa el registro **100% al inicio**; reducimos su carga
auto-completando datos de fuentes oficiales, no salteando la validación.

### Crear agenda sí, publicar no — hasta estar validado
El médico **puede armar su agenda mientras se registra y validamos sus datos**,
pero **eso NO la publica**. Un médico no validado **no aparece para ningún
paciente por ninguna puerta** (consulta inmediata, turno programado, clínica
virtual, consultorio particular son solo canales de entrada — el servicio es el
mismo). Los controles de "habilitar/ponerse disponible" quedan cerrados hasta
tener todos los datos validados.

- **Chokepoint:** el mismo filtro de visibilidad que ya exige `verificado +
  estado_registro = aprobado` (en `/clinica`, `/dr/[slug]`, `/consultorio`) suma
  `identidad_validada`. Si no está validado, desaparece de todas las puertas a la
  vez. El toggle de "Disponible" queda bloqueado hasta perfil completo + validado.
- **Backstop:** chequeo server-side en las acciones de reserva (para links directos).
- **Rollout controlado:** todo detrás del feature flag `identidad_gate_activa`
  (apagado por default) para no bloquear a los médicos existentes antes de tiempo.

### Datos congelados una vez validado (candado)
Validada la identidad, **matrícula, DNI, tipo y provincia de matrícula quedan
congelados**: no se editan más, ni desde la app ni con un UPDATE directo a la DB.
El candado vive en la base de datos (trigger `reverificar_medico`), no en el
endpoint, así no hay puerta de servicio para saltearlo. Cierra el TOCTOU (validar
con la matrícula propia y luego cambiarla por la de otro). Migración:
`20260602_candado_matricula_identidad.sql`.

### Pendiente para antes del registro PÚBLICO
Los gates app-level (con flag) frenan la operación accidental, pero un médico
malicioso podría saltearlos con llamadas directas a PostgREST. El blindaje a
nivel RLS/DB (que no se puede poner detrás de un flag) se implementa **antes de
abrir el registro a médicos desconocidos** — no es necesario para la prueba
controlada con médicos reales de confianza.

---

## 11. CLÍNICA VIRTUAL — Grilla de especialidades y orden de médicos

> Decidido por Diego (03/06/2026), debatido con Cortana + Sofía. Decisión cerrada.

### 11.1 Card de especialidad = router honesto, NO ficha de producto
La card de especialidad comunica **disponibilidad**, no precio.

- **NUNCA muestra precio ni duración** (ni "desde $X"). Esos datos son **por-médico** y viven solo dentro de la ficha del médico (el modal). Mostrar el precio de un médico puntual en la card de especialidad confunde (sensación de bait-and-switch: el paciente ancla en un precio que después cambia).
- **Consulta Inmediata:** muestra **"N médicos disponibles"** (informativo). Si N = 0 → botón "Consulta ahora" **grisado/deshabilitado**.
- **Turnos programados:** muestra disponibilidad **SÍ/NO** (sin cantidad). Si no hay → botón "Agendar turno" **grisado** ("Sin turnos disponibles, consultá ahora").
- El estado de la card refleja el **mejor** caso disponible (si hay al menos un médico sin espera, la especialidad está "Disponible ahora").

### 11.2 Orden de los médicos (dentro del modal/lista) — es el algoritmo de distribución
**Consulta Inmediata:**
1. **Primario: menor demora** (menos pacientes en sala de espera primero). Sirve la promesa de CI: atención YA.
2. **Desempate (todos iguales, ej. todos en 0): el que se habilitó antes** (FIFO de disponibilidad — el que hace más rato está online esperando un paciente va primero). Justicia entre médicos + incentivo a estar disponible. **NO** se usa orden aleatorio.

**Turnos programados:**
1. **Primero los médicos con el turno libre más cercano** (fecha/hora disponible más próxima). Es lo que el paciente busca en turnos: el más pronto.

### 11.3 Qué se muestra por médico
- **Consulta Inmediata:** cantidad de pacientes **en sala de espera** (incluyendo al que está siendo atendido), con **color semáforo** (verde sin espera / amarillo pocos / naranja muchos). Es un **conteo factual** (un hecho), **NO** un tiempo estimado en minutos (la estimación es optimista y erosiona confianza si la consulta se estira).
- **Turnos programados:** el **próximo turno disponible** (fecha).
- En ambos: nombre + foto + precio + duración viven en la **ficha del médico**, nunca en la card de especialidad.

### 11.4 Nota técnica (pendiente de migración)
El desempate de CI ("el que se habilitó antes") requiere registrar **cuándo** cada médico activó su disponibilidad. Hoy `medicos.disponible` es booleano sin timestamp → se necesita un campo tipo `disponible_desde_at` (momento en que prendió la disponibilidad). Cambio de DB chico.

---

## 12. AYUDA IN-APP — Manual ilustrado de Nova (EXPLORADO Y DESCARTADO)

> **Estado: DESCARTADO por Diego (04/06/2026), el mismo día que se exploró.**
> Se construyó un piloto completo ("Armar un turno": motor de cuentitos, capa
> conversacional, fotos reales señaladas, voz natural, y la oferta "te lo armo yo").
> Diego lo probó y decidió bajarlo: la experiencia no terminó de cerrar como algo
> simple y fluido, y materializarla bien (sobre todo el auto-avance sin atropellar
> al médico de 70) no justificaba seguir. **La app quedó sin tutoriales.**
>
> **Lo que SÍ quedó** (no era del tutorial — fueron bugs/UX reales que el piloto
> destapó): el **rediseño del selector de días**, el fix del **doble-toque** en
> "Mi agenda"/"Nueva agenda" (LinkNav, mejora toda la app), el **form de agenda en
> mobile**, y el **CI contra el preview**.
>
> Todo el código del manual y el diseño detallado se eliminaron del repo. El detalle
> de abajo queda solo como registro de lo que se exploró.

### 12.1 La decisión
La ayuda dentro de la app **no son videos ni respuestas de IA generativa**. Es
**Nova** sirviendo **cuentitos ilustrados curados**: secuencias de pasos con **foto
señalada + texto corto** que el médico recorre a su ritmo. Contenido **estático/
curado** (archivo TS versionado, no DB, no LLM) → **cero alucinación** (crítico en
salud), **cero costo de tokens**, fácil de mantener.

- **Los videos** quedan solo para **adquisición** (landing /medicos, redes), NO
  para enseñar a usar el producto in-app.
- **Nova es el canal**, pero **ejecuta el manual estático — no lo crea.** Para el
  médico es "Nova con toda su IA"; la línea estático/generativo la ve solo el equipo.

### 12.2 Decisiones de diseño cerradas
- **Señalador quemado en la foto** (no runtime), siempre **azul #378ADD**, nunca verde.
- **Fotos en `public/nova/manual/{id}/{n}.webp`** (repo, versionadas, CDN, sin Storage).
- **100% client-side:** el avance es `setState`, reusa el mecanismo `opciones` del
  chat. NUNCA toca `/api/nova/chat` para servir el cuentito.
- **Capa conversacional — el médico nunca queda atrapado:** botones "↺ Repetir" y
  "No me quedó claro" (versión ampliada curada), control de velocidad de voz (TTS),
  y la cajita de texto sigue abierta → pedidos comunes los toma un **matcher local**;
  cualquier otra cosa cae a la **Nova IA real**.
- **Puntos de entrada:** (A) link "¿Cómo funciona?" contextual por sección (deep link),
  (B) Nova ofrece el cuentito ante la pregunta, (C) grilla en el menú. **No** botones "?" flotantes.

### 12.3 Alcance
- **Tier 1 (lanzamiento):** Armar turno · Ponerse disponible CI · Atender consulta ·
  Hacer receta · Recorrer tablero.
- **Piloto:** "Armar un turno" completo (código + 6 fotos señaladas) → validar con un
  médico real → escalar. Lo único no-código: las fotos las generan Diego/Sofía.

---

## 13. RESOLUCIÓN DE CONSULTAS POR PRESENCIA + REJOIN DE LLAMADA (Diego, 06/06/2026)

### 13.1 El problema
Una videollamada se puede cortar (red, batería, alguien cierra sin querer). Sin un
mecanismo claro: (a) no hay forma de retomar, (b) la consulta queda en un limbo, (c)
no se sabe quién faltó ni qué pasa con la plata. Riesgo de "ir tontas y locas".

### 13.2 La decisión — la plataforma resuelve sola, con datos objetivos
**NO se le pregunta al médico "¿consulta realizada SÍ/NO?".** La resolución (y la plata)
la decide la plataforma con señales objetivas, no el FB del médico (le saca el conflicto
de interés / la palanca financiera).

| Señal objetiva | Resolución | Plata |
|---|---|---|
| Paciente **no entró a la sala de espera en 10 min** | Ausente (no-show) | **Retiene el pago** (no se reintegra) |
| Médico **nunca se conectó** | Médico ausente | Reintegro/crédito al paciente · **SIN penalización (por ahora, se trackea)** |
| Los dos entraron, se cortó, **no volvieron en 2 min** | Llamada cortada | **Reprograma**, sin penalización |
| Consulta completa | Normal | Cobro normal (split) |

### 13.3 Los dos relojes (ambos autoritativos del SERVIDOR, nunca del cliente)
- ⏱️ **10 min — tolerancia de inicio.** El paciente debe estar en la sala de espera
  dentro de los 10 min. Si no → no-show. **Aplica claro a TURNOS** (horario fijo). En
  **Consulta Inmediata** el paciente es el que inicia → ya está presente; ahí "ausente"
  = "el médico aceptó y el paciente ya no estaba". Misma lógica, distinto disparador.
- ⏱️ **2 min — ventana de rejoin.** Si una llamada **ya conectada** se corta, hay 2 min
  para volver. Mientras tanto el médico queda bloqueado (la consulta sigue `en_curso`,
  no puede tomar otra). A los 2 min sin reconexión → se resuelve (reprograma / cierre).
  - A los 2 min, al médico se le muestra: **"Finalizar consulta"** (→ recordatorio de
    completar la ficha = el gate "Antes de finalizar" que ya exige Diagnóstico+Evolución)
    o **"Retomar llamada"** (→ vuelve a la sala, se repite el circuito).
  - Al cortarse, **ambos** ven "Retomar llamada"; "Finalizar" real es del médico.

### 13.4 Qué sacamos y qué sumamos
- **Sacamos:** el checkout "Consulta realizada SÍ/NO" del médico. No hace falta — la
  plata la deciden los datos. (El SÍ/NO solo tendría sentido como confirmación clínica
  de casos que la plataforma no ve; se descartó por fricción innecesaria.)
- **Sumamos:** ítem **"Ayuda"** en el menú hamburguesa del perfil, con
  `soporte@docto.com.ar` como **única** vía de disputa. (Es independiente del motor de
  resolución → shippeable por separado cuando se quiera.)

### 13.5 Reglas mecánicas (para que no falle)
1. **Comunicación obligatoria.** "Tenés que estar en la sala de espera a horario o el
   turno se toma como ausente y se cobra" → en **T&C + al reservar + en el recordatorio
   + en la sala de espera**. Sin esto, las quejas son válidas; con esto, no. (Diego.)
2. **Médico ausente: sin penalización por ahora, pero SE TRACKEA** (queda el histórico
   para activar penalización en el futuro si se decide).
3. **Confiar y medir:** trackear patrones (un médico con muchos "ausentes/cortes" es señal).

### 13.6 Realidad de datos (verificada en prod 06/06/2026)
- ✅ **"Paciente entró a la sala de espera"** → lo tenemos: tabla `sala_espera_entradas`
  (`entrada_en` / `salida_en`). Paciente pagó + sin entrada = no-show.
- ⚠️ **"Quién se conectó al video"** → hoy NO se registra: el webhook de LiveKit solo
  escucha `room_finished`. **Falta sumar `participant_joined` / `participant_left`** al
  webhook para presencia a nivel video (y para detectar al médico ausente).
- ⚠️ **`/api/livekit/token`** no chequea estado → hay que **gatear el rejoin a `en_curso`**
  (y endurecer el endpoint para rechazar token si la consulta está `completada`/`cancelada`).
- Falta un **estado terminal nuevo** para "reprogramar/interrumpida" (hoy solo hay
  `completada`/`cancelada` en datos).

### 13.7 Legal (pendiente — Carolina)
Única pieza legal: **política de no-show** (cobro al paciente ausente) en los T&C +
mostrada al reservar. Estándar y acotada. El "médico ausente" no penaliza → sin carga legal.

### 13.8 Estado
**Decisión cerrada (Diego). Pendiente: diseño técnico (Marcos) + T&C (Carolina) → build
por fases.** Fase 1 = rejoin (técnica, sin plata). Fase 2 = resolución objetiva + 10 min
+ no-show + T&C.

---

*Documento generado el 15/04/2026. No requiere rediscusión — decisiones cerradas.*
*(§12 agregada 04/06/2026 · §13 agregada 06/06/2026.)*
