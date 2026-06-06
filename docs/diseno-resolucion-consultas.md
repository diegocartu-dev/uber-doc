# Diseño técnico — Resolución de consultas por presencia + rejoin de llamada

> **Autor:** Marcos (Eng) · **Fecha:** 2026-06-06
> **Fuente de verdad de producto:** `DECISIONES_PRODUCTO_DOCTO.md` §13 (decisión cerrada por Diego).
> **Estado:** Blueprint. NO implementado. Diseño para build por fases.
> **Regla de oro:** no romper el cierre cálido del paciente (#169) basado en `DisconnectReason.ROOM_DELETED`.

---

## 0. Resumen ejecutivo

Construimos dos relojes **autoritativos del servidor** sobre la maquinaria que ya existe:

1. **Rejoin (2 min):** cuando una llamada **ya conectada** se corta por algo que NO es el médico finalizando, ambos lados ven "Se cortó la llamada / Retomar / Finalizar". Mientras dure la ventana, la consulta sigue `en_curso` y el médico queda bloqueado de tomar otra. A los 2 min sin reconexión, un cron resuelve.
2. **Tolerancia de inicio (10 min):** el paciente debe presentarse. Disparador distinto para Turnos (horario fijo) vs CI (el paciente inicia). Si no se presenta → no-show, retención del pago.

El motor de resolución decide con **señales objetivas** (no con FB del médico): `sala_espera_entradas` (¿el paciente se presentó?) + presencia de video (¿quién se conectó al room?). Mapea cada resolución a la maquinaria de plata existente (`ejecutarRefund` de `src/lib/cancelaciones.ts`, split de `crear-v2`, `refunds_pendientes` + cron de reintento).

**Pieza nueva de datos clave:** el webhook de LiveKit hoy solo escucha `room_finished`. Hay que sumar `participant_joined` / `participant_left` y persistir presencia de video (tabla nueva `video_presencia`). Sin esto no se puede distinguir "médico ausente" de "paciente ausente".

**Separación por fases (innegociable):**
- **Fase 1 — Rejoin.** Pura UX + timer de servidor. SIN plata, SIN T&C, SIN cambios de split. Shippeable sola y sin riesgo legal.
- **Fase 2 — Resolución objetiva.** No-show, 10 min, médico ausente, acciones de plata. Requiere T&C de Carolina (no-show) y el motor de resolución.

---

## 1. Estado del arte verificado (06/06/2026, contra prod)

Hallazgos confirmados leyendo código + DB de producción:

| Pieza | Realidad verificada |
|---|---|
| `consultas.estado` (ENUM `estado_consulta`) | `esperando, aceptada, pagada, en_curso, completada, cancelada`. **No hay estado terminal de no-show/interrupción.** |
| `turnos.estado` (TEXT, sin CHECK rígido en uso) | en uso: `disponible, bloqueado, completado, reservado_pendiente`; el código además usa `confirmado, en_espera, cancelado_paciente, cancelado_medico, en_curso`. |
| Transición a `en_curso` (CI) | La hace el **webhook de pago** (`/api/pago/webhook`, pago aprobado → `estado: en_curso` + `en_curso_at`). NO es el médico. La consulta CI nunca pasa por `pagada` en el happy path: salta a `en_curso`. |
| Transición a `en_curso` (turno) | La hace `/api/livekit/crear-sala` cuando el médico abre la sala. |
| `consultas` / `turnos` tienen | `en_curso_at`, `completada_at` (consultas), `reintegro_estado` (TEXT), `mp_payment_created_at`. **NO existe** `desconectado_at` ni columnas de presencia. |
| `sala_espera_entradas` | `id, paciente_id, medico_id, tipo ('ci'|'turno_programado'|'consultorio_particular'), consulta_id, turno_id, entrada_en (NOT NULL), salida_en, motivo_salida, cancelado_admin_id, motivo_admin`. Señal objetiva de "el paciente se presentó". |
| Webhook LiveKit | `src/app/api/livekit/webhook/route.ts` solo procesa `room_finished` → cierra `en_curso` huérfanas a `completada`. Ignora todo lo demás. |
| `/api/livekit/token` | NO chequea estado de la consulta. Re-emite token siempre (con TTL 2h) a paciente o médico autorizado. |
| `/api/livekit/crear-sala` | crea room con `emptyTimeout: 7200, maxParticipants: 2`. DELETE elimina el room (lo usa el médico al finalizar → dispara `ROOM_DELETED` en el paciente). |
| Cierre cálido (#169) | Paciente (`SalaConsultaPaciente.tsx`) distingue `ROOM_DELETED` (→ pantalla de cierre cálida) de cualquier otro motivo (→ `router.push('/mis-consultas')`). Médico (`WorkspaceConsulta.tsx`) en `onDisconnected` solo hace `setIframeVisible(false)`. **Ambos hooks son el punto de extensión de Fase 1.** |
| Maquinaria de plata | `ejecutarRefund(recursoId, medicoId, pagoId, netoMedico, applicationFee, tipo)` en `src/lib/cancelaciones.ts` ya reembolsa con reversión de fee, soporta `consulta` y `turno`, devuelve `reintegro_estado` (`reembolsado` / `fee_pendiente` / `pendiente`), encola en `refunds_pendientes` y hay cron `reintentar-refunds` (diario). Datos necesarios (`pago_id`, `mp_net_amount_medico`, `mp_application_fee`) están persistidos en `consultas`/`turnos` por el webhook de pago. |
| Cron infra | `vercel.json` ya tiene 6 crons. Auth: `Authorization: Bearer ${CRON_SECRET}`. Patrón de referencia: `cron/cerrar-huerfanas` (idempotente, `.eq('estado', X).lt('updated_at', T)`). |
| ¿`en_curso` bloquea al médico hoy? | **NO.** El dashboard del médico (`ConsultasPendientes` / `ConsultasEnCurso`) muestra una lista; `aceptarConsulta` solo exige `estado = 'esperando'`. No hay guard de "una consulta activa a la vez". El bloqueo de §13 es lógica **nueva** a implementar (ver §6.4). |

**Conclusión:** la base de plata y cron está sólida y reutilizable. Lo nuevo es: presencia de video (webhook + tabla), timestamp de desconexión, estados terminales nuevos, UI de rejoin, gate de token, y el motor de resolución.

---

## 2. Máquina de estados

### 2.1 Estados nuevos (terminales)

Agregamos al ENUM `estado_consulta` y al dominio de `turnos.estado`:

- **`no_show_paciente`** — el paciente no se presentó dentro de la tolerancia. Plata: se retiene (no se reembolsa). Terminal.
- **`medico_ausente`** — el médico nunca se conectó al video. Plata: reintegro/crédito al paciente, sin penalización al médico (se trackea). Terminal.
- **`interrumpida`** — los dos estuvieron, se cortó, no volvieron en 2 min. Plata: reprograma/crédito, sin penalización. Terminal.

> **Decisión de naming:** uso 3 estados terminales explícitos en vez de un único `cerrada` + razón en columna aparte. Razón: las pantallas del paciente (`SalaConsultaPaciente.tsx`) y los listados ya hacen branching por `estado`; estados explícitos son auto-documentados y permiten filtrar/analizar sin joins. La "razón" objetiva detallada igual queda en `resolucion_motivo` (auditoría).

> **`reprogramada` (turnos):** para turnos `interrumpida`/`medico_ausente`, el camino preferido de producto es reprogramar. Pero la reprogramación es **acción del paciente** (elige nuevo slot), no automática. Por eso el estado terminal es `interrumpida`/`medico_ausente` + se habilita el flujo de reprogramación existente (`reprogramar_turno_atomico`) o crédito. No se inventa un estado `reprogramada` automático en Fase 2 inicial.

### 2.2 Diagrama (consulta CI)

```
esperando ──(médico acepta)──> aceptada ──(pago aprobado, webhook)──> en_curso
                                                                          │
                  ┌───────────────────────────────────────────────────────┤
                  │                                                         │
       (médico finaliza: ROOM_DELETED)                          (corte de red: != ROOM_DELETED
                  │                                              y consulta sigue en_curso)
                  ▼                                                         ▼
             completada                                          [ VENTANA REJOIN 2min ]
                                                          desconectado_at = now()  (server)
                                                                          │
                          ┌───────────────────────────────┬──────────────┘
                          │ (alguno reconecta < 2min)      │ (nadie reconecta >= 2min, cron)
                          ▼                                 ▼
                    vuelve a en_curso              resolución por presencia:
                  (desconectado_at = null)          - ¿médico nunca se conectó? → medico_ausente
                                                     - ¿ambos estuvieron?       → interrumpida
                                                     - ¿paciente nunca llegó?   → no_show_paciente
```

### 2.3 Reloj de inicio (10 min) — fuera de la sesión de video

```
TURNO confirmado, hora_inicio H:
   en H+10min: ¿hay entrada en sala_espera_entradas para este paciente/turno?
       NO  → no_show_paciente (retiene pago)
       SÍ, pero médico nunca abrió sala (sin en_curso_at) → medico_ausente (reintegro)

CI: el paciente inicia → ya está presente por definición. El reloj de 10 min
    aplica al MÉDICO: consulta `aceptada` cuyo pago se aprobó (en_curso) pero el
    médico no se conectó al video en 10 min → medico_ausente.
    Caso espejo de §13: "el médico aceptó y el paciente ya no estaba" → si el
    paciente cerró sala_espera (salida_en con motivo distinto de atendido) antes
    de que el médico entre → no_show_paciente.
```

---

## 3. Cambios de modelo de datos (DDL tentativo)

> Migraciones SQL: se aplican vía Supabase Management API (ver CLAUDE.md). El SQL completo va al final de este doc para que Diego lo apruebe. Una migración por entrega de fase.

### 3.1 Fase 1 — timestamp de desconexión + presencia de video

```sql
-- Reloj de rejoin: marca de cuándo se detectó la caída (server-authoritative).
-- NULL = no hay corte pendiente. Se setea al detectar participant_left sin
-- room_finished; se limpia al reconectar o al resolver.
ALTER TABLE consultas ADD COLUMN IF NOT EXISTS desconectado_at TIMESTAMPTZ;
ALTER TABLE turnos     ADD COLUMN IF NOT EXISTS desconectado_at TIMESTAMPTZ;

-- Presencia de video: append-only, una fila por evento del webhook LiveKit.
-- Fuente de verdad objetiva de "quién se conectó al room y cuándo".
CREATE TABLE video_presencia (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_name    TEXT NOT NULL,                 -- "consulta-<id>" | "turno-<id>"
  tipo         TEXT NOT NULL CHECK (tipo IN ('consulta','turno')),
  recurso_id   UUID NOT NULL,                 -- consulta_id | turno_id
  rol          TEXT NOT NULL CHECK (rol IN ('medico','paciente','desconocido')),
  identity     TEXT NOT NULL,                 -- identity LiveKit ("medico-<id>" / "paciente-<uid>")
  evento       TEXT NOT NULL CHECK (evento IN ('joined','left')),
  ocurrido_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw          JSONB                          -- payload crudo para auditoría
);
CREATE INDEX idx_video_presencia_recurso ON video_presencia (tipo, recurso_id, ocurrido_at);
```

> **Por qué tabla nueva y no columnas:** un par de columnas (`medico_conectado_at`, `paciente_conectado_at`) sería más barato, pero pierde reconexiones múltiples y no sirve para el patrón "médico con muchos cortes" que §13.5.3 pide trackear. La tabla append-only es la mínima estructura que responde "¿quién se presentó al video?" de forma auditable y soporta múltiples joins/leaves por sesión. Es la señal objetiva que el motor de resolución (Fase 2) necesita. La derivo del `rol` parseando el `identity` (`medico-` / `paciente-`), que ya es la convención en `token/route.ts` y `crear-sala/route.ts`.

### 3.2 Fase 2 — estados terminales + auditoría de resolución

```sql
-- Estados terminales nuevos (consultas: ENUM)
ALTER TYPE estado_consulta ADD VALUE IF NOT EXISTS 'no_show_paciente';
ALTER TYPE estado_consulta ADD VALUE IF NOT EXISTS 'medico_ausente';
ALTER TYPE estado_consulta ADD VALUE IF NOT EXISTS 'interrumpida';
-- NOTA: ADD VALUE a un ENUM no puede correr dentro de una transacción con uso
-- inmediato del valor en la misma TX. Aplicar en migración aislada, antes de
-- desplegar el código que los usa.

-- turnos.estado es TEXT (sin CHECK rígido): los valores nuevos no requieren DDL
-- de tipo, solo documentar en el dominio. Si existe un CHECK, ampliarlo.

-- Auditoría de la resolución automática (por qué la plataforma decidió X).
ALTER TABLE consultas
  ADD COLUMN IF NOT EXISTS resolucion_motivo TEXT,        -- 'no_show_paciente'|'medico_ausente'|'interrumpida'|'completada'
  ADD COLUMN IF NOT EXISTS resuelta_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resuelta_por TEXT;             -- 'cron_inicio'|'cron_rejoin'|'webhook'|'medico'
ALTER TABLE turnos
  ADD COLUMN IF NOT EXISTS resolucion_motivo TEXT,
  ADD COLUMN IF NOT EXISTS resuelta_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resuelta_por TEXT;

-- Tracking de ausencias del médico (sin penalización HOY, histórico para el futuro).
CREATE TABLE ausencias_medico (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id   UUID NOT NULL REFERENCES medicos(id),
  tipo        TEXT NOT NULL CHECK (tipo IN ('consulta','turno')),
  recurso_id  UUID NOT NULL,
  motivo      TEXT NOT NULL CHECK (motivo IN ('medico_ausente','interrumpida_sin_retomar')),
  detectado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ausencias_medico ON ausencias_medico (medico_id, detectado_at);
```

> **`reintegro_estado` se reutiliza tal cual.** `ejecutarRefund` ya lo setea. Para `medico_ausente`/`interrumpida` el reembolso pasa por la misma función. No se inventa columna de plata nueva.

---

## 4. Webhook LiveKit — enhancement (Fase 1)

`src/app/api/livekit/webhook/route.ts` hoy hace `if (event.event !== "room_finished") return ignored`. Lo reescribimos a un dispatcher:

```
switch (event.event):
  case "room_finished":      → comportamiento actual (cerrar en_curso → completada)  [NO TOCAR la semántica]
  case "participant_joined": → INSERT video_presencia(evento='joined', rol=parseRol(identity), ...)
                               + si desconectado_at != null en el recurso → es una RECONEXIÓN
                                 → limpiar desconectado_at (vuelve a en_curso "estable")
  case "participant_left":   → INSERT video_presencia(evento='left', ...)
                               + recalcular: ¿quedó algún participante en el room?
                                 Para saberlo NO confiamos en el cliente: consultamos
                                 RoomServiceClient.listParticipants(roomName) (server→LiveKit).
                                 Si el room quedó con < participantes esperados Y la consulta
                                 sigue en_curso Y NO fue room_finished (médico finalizó):
                                    → setear desconectado_at = now()  (arranca reloj de 2min)
```

Notas de robustez:
- **Idempotencia:** `video_presencia` es append-only; reprocesar el mismo evento agrega una fila duplicada inocua (auditoría), o se dedupe por `(room_name, identity, evento, ocurrido_at)` si LiveKit reintenta. El cálculo de `desconectado_at` es idempotente: setear a `now()` solo si ya no está seteado (`desconectado_at IS NULL`) evita pisar el reloj con reintentos.
- **`participant_left` por finalización del médico:** cuando el médico finaliza, `crear-sala DELETE` borra el room → LiveKit emite `participant_left` (de ambos) **y** `room_finished`. Orden no garantizado. Para no arrancar el reloj de rejoin en una finalización legítima, el handler de `participant_left` **debe** verificar que el recurso siga `en_curso` y que no exista un `room_finished` reciente / que el room siga existiendo (`listParticipants` tira error si el room ya no existe → es finalización, no corte). **Esto protege #169.**
- **`parseRol(identity)`:** `medico-*` → `medico`, `paciente-*` → `paciente`, else `desconocido`. Convención ya establecida en token/crear-sala.
- **Registrar el webhook en LiveKit:** hoy el endpoint existe pero hay que confirmar que el proyecto LiveKit tiene configurado el webhook hacia `/api/livekit/webhook` para estos eventos (room_finished ya llega; joined/left dependen de la config del proyecto). Pre-build: verificar en el dashboard de LiveKit.

---

## 5. Gate de estado en el token (Fase 1, barato y de seguridad)

`/api/livekit/token` hoy re-emite token a cualquier participante autorizado sin mirar `estado`. Cambio:

```
tras obtener `consulta.estado`:
  estadosTerminales = ['completada','cancelada','no_show_paciente','medico_ausente','interrumpida']
  if (estado ∈ estadosTerminales)  → 409 { error: "Esta consulta ya finalizó." }
  // en_curso (incluye ventana de rejoin) y pagada → permitido
```

- **Por qué en el token y no solo en el cron:** evita que un cliente trabado o un reintento manual reconecte a una sala de una consulta ya resuelta (re-abriría video sobre algo cerrado, confundiría el motor de presencia). Es defensa en profundidad + barato.
- **Compatibilidad con rejoin:** durante la ventana de 2 min la consulta sigue `en_curso`, así que el token se emite normal → la reconexión funciona. El gate solo bloquea estados ya terminales.
- **No rompe #169:** el cierre del médico setea `completada` *después* del redirect; si el paciente pide token en esa carrera, recibir 409 es correcto (la consulta ya cerró) y su pantalla de cierre cálida ya está activa por `ROOM_DELETED`.

---

## 6. Fase 1 — Rejoin (sin plata, sin T&C)

### 6.1 Detección (cliente) sin que el cliente cronometre

El cliente NO decide cuándo expira (eso es del servidor). El cliente solo **detecta el corte** y **muestra la UI de rejoin**; el reloj de verdad vive en `desconectado_at` (servidor) + cron.

**Paciente — `SalaConsultaPaciente.tsx` `handleDisconnected`:**

```
ROOM_DELETED                          → cerrando = true   (#169, SIN CAMBIOS)
estadoCompletado vía Realtime/polling → pantalla cierre   (SIN CAMBIOS)
otro motivo (red, etc.) Y estado==en_curso → NUEVO: mostrar pantalla "Se cortó la llamada"
       en vez del actual router.push('/mis-consultas')
```

> **Cuidado crítico con #169:** hoy el `else` de `handleDisconnected` hace `router.push('/mis-consultas')`. Ese push es el comportamiento que NO debemos romper para `ROOM_DELETED` (ya está protegido por el `if`). El cambio de Fase 1 es: para "otro motivo" con `estado === 'en_curso'`, en vez de redirigir, mostrar la pantalla de rejoin. Si tras el corte el estado pasa a un terminal (lo trae Realtime/polling, que NO tocamos), la pantalla converge a cierre/cancelación como hoy.

**Médico — `WorkspaceConsulta.tsx` `onDisconnected`:** hoy solo `setIframeVisible(false)`. NUEVO: si el corte no fue una finalización iniciada por él (flag local `finalizandoRef`), mostrar overlay "Se cortó la llamada / Retomar / Finalizar".

### 6.2 UI de rejoin (ambos lados)

Pantalla/overlay React inline (zIndex alto, NO `window.confirm`):

- Título: **"Se cortó la llamada"**.
- Subtítulo paciente: "Estamos intentando reconectarte con tu médico." / médico: "Se perdió la conexión con el paciente."
- **Ambos** ven botón **"Retomar llamada"** (primario azul `#378ADD`).
- **Solo el médico** ve **"Finalizar consulta"** (que pasa por el gate "Antes de finalizar" existente: exige Diagnóstico + Evolución → reusa `intentarFinalizar()`).
- Indicador de tiempo restante: **derivado del servidor**, no cronometrado localmente. El cliente hace polling a `/api/consulta-estado` (o un nuevo `/api/consulta/rejoin-estado`) que devuelve `desconectado_at`; el cliente calcula `2min - (now - desconectado_at)` solo para mostrar, pero la expiración real la decide el cron. Si el polling devuelve un estado terminal (`interrumpida`/`medico_ausente`), la pantalla transiciona a cierre.

### 6.3 Mecánica de "Retomar"

```
1. POST /api/livekit/token  (ya existe; tras el gate de §5)
   → token nuevo (el viejo puede seguir válido 2h, pero pedimos fresco por prolijidad)
2. Reconectar <LiveKitRoom> con el token nuevo (re-render con connect={true})
3. participant_joined llega al webhook → limpia desconectado_at (reconexión estable)
4. Ambos vuelven al video. Circuito normal.
```

No hace falta recrear la sala: `emptyTimeout: 7200` mantiene el room vivo 2h aunque quede vacío, así que durante los 2 min de rejoin el room existe. (El `emptyTimeout` largo NO sustituye al reloj de 2min: son cosas distintas — uno mantiene el room en LiveKit, el otro es la regla de negocio de Docto.)

### 6.4 Expiración server-authoritative + bloqueo del médico

**Cron `rejoin-expirar` (cada 1 min):**

```
seleccionar consultas/turnos con:
   estado = 'en_curso'  AND  desconectado_at < now() - interval '2 minutes'
para cada uno:
   verificar presencia objetiva en video_presencia (Fase 2 decide medico_ausente vs interrumpida;
   en Fase 1, sin estados de plata, simplemente cerramos a 'completada' como hoy hace cerrar-huerfanas
   — Fase 1 NO introduce no_show/medico_ausente).
```

> **Fase 1 deliberadamente NO resuelve plata.** En Fase 1, la expiración del rejoin reusa la semántica actual de `cerrar-huerfanas` (→ `completada`), solo que con un reloj de 2 min en vez de 10. El valor de Fase 1 es la UX de retomar y el bloqueo del médico. Los estados terminales nuevos y la plata son Fase 2.

**Bloqueo del médico durante la ventana (lógica nueva — hoy NO existe):**
- §13 dice "el médico queda bloqueado, no puede tomar otra". Hoy `aceptarConsulta` no valida concurrencia.
- Implementación mínima: en `aceptarConsulta` (server action) y en `crear-sala`, antes de aceptar/abrir otra, chequear que el médico no tenga una consulta `en_curso` con `desconectado_at != null` (corte pendiente). Si la tiene → bloquear con mensaje "Tenés una consulta esperando reconexión".
- Esto se apoya en `desconectado_at` (Fase 1) → el bloqueo es Fase 1, no requiere los estados de Fase 2.

### 6.5 Tickets Fase 1

| # | Ticket | Archivos | Gate |
|---|---|---|---|
| F1-1 | Migración: `desconectado_at` + tabla `video_presencia` | SQL (Management API) | Diego (OK SQL) |
| F1-2 | Webhook LiveKit: dispatcher + `participant_joined/left` + set/clear `desconectado_at` (proteger #169 con `listParticipants`/`room_finished` check) | `src/app/api/livekit/webhook/route.ts` | Roberto |
| F1-3 | Gate de estado en token (rechazar terminales) | `src/app/api/livekit/token/route.ts` | Roberto |
| F1-4 | UI rejoin paciente (no romper rama `ROOM_DELETED` de #169) | `src/app/consulta/[id]/sala/SalaConsultaPaciente.tsx` | Sofía + Roberto |
| F1-5 | UI rejoin médico (overlay Retomar/Finalizar, reusar `intentarFinalizar`) | `src/app/medico/consulta/[id]/workspace/WorkspaceConsulta.tsx` | Sofía + Roberto |
| F1-6 | Endpoint estado de rejoin (devuelve `desconectado_at`) | `src/app/api/consulta-estado/route.ts` (+ turno) o nuevo | — |
| F1-7 | Cron `rejoin-expirar` (cada 1min, cierra a completada en F1) + `vercel.json` | `src/app/api/cron/rejoin-expirar/route.ts` | — |
| F1-8 | Bloqueo del médico durante ventana (guard en `aceptarConsulta` + `crear-sala`) | `actions.ts`, `crear-sala/route.ts` | Roberto |

---

## 7. Fase 2 — Resolución objetiva + 10 min + no-show + plata

### 7.1 Motor de resolución (`src/lib/resolucion-consultas.ts` — nuevo)

Función pura testeable: `resolver(recurso, presencia, salaEspera) → { motivo, accionPlata }`.

```
Entradas objetivas:
  - en_curso_at (¿el médico abrió la sala?)            ← consultas/turnos
  - sala_espera_entradas (¿el paciente se presentó?)   ← entrada_en / salida_en / motivo_salida
  - video_presencia (¿quién se conectó al room?)       ← filas joined por rol

Árbol de decisión:
  if paciente nunca tuvo entrada_en (turno) / cerró sala antes (CI):
      → no_show_paciente   | plata: RETENER (no refund)
  elif medico nunca joined en video_presencia (rol=medico):
      → medico_ausente     | plata: REFUND  + ausencias_medico
  elif ambos joined alguna vez pero sesión cortada y no retomada:
      → interrumpida       | plata: REFUND/crédito + (si médico no retomó → ausencias_medico)
  else:
      → completada         | plata: split normal (ya cobrado, no se toca)
```

### 7.2 Acción de plata — mapeo a maquinaria existente

| Resolución | Acción | Cómo |
|---|---|---|
| `completada` | Cobro normal (split ya ocurrido) | No-op. El split lo hizo `crear-v2` al pagar (marketplace_fee). |
| `no_show_paciente` | Retener pago | No-op de plata. Solo `estado = no_show_paciente`. **Requiere T&C (Carolina).** |
| `medico_ausente` | Reintegro/crédito al paciente | `ejecutarRefund(recursoId, medicoId, pago_id, mp_net_amount_medico, mp_application_fee, tipo)` → setea `reintegro_estado`. + INSERT `ausencias_medico`. SIN penalización. |
| `interrumpida` (turno) | Reprogramar o crédito | Habilitar reprogramación (`reprogramar_turno_atomico` existente) o `ejecutarRefund`. SIN penalización. |
| `interrumpida` (CI) | Crédito/reintegro | `ejecutarRefund`. |

> Todo refund pasa por la **misma** función que cancelaciones → reusa reversión de fee, `refunds_pendientes`, cron de reintento y push al médico si falta saldo. Cero plata nueva.

### 7.3 Reloj de 10 min — cron `tolerancia-inicio` (cada 1 min)

```
TURNOS:
  seleccionar turnos estado='confirmado', fecha=hoy,
     (fecha+hora_inicio) < now() - 10min, en_curso_at IS NULL:
     ¿hay sala_espera_entradas (turno_id, sin salida o salida=atendido)?
         NO  → no_show_paciente + retener
         SÍ  → medico_ausente   + ejecutarRefund + ausencias_medico

CI:
  seleccionar consultas estado='en_curso' (pago aprobado), en_curso_at < now()-10min,
     sin join de medico en video_presencia:
        → medico_ausente + ejecutarRefund + ausencias_medico
  (el "paciente ya no estaba" se detecta por salida_en de sala_espera con motivo != atendido
   antes de que el médico entre → no_show_paciente)
```

> El umbral de CI usa `en_curso_at` (cuándo se aprobó el pago / arrancó), no `created_at`. Para turnos usa el horario agendado (`fecha + hora_inicio`), que es el disparador correcto de "horario fijo".

### 7.4 Tickets Fase 2

| # | Ticket | Gate |
|---|---|---|
| F2-1 | Migración: estados terminales (ENUM + turnos), `resolucion_motivo/resuelta_at/resuelta_por`, `ausencias_medico` | Diego (SQL) |
| F2-2 | Motor `resolucion-consultas.ts` (puro + tests unitarios) | Roberto |
| F2-3 | Cron `tolerancia-inicio` (10 min, turnos + CI) + `vercel.json` | Roberto |
| F2-4 | Upgrade cron `rejoin-expirar`: aplicar motor (medico_ausente/interrumpida) en vez de completada | Roberto |
| F2-5 | Pantallas terminales nuevas en paciente/médico (no_show / médico ausente / interrumpida) | Sofía |
| F2-6 | T&C no-show (Carolina) + mostrar al reservar + recordatorio + sala de espera | Carolina + Diego |
| F2-7 | Sacar checkout "Consulta realizada SÍ/NO" del médico (§13.4) — verificar que NO exista ya | Sofía |
| F2-8 | Ítem "Ayuda" → `soporte@docto.com.ar` en menú perfil (independiente, shippeable suelto) | Sofía |

---

## 8. Infra de cron

`vercel.json` ya tiene 6 crons (auth `Bearer CRON_SECRET`). Sumamos:

| Cron | Cadencia | Fase | Idempotencia |
|---|---|---|---|
| `/api/cron/rejoin-expirar` | `* * * * *` (cada 1 min) | F1 | Selecciona por `desconectado_at < now()-2min` y reescribe estado solo si sigue `en_curso`. Reejecutar no re-resuelve (el estado ya cambió). |
| `/api/cron/tolerancia-inicio` | `* * * * *` (cada 1 min) | F2 | Selecciona por umbral temporal + estado de origen; el UPDATE condicionado por `estado` previo + `resuelta_at IS NULL` lo hace at-most-once. Los refunds van por `ejecutarRefund` con `idempotencyPrefix` (MP idempotency key) → reintentos no duplican plata. |

> **Vercel Hobby vs Pro:** crons cada 1 min requieren plan Pro (Hobby limita frecuencia/cantidad). **Pregunta abierta P-5.** Si seguimos en Hobby, cadencia mínima sería cada N min → la ventana real de 2 min se vuelve "2 a 2+N min". Aceptable funcionalmente, hay que documentarlo.
> **Timeout 10s serverless:** los crons procesan en lote; cada refund es una llamada a MP (~1-2s). Si un batch trae muchos casos, paginar/limitar por ejecución (procesar N por tick, el resto el siguiente). Patrón ya usado en `reintentar-refunds`.

---

## 9. Cómo NO romper #169 (checklist de regresión)

1. **Paciente `ROOM_DELETED`** → sigue yendo a la rama `setCerrando(true)` (pantalla cálida). El nuevo código de rejoin vive en el `else` (otro motivo) + `estado === 'en_curso'`. No tocar el `if (reason === ROOM_DELETED)`.
2. **Carrera de finalización:** cuando el médico finaliza, NO debe arrancar el reloj de rejoin. El webhook `participant_left` valida `room_finished`/`listParticipants` antes de setear `desconectado_at`.
3. **Polling/Realtime del paciente** (que trae `completada`) NO se modifica: sigue siendo el respaldo. La pantalla de rejoin converge a cierre si el estado pasa a terminal.
4. **Gate de token (409)** en estados terminales es coherente con #169: si la consulta ya cerró, el paciente ya está en pantalla de cierre; un 409 al reintentar token es correcto, no un error visible.
5. Tests E2E: (a) médico finaliza normal → paciente ve cierre cálido [#169 intacto]; (b) corte de red → ambos ven rejoin → retoman → cierre normal; (c) corte de red → nadie retoma 2min → resolución.

---

## 10. Preguntas abiertas

- **P-1.** ¿LiveKit (proyecto prod) tiene habilitado el envío de `participant_joined`/`participant_left` al webhook? Hay que verificar en el dashboard de LiveKit antes de F1-2 (hoy llega `room_finished`; el resto puede estar deshabilitado por config).
- **P-2.** En CI, "el médico aceptó y el paciente ya no estaba" (§13.3): ¿se considera no-show del paciente con retención de pago, aunque el paciente haya pagado? Producto debe confirmar el caso exacto (el paciente pagó pero abandonó sala_espera antes de que el médico entre).
- **P-3.** `interrumpida` en turno: ¿default a reprogramación (paciente elige slot) o a crédito automático de 45 días? §13 dice "reprograma", pero la reprogramación es acción del paciente. Definir UX con Sofía.
- **P-4.** ¿La ventana de 2 min cuenta desde el `participant_left` del primero que se cae, o desde que el room queda con un solo participante? Propongo: desde que el room queda incompleto (no quedan los 2). Confirmar.
- **P-5.** Plan Vercel: ¿Pro para crons cada 1 min? Si Hobby, definir cadencia y aceptar ventana "2 a 2+N min".
- **P-6.** Médico ausente con receta/documentos ya parcialmente cargados (borrador): ¿se descartan o quedan? Hoy `medico_ausente` implica que no hubo consulta → no debería haber docs, pero el borrador podría existir. Definir.
- **P-7.** ¿El bloqueo del médico (no tomar otra durante rejoin) aplica también a turnos agendados solapados, o solo a CI? Propongo solo a la consulta/turno en curso con corte pendiente.

---

## 11. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Romper #169 (cierre cálido) al tocar `handleDisconnected` | Alto (regresión visible al paciente) | El cambio vive solo en el `else`; tests E2E de los 3 escenarios; gate de token coherente. |
| Webhook arranca reloj de rejoin en una finalización legítima del médico | Alto (consulta correcta queda "interrumpida") | `participant_left` valida `room_finished`/`listParticipants`; `desconectado_at` solo si sigue `en_curso` y el room existe. |
| `ADD VALUE` al ENUM en transacción con uso inmediato | Medio (migración falla) | Migración aislada de los nuevos valores, desplegada **antes** del código que los usa. |
| Cron cada 1 min no disponible en Vercel Hobby | Medio (ventana imprecisa) | P-5; aceptar cadencia mayor documentada. |
| Doble refund por reejecución de cron | Alto (plata) | `ejecutarRefund` usa idempotency key de MP + UPDATE condicionado por estado previo + `resuelta_at IS NULL`. |
| Presencia de video incompleta si LiveKit no manda joined/left | Alto (motor no distingue médico ausente) | P-1; fallback conservador: si no hay datos de presencia, NO penalizar al médico y resolver como `interrumpida` con reintegro (a favor del paciente). |
| `turnos.estado` es TEXT sin CHECK → estados nuevos sin validación | Bajo | Documentar dominio; opcional agregar CHECK en F2. |

---

## 12. SQL completo (para aprobación de Diego)

> Una migración por fase. NO aplicar hasta OK de Diego. Aplicar vía Management API (`POST /v1/projects/irpupskopjahbqqvckue/database/query`).

### Migración Fase 1

```sql
-- F1: reloj de rejoin + presencia de video
ALTER TABLE consultas ADD COLUMN IF NOT EXISTS desconectado_at TIMESTAMPTZ;
ALTER TABLE turnos     ADD COLUMN IF NOT EXISTS desconectado_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS video_presencia (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_name    TEXT NOT NULL,
  tipo         TEXT NOT NULL CHECK (tipo IN ('consulta','turno')),
  recurso_id   UUID NOT NULL,
  rol          TEXT NOT NULL CHECK (rol IN ('medico','paciente','desconocido')),
  identity     TEXT NOT NULL,
  evento       TEXT NOT NULL CHECK (evento IN ('joined','left')),
  ocurrido_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw          JSONB
);
CREATE INDEX IF NOT EXISTS idx_video_presencia_recurso
  ON video_presencia (tipo, recurso_id, ocurrido_at);

-- RLS: solo service role escribe/lee (webhook + crons usan admin client).
ALTER TABLE video_presencia ENABLE ROW LEVEL SECURITY;
-- (sin policies para authenticated → bloqueado por defecto; admin client bypassa RLS)
```

### Migración Fase 2 — Parte A (ENUM, aislada, antes del código)

```sql
ALTER TYPE estado_consulta ADD VALUE IF NOT EXISTS 'no_show_paciente';
ALTER TYPE estado_consulta ADD VALUE IF NOT EXISTS 'medico_ausente';
ALTER TYPE estado_consulta ADD VALUE IF NOT EXISTS 'interrumpida';
```

### Migración Fase 2 — Parte B (columnas + tabla, tras Parte A)

```sql
ALTER TABLE consultas
  ADD COLUMN IF NOT EXISTS resolucion_motivo TEXT,
  ADD COLUMN IF NOT EXISTS resuelta_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resuelta_por TEXT;
ALTER TABLE turnos
  ADD COLUMN IF NOT EXISTS resolucion_motivo TEXT,
  ADD COLUMN IF NOT EXISTS resuelta_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resuelta_por TEXT;

CREATE TABLE IF NOT EXISTS ausencias_medico (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id    UUID NOT NULL REFERENCES medicos(id),
  tipo         TEXT NOT NULL CHECK (tipo IN ('consulta','turno')),
  recurso_id   UUID NOT NULL,
  motivo       TEXT NOT NULL CHECK (motivo IN ('medico_ausente','interrumpida_sin_retomar')),
  detectado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ausencias_medico
  ON ausencias_medico (medico_id, detectado_at);
ALTER TABLE ausencias_medico ENABLE ROW LEVEL SECURITY;
```
