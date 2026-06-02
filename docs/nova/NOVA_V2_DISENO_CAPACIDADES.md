# Nova v2 — Diseño de capacidades

> **Fecha:** 01/06/2026 · **Estado:** diseño aprobado en dirección (Diego), pendiente de construcción.
> **Origen:** circuito real de Diego (01/06) → Nova no pudo crear "todo junio", se confundió ("me adelanté"), no detectó superposición. Diagnóstico: no es el prompt, son las **tools finas**.

## Principio rector

Nova no es "un chat con reglas". Es una **secretaria médica con un set de manos** (tools) que cubren su trabajo de punta a punta.

- El **prompt** define personalidad, criterio y tono. Hoy está bien (8/10).
- Las **tools** definen lo que Nova físicamente puede hacer. Hoy son demasiado finas.

El problema que veníamos parchando es que **el prompt promete más de lo que las tools permiten**. Cada bug (voz, mes completo, superposición) es otra cara del mismo hueco. v2 cierra la brecha de raíz y después **achica el prompt** para que se apoye en tools sólidas en vez de prometer cosas que no puede.

**Regla de oro v2:** ninguna lógica crítica (conflictos, doble-reserva, notificación) vive en el prompt. Vive en la tool, testeada, devolviendo datos estructurados. El prompt solo decide *cuándo* llamar la tool y *cómo* contarle el resultado al médico.

## El trabajo real de la secretaria (Jobs To Be Done)

| | Job | Ejemplos del médico |
|---|---|---|
| A | **Gestionar disponibilidad** | "Armá todos los miércoles de junio 19-21", "Lunes a viernes 9-13 todo el mes", "Del 10 al 20 no atiendo" |
| B | **Gestionar turnos existentes** | "Cancelá el martes", "Mové a Juan al jueves", "¿Cuándo viene la Sra. Pérez?" |
| C | **Informar / responder** | "¿Cómo viene mi semana?", "¿Cuánto cobro?", "¿Quién viene hoy?" |
| D | **Comunicarse con pacientes** | "Mandale a Juan los turnos de mi consultorio para que saque un control" |
| E | **Administrar** | "¿Me pagó el turno de las 10?" |

## Brecha actual (tools de hoy)

| Job | Tool hoy | Hueco |
|---|---|---|
| A | `crear_slots` (1 fecha) · `bloquear_agenda` (1 día) | ❌ sin rango ni recurrencia · ❌ conflicto parcheado, bloquea de más |
| B | `cancelar_turno` · `cancelar_turnos_dia` | ❌ no hay **reprogramar** · ❌ no hay **buscar por paciente** |
| C | `ver_agenda` (1 día) · `ver_estado_pago` | ⚠️ no ve **semana/mes** en una |
| D | — | ❌ no existe |
| E | `ver_estado_pago` | ✅ ok |

## Superficie de tools v2

### Escritura — Agenda
1. **`crear_disponibilidad`** _(reemplaza `crear_slots`)_
   - Input: `fecha_desde`, `fecha_hasta`, `dias_semana` (`["miercoles"]` o `"todos"`), `hora_inicio`, `hora_fin`, `duracion`, `canal_origen`.
   - **Contrato clave:** la detección de conflicto es **parte del retorno**, no una guardia aparte. Devuelve `{ resumen_por_dia, conflictos: [{fecha, rango, tipo: "con_paciente"|"vacio"}] }`. Nova muestra el preview + conflictos y el médico confirma.
   - Resuelve de una: crear el mes, recurrencia, y el bug de superposición (lógica centralizada y testeada → cierra el hallazgo de Roberto de raíz).
2. **`reprogramar_turno`** _(nuevo)_ — mover el turno de un paciente a otra fecha/hora; reusa la notificación existente.
3. **`bloquear_periodo`** _(reemplaza `bloquear_agenda`)_ — soporta rango (vacaciones, francos).
4. **`cancelar_turno`** / **`cancelar_turnos_dia`** _(se mantienen — ya reusan `cancelarTurnoPorMedico`)_.

### Lectura
5. **`ver_agenda`** _(extender)_ — acepta rango: día / semana / mes. Resumen agrupado.
6. **`buscar_turno_paciente`** _(nuevo)_ — "¿cuándo viene Juan?" → busca por nombre.

### Comunicación con pacientes — **GATE legal (Carolina)**
7. **`invitar_a_control`** _(nuevo)_ — email al paciente con los slots disponibles de un canal + link para reservar. **Plantilla pre-aprobada, sin texto libre**, para no romper AAIP/ReNaPDiS. Reusa Resend (`src/lib/email.ts`). _Es el caso exacto que pidió Diego._

### Admin / UI
8. **`ver_estado_pago`** _(se mantiene)_ · 9. **`mostrar_opciones`** _(se mantiene)_.

## Orden de construcción

**Fase 1 — Núcleo de agenda.** `crear_disponibilidad` (rango + recurrencia + conflicto nativo) + `reprogramar_turno` + `bloquear_periodo`.
→ Mata los 3 bugs de hoy y es la base de todo. Mayor valor inmediato. La lógica de conflicto queda en UN lugar testeado (resuelve el hallazgo de Roberto estructuralmente, no con parche).

**Fase 2 — Lectura rica.** `ver_agenda` por rango + `buscar_turno_paciente`.
→ Bajo riesgo, alto valor. Hace a Nova realmente útil para consultar.

**Fase 3 — Comunicación con pacientes.** `invitar_a_control` + recordatorios proactivos.
→ Corre en **paralelo** con el gate de Carolina mientras construimos 1 y 2. Es la idea del mail de Diego.

**Fase 4 — Prompt slim + voz + proactividad.** Achicar el prompt para apoyarse en las tools nuevas; pulir voz (ya parcheada en PR #118); sugerencias proactivas ("tenés 3 huecos mañana, ¿los lleno?").

## Qué pasa con el trabajo de hoy (PR #118)

- **Fix de voz** → es sólido e independiente del rediseño. Se conserva (entra en Fase 4 o antes).
- **Guardia de superposición (Ticket 2)** → queda **superada** por `crear_disponibilidad` (conflicto nativo). No se mergea el parche; la lógica correcta nace en Fase 1. Así no arrastramos el falso-positivo que encontró Roberto (turnos cancelados retienen `paciente_id`).

## Decisiones abiertas (confirmar al llegar a cada fase)

- **Recurrencia:** ¿guardamos el patrón ("todos los miércoles") como modelo recurrente que auto-genera a futuro, o materializamos turnos fijos en el rango pedido? (impacta `agenda_modelos` + cron `generar-slots`).
- **Reprogramar:** ¿el paciente acepta el nuevo horario o es unilateral del médico con aviso?
- **`invitar_a_control`:** alcance de la plantilla y consentimiento — definición de Carolina.

## Modelo de precios + Consulta Inmediata (refinado con Diego, 01/06)

**Decisión de Diego:** el precio NO es único global. Es por contexto:

- **Turnos programados → precio POR AGENDA.** Permite cobrar distinto un domingo/feriado.
  - Estado: **YA existe.** `agenda_modelos.precio` es editable en el formulario manual (`FormularioModelo.tsx`, campo "Valor de consulta"). Cada turno guarda su `monto` como foto.
  - Falta: que **Nova** (`crear_disponibilidad`) acepte un precio por agenda en vez de usar siempre `medico.precio_consulta`.
- **Consulta Inmediata → precio POR SESIÓN.** El médico fija el precio cada vez que habilita CI, para esa sesión de ≤3h.
  - Hoy el panel de CI deja poner precio, pero lo **persiste como `medicos.precio_consulta` global** (acople a corregir). Hay que **decouplear**: el precio de la sesión de CI no debe pisar el precio default de los turnos.
- **`medicos.precio_consulta`** pasa a ser solo el **default** que pre-llena ambos.

**CI — apagado automático + aviso de expiración (decisión de Diego):**
- Máximo **3 horas** por sesión; se apaga sola por default.
- Antes de apagarse, avisar al médico: *"Tu sesión de Consulta Inmediata está por expirar. ¿La dejás activa 3 horas más?"* con botón para extender. Si no responde → se apaga. Si extiende → otras 3h.
- Previene el riesgo de quedar disponible por olvido (no-show pagado).
- La futura tool de Nova para activar CI debe respetar el mismo tope de 3h.

## Backlog técnico (auditoría Roberto, 01/06)

- **`reprogramar_turno` necesita un RPC dedicado.** El RPC existente `reprogramar_turno_atomico` es el flujo del PACIENTE usando un crédito de cancelación (requiere `reintegro_estado='pendiente'`, límite de 2 reprogramaciones, vencimiento 45 días). NO sirve para que el médico mueva un turno ACTIVO (`reintegro_estado=NULL`): reusarlo dejaba al paciente con dos turnos confirmados. La reprogramación iniciada por el médico necesita su propia función: mover al paciente al slot nuevo, liberar el viejo (`estado='reprogramado'`), notificar. Sin las reglas de crédito.
- **Bug latente en el RPC del paciente (CRÍTICO-1):** `reprogramar_turno_atomico` marca el origen como `usado_reprogramacion` pero no le cambia el `estado` → si el origen estaba `confirmado`, queda confirmado (doble turno). Nunca se disparó en prod (sin caller). Fix: `UPDATE origen SET estado='reprogramado'` dentro del RPC. Requiere migración + OK de Diego.
- **REVOKE EXECUTE (IMPORTANTE-1):** el RPC es `SECURITY DEFINER` con EXECUTE para anon/authenticated/PUBLIC. Se autovalida (riesgo bajo) pero es superficie innecesaria. `REVOKE … FROM anon, authenticated, PUBLIC`. Mismo patrón que el backlog de `expirar_turno`.
- **CHECK defensivo `turnos.monto >= 0`:** hoy no existe. La validación de rango está en el route, conviene una red en DB.

## Backlog descubierto en testing (01/06)

- **Gestionar agendas existentes (modelos) por nombre/estado.** El médico piensa en "agendas" (la agenda *prueba*), pero Nova solo maneja turnos por fecha/horario. Capacidades naturales: "¿cuántas agendas activas tengo?", "eliminá la agenda de prueba", "desactivá la de los miércoles". Infra ya existe (`eliminarModelo`, `toggleModelo` en `src/app/medico/agenda/actions.ts`); falta darle a Nova las tools (`ver_agendas`, `eliminar_agenda`, `activar/desactivar_agenda`).
  - **Seguridad obligatoria:** la FK `turnos.modelo_id` es `ON DELETE NO ACTION` → eliminar un modelo con turnos falla. Y un modelo puede tener pacientes (`reservado_pendiente`/`confirmado`). Eliminar/desactivar una agenda DEBE aplicar el mismo freno por paciente que `crearAgendaModelo`: no romper turnos con pacientes; avisar y mandar a revisión manual.
  - Decisión Diego (01/06): **no entra en esta versión.** Candidata a Fase 2.
- **Canal "ambos"** (agenda común CV + consultorio) y **CI con apagado automático a 3h** — pendientes de confirmar el modelo con Diego (ver charla 01/06).

---
_Este documento es la fuente de verdad del rediseño de Nova. Actualizar al cierre de cada fase._
