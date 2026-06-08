# Sprint 2026-06-07 — Evoluciones, HC, Orden, Unificación de canales y Alertas del médico

> Sesión grande. Todo lo de abajo está **mergeado a main y en producción (docto.com.ar)**, probado end-to-end por Diego. Este doc es el registro de cierre (regla del proyecto: "hecho sin doc = no hecho").

## Resumen de lo shippeado

1. **Evolución auto-compuesta + validación humana** (PR #175)
2. **"Mis pacientes" + timeline de Evoluciones unificado** (PRs #175, #176)
3. **Unificación de canales** — `WorkspaceConsulta` channel-aware: turnos guardan igual que CI (PR #177 base; el fix de finalize en la ola de unificación)
4. **Panel HC durante la llamada + reorden de Documentar + campo Orden** (PR #177)
5. **Pantalla de cierre del paciente sin preview** (PR #178)
6. **Alertas del médico — sonido + popup** (PRs #179, #180)
7. **Cierre/limpieza** — window.confirm fix, simetría CI, registro de migración (este PR)

---

## 1. Evolución auto-compuesta (determinística, NO IA)

**Principio de Diego, innegociable:** *cada palabra de la evolución tiene un autor humano.* El motor solo re-ordena datos que ya cargaron el paciente (triage) y el médico (dx, indicaciones, receta, certificado, comentario). NO inventa nada (sin "pautas de alarma" por default, sin "niega alergias", sin signos vitales).

- Motor puro: `src/lib/evolucion/componer.ts` + tests (`componer.test.ts`, node:test, sin deps nuevas).
- **Formato `tema: contenido` corrido** (NO prosa):
  ```
  paciente: {sexo}, de {edad} años. refiere al ingreso: {motivo}, {síntomas} hace {plazo}. se diagnostica: {diagnóstico}. se indica: {receta} + {indicaciones} + {certificado}. comentarios adicionales: {comentario}.
  ```
  - "se indica" = receta + indicaciones + certificado, en ese orden, siempre.
  - La **Orden NO entra** en la evolución (es documento aparte).
  - Edad y sexo siempre presentes (fecha_nacimiento es obligatoria pre-sala).
  - Secciones vacías desaparecen. Turnos (sin triage) arrancan en "se diagnostica".
- **Validación humana:** la evolución viene pre-escrita; lo único obligatorio para finalizar es **"Revisé y confirmo"** (no escribirla). Chip ámbar "Generada" → verde "Validada ✓". Se persiste `evolucion`, `evolucion_validada_at`, `evolucion_editada`.

## 2. Mis pacientes + timeline de Evoluciones

- `/medico/historial` → índice por paciente. Link "Mis pacientes" en el menú (solo médico).
- `/medico/paciente/[id]` → timeline "Evoluciones" (renombrado de "Historia Clínica"), **unificado CI + turnos** por fecha, badge por canal (`canal_origen`: Clínica Virtual / Consultorio).
- Cada médico ve SOLO los encuentros que él atendió (sale gratis de la RLS existente de `consultas`/`turnos`).

## 3. Unificación de canales (el bug grande)

`WorkspaceConsulta` es UN componente compartido por CI (`/medico/consulta/[id]/workspace`) y turnos (`/turno/[turnoId]/video`), pero **hardcodeaba `"consulta"` en todo el flujo de persistencia** → los turnos no guardaban NADA (autosave/finalize iban a `consultas` con el `turnoId` → 0 filas).

Fix: prop `tipo: "consulta" | "turno"` que rutea tabla/estado/FK. Lo no-trivial:
- **Asimetría `paciente_id` (verificada empíricamente):** `consultas.paciente_id` = `auth.users.id`; `turnos.paciente_id` = `pacientes.id`. Helper `resolverPacienteId()` por canal.
- Estado: `completada` (CI) vs `completado` (turno).
- `documentos`: `consulta_id` vs `turno_id` según canal. RLS de `documentos` valida por `medico_id` (no por consulta_id) → docs de turno pasan.
- El borrador (`/api/consulta/[id]/borrador`) ya era channel-aware; el componente nunca le pasaba el `tipo` real.

## 4. Panel HC + reorden Documentar + campo Orden

- **Panel HC durante la llamada:** botón "HC" (más chico) al lado de Estudios → `PanelHistoriaClinica` (read-only, evoluciones previas nueva→vieja, tap expande dx/receta). Data: `src/lib/evolucion/historia-clinica.ts` (`cargarEvolucionesPrevias`, excluye el encuentro actual, maneja la asimetría paciente_id).
- **Reorden Documentar:** `Diagnóstico → Indicaciones → Receta → Certificado → Orden → Evolución` (Evolución última, paso de cierre). Los del medio en acordeón (densidad mobile).
- **Campo "Orden médica"** (nuevo): texto libre para pedidos de estudios ("RX de codo", laboratorio). Nuevo `documentos.tipo = 'orden'`. **NO entra en la evolución ni en la HC** — es documento para el paciente (junto a receta/indicaciones/certificado). Manejado en PDF, `/documentos`, `/mis-consultas`, sala del paciente.

## 5. Pantalla de cierre del paciente

Se sacó el **preview de documentos** de la pantalla "Consulta finalizada" (redundante — ya están en Mis documentos). Botón → "Ver mis documentos" (`/documentos`). Se eliminó el estado/fetch/Realtime/polling que solo alimentaba ese preview (-98 líneas). **La detección de estado del paciente (polling + Realtime que muestra la pantalla de cierre) quedó intacta.**

## 6. Alertas del médico (sonido + popup)

Dos momentos en consulta inmediata, y unificado con turnos:
- **Audio en mobile:** estaba bloqueado por el navegador. `unlockAudio()` (`src/lib/sounds.ts`) se dispara en el toggle "Disponible" + un listener de primer tap (iOS: hay que reproducir un tono a volumen 0 dentro del gesto; `ctx.resume()` solo no alcanza).
- **Toast suave (momento 1):** "CI nueva por aceptar" → `soundPacienteEsperando` + toast arriba (no bloquea). Solo CI esperando.
- **Modal prominente "paciente listo" (momento 2):** `NotificacionPacienteListo` (check verde + "Iniciar consulta" azul + "Ahora no"), `soundVideoLista`. Dispara cuando:
  - una CI pasa a `pagada`, **o**
  - un **paciente de turno entra a la sala de espera** (`turnos_espera`).
  - El CTA rutea por canal (workspace CI / video turno). Detección por diff de Set de IDs. Un modal a la vez, prioridad sobre el toast, NO durante videollamada, al colgar prioriza al "listo".

---

## Migraciones aplicadas en prod (2026-06-07)

| Migración | Qué hace |
|---|---|
| `20260607_evolucion_validacion.sql` | `evolucion_validada_at` + `evolucion_editada` en `consultas` y `turnos` |
| `20260607_turnos_evolucion.sql` | `turnos.evolucion TEXT` (se aplicó a mano; registrada en este sprint) |
| `20260607_documentos_tipo_orden.sql` | `documentos_tipo_check` += `'orden'` |

> **Nota de secuencia (Roberto):** el insert de documentos es un batch atómico — si el código del tipo 'orden' llega a prod sin la migración del CHECK, el batch entero se rechaza y el paciente no recibe NINGÚN documento (silencioso). **Migración primero, merge después.**

## Lección del beta-gate (ver `docs/REGISTRO_BETA_GATE.md`)

Los previews de Vercel requieren `BETA_PASSWORD`; sin ella, el middleware fail-closed loopea TODO el preview (`ERR_TOO_MANY_REDIRECTS`) y el E2E muere. La env por-branch:
- **La branch tiene que existir en el remoto ANTES** de setear la env (`vercel env add ... preview <branch>` da `branch_not_found` si no se pusheó).
- Setear la env requiere un **deploy fresco** después para que la tome.
- **Fix permanente:** setear `BETA_PASSWORD` como "All Preview" en el dashboard de Vercel (pendiente de Diego).

## Pendientes / follow-ups

- [ ] Diego: `BETA_PASSWORD` "All Preview" en el dashboard + `/permissions` allow `gh pr merge *`.
- [ ] PanelEstudios sigue acoplado a `consultas` para turnos (los estudios temporales del turno no se gestionan). Fuera de alcance de este sprint.
- [ ] Cerrar PRs viejos sin mergear que quedaron con CI roja por el beta-gate (#174 superado por este PR).
