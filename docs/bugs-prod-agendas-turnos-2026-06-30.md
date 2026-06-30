# Bugs de producción — Agendas / Turnos / Consultorio (reporte QA 30/06/2026)

Plan de registro de un sprint de fixes con consigna **"no romper nada"**. Diagnóstico por
investigación read-only (5 agentes, causa raíz confirmada contra prod). Fuente: PDF QA
30/06 + 3 videos (audio transcripto). **Decisiones de producto de Diego incorporadas.**

---

## Los 5 reportes y su causa raíz (confirmada contra prod)

### BUG 1 — Validación de solape de agendas es cosmética (deja agenda huérfana) · 🔴 alto
- **Síntoma:** crear una agenda de consultorio que pisa una de clínica virtual tira "error al
  generar turnos" pero **crea el modelo igual** (queda huérfano, con 0 turnos).
- **Causa:** (A) el índice único `turnos_medico_fecha_hora_uq (medico_id, fecha, hora_inicio)`
  **no incluye `canal_origen`** (regresión: migración 030 creó el índice antes de que 036 agregara
  el canal el 08/04) → dos canales no pueden tener un turno a la misma hora; (B) `guardarModelo`
  (`src/app/medico/agenda/actions.ts:36-134`) **no es transaccional ni valida solape**: inserta
  modelo → franjas → turnos como 3 statements; cuando el batch de turnos choca con el índice,
  aborta pero el modelo+franjas ya quedaron commiteados.
- **Blast radius:** el índice lo comparten 3 productores de turnos (formulario manual, Nova
  `crear-agenda.ts`, cron `generar-slots`). Nova tiene el mismo defecto con otro síntoma (dropea
  slots en silencio).
- **Regresión:** sí, latente desde 08/04/2026.

### BUG 2 — Dos canales el mismo día no conviven (uno bloquea al otro) · 🟡 medio
- **Síntoma:** clínica 9-13 + consultorio 14-20 (sin pisarse) → solo se ve uno; al recargar, los
  turnos de un canal desaparecen y aparecen los del otro.
- **Causa:** la resolución de conflictos (`actions.ts` `guardarModelo` 136-161 + `recalcularBloqueos`
  169-245) **no es canal-aware**: bloquea turnos del otro canal por compartir el día de semana.
  Confirmado en prod: los 12 turnos del modelo consultorio del médico test están todos `bloqueado`.
- **Regresión:** sí, el canal se agregó (13/04) sin actualizar la lógica de bloqueo.

### BUG 3 — `/dr/docto-test` da 404 · 🟢 bajo · **NO es un bug**
- **Causa:** guard intencional (PR #168, "cerrar universo de prueba") en
  `src/app/dr/[slug]/consultorio/page.tsx:66-67`: un paciente **real** no puede entrar al
  consultorio de un médico **test** (`medico.es_cuenta_test !== esPacienteTest` → `notFound()`).
  La landing pública sí carga; solo el sub-page del consultorio bloquea.
- **Problema real:** el cartel "Consultorio no encontrado" **miente** (el médico existe). Y QA no
  puede testear el consultorio con cuenta real → debe usar **cuenta de paciente test**.

### BUG 4 — Turnos sin TTL + médico con turno aparece "Sin espera" para CI · 🟡 medio
- **Síntoma:** turno de las 14h sigue "en sala de espera" a las 20:41 y al día siguiente (del lado
  médico, no del paciente); médico con turno activo figura "Disponible / Sin espera" para CI.
- **Causa:** 3 huecos: (1) **no hay TTL** de `en_espera` (ningún cron lo barre; el motor F2
  médico-ausente está diseñado pero pendiente, F2-4/F2-5); (2) **asimetría**: la query del médico
  trae `en_espera` sin filtro de fecha, la del paciente sí (`.gte("fecha", hoy)`); (3) la
  disponibilidad de CI **ignora** los turnos del médico (`puedeAtenderAhora` / `esperasPorMedico`).
- **Confirmado en prod:** turno `6230c0a8` atascado en `en_espera`; médico disponible con turno activo.
- **Relación:** toca el outage de oferta del 24/06 (no caer médicos de la oferta).

### BUG 5 — Iconografía de estados poco clara (UX) · 🟢 bajo
- **Causa:** `src/app/mis-consultas/MisConsultasList.tsx:135-139` dibuja solo un dot de color, sin
  ícono ni texto (el `label` ya existe en el código pero no se renderiza). Aislado, 1 archivo.
- **Extra:** el link "Ver consultas anteriores" (`MisTurnosPaciente.tsx`) apunta a
  `/paciente/historial` que **no existe** (404) → debería ir a `/mis-consultas`.

---

## Decisiones de producto (Diego, 30/06)

- **R1 (agendas):** dos agendas de turnos **no pueden pisarse en el mismo horario** → bloquear con
  aviso, sin crear nada a medias. (NO se permite solape → NO se migra el índice único.)
- **R2 (CI vs turno):** la **Consulta Inmediata no se habilita** en el bloque de un turno
  programado, **ni 30 min antes ni 30 min después**. El turno programado tiene prioridad.
- **BUG 4 (en vivo):** médico con turno activo/paciente en espera **sigue reservable**, pero el
  semáforo deja de decir "Sin espera" (cuenta el turno) + TTL para que el turno expire.

---

## Orden de ejecución (lo más seguro primero)

**Fase 0 — Desbloquear, riesgo ~nulo**
- BUG 3: runbook QA (probar consultorio con cuenta test) + corregir el cartel engañoso
  (distinguir "no existe" de "no tenés acceso"), **sin aflojar el guard test/real**.

**Fase 1 — Wins baratos y aislados (1 commit c/u, gate Roberto)**
- BUG 5: dots → íconos en "Mis consultas" + arreglar el link roto a `/mis-consultas`.
- BUG 4 (defensivo): filtrar por fecha la query de `en_espera` del médico + contar el turno en el
  semáforo "Sin espera". No cambia quién es reservable → bajo riesgo.

**Fase 2 — Cablear bien el consultorio (medio, detrás del feature flag)**
- BUG 2: resolución de conflictos **canal-aware** (distintos horarios, mismo día, conviven).
- BUG 1 (R1): validar solape **antes** de crear el modelo → bloquear con mensaje, cero huérfano.
  Hacer el guardado idempotente/transaccional. **No** se migra el índice (R1 = sin solape).
- BUG 1/R2: la disponibilidad de CI excluye el bloque de turnos programados ±30 min.

**Fase 3 — Ciclo de vida del turno (motor F2 pendiente)**
- BUG 4 (de fondo): TTL real de `en_espera` → estado terminal (`ausente_medico`, reusar refund).

---

## Red de seguridad (validaciones — para NO romper)

- **Todo en preview primero.** Crítico: cualquier cosa que toque el cron de slots o el índice —
  un `onConflict` mal apuntado tira `42P10` y **mata la generación de turnos en prod**. (Con R1
  no migramos el índice, así que este riesgo se evita.)
- **Guard de oferta (regla 24/06):** contar médicos reservables para CI **antes y después** de
  cualquier cambio a la disponibilidad. No repetir el colapso de oferta.
- **Preservar el bloqueo intra-canal** (BUG 2): dos agendas del MISMO canal que se pisan deben
  seguir bloqueando el modelo viejo (no abrir doble booking).
- **Un commit por ticket** (revertible), **gate de Roberto** en cada uno, **cero `--admin`**.
- Inventariar agendas huérfanas + turnos atascados antes/después (queries de control en el reporte
  de cada agente).
- BUG 3: gate de regresión — un paciente real NO debe poder generar turno/CI contra `docto-test`
  (que tiene MP real) por ningún camino.
