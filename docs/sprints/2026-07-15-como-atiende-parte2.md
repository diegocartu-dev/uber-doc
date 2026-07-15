# Sprint 15/07/2026 — "Cómo atendés" (Parte 2): hub, config CI, agendas modelo B y consultorio particular

**Spec:** `docs/specs/2026-07-14-rediseno-como-atiende-medico.md` (aprobada por Diego 14/07, detalle por detalle).
**Rama:** `feat/como-atiende-parte2` → PR #278. **Sin migración SQL** (el modelo de datos ya era compatible: precio/duración por agenda desde la migración 020, canal desde 038, pausa = `activo`).
**Disparador:** dogfooding de Diego (15/07 ~1 AM): el form viejo de agenda tiraba "La duración del turno debe ser un número positivo" a médicos del registro nuevo (duración NULL en perfil) y el modelo de franjas no era el aprobado.

## Qué se construyó (un commit por ticket)

| Commit | Ticket |
|---|---|
| `cbfbfee` | **Crear agenda MODELO B**: un horario aplicado a uno o varios días; la semana se apila con agendas simples. Precio y duración POR AGENDA (no se heredan del perfil). Nada prellenado; vigencia desde hoy; invariante server: agenda sin precio > 0 no se crea (cubre el form y Nova). |
| `0ef46fc` | **Cron `generar-slots` propaga `canal_origen`** (los slots regenerados de agendas privadas caían al DEFAULT `clinica_virtual` → se filtraban al listado público). **Badge "Vencida"** en la lista (la agenda vencida moría en silencio con el toggle verde). |
| `35cb9c8` | **Config de Consulta Inmediata** (`/medico/como-atendes/consulta-inmediata`): valor/duración/horario sin prellenar, toggle "Disponible ahora" gateado con motivo visible. **Gate server ampliado** (espíritu #270): activar exige precio + duración + horario (payload O fila — verificado contra prod: cero regresión). |
| `db95d15` | **Hub `/medico/como-atendes`**: 3 modos (CI / clínica virtual / consultorio particular) con estado real; entrada desde el dashboard. |
| `cdc3983` | **Consultorio particular** (`/medico/como-atendes/consultorio`): link a nivel consultorio (Copiar + WhatsApp), agendas privadas con pausa. **Enforcement de `visible_consultorio_particular`** (era decorativo) + **guard de canal en `reservarTurno`** (un slot privado no se reserva desde la clínica; se eliminó el pisado de `canal_origen` al reservar). |
| `012a99f` | **Gate Martín**: comisión transparente (% real por categoría: founder 5% / tradicional 10%, de la DB — nunca hardcodeado) en hub y consultorio; **"Sin fecha de fin"** (sentinel 2099-12-31 + cap de generación inicial a 30 días — el cron extiende el horizonte); WhatsApp profesional de usted. |
| `150d281` | **Gates Sofía + Roberto**: sistema de colores (azul controles / verde SOLO estados); "nada prellenado" también en el panel viejo del dashboard (adiós al 15.000 alcanzable); apagar CI siempre permitido; enforcement de canal completado (página turnos por URL directa + `reservarTurno` + triage CI); "hoy" en hora Argentina; revert del toggle al último estado confirmado. |

## Gates (veredictos)

- **Sofía (UX): APROBADO CON CAMBIOS** — "fidelidad muy alta... supera lo pedido". B1 (color del toggle) y B2 (panel viejo violaba nada-prellenado) aplicados; R1–R5 aplicados.
- **Roberto (QA/seg): APROBADO CON OBSERVACIONES** — evidencia empírica contra prod: 0/776 slots con canal errado, índice parcial `turnos_medico_fecha_hora_uq` intacto, patrón `insertarSlotsSinDuplicar` intacto (sin ON CONFLICT), los gates nuevos no patean a ningún médico vivo (0 disponibles al momento; el panel viejo siempre manda horario). Su IMPORTANTE (hueco de enforcement por URL directa) quedó cerrado en `150d281`. Grant de `visible_consultorio_particular` para `authenticated` verificado ANTES de sumarla a SELECTs RLS (regla post-outage).
- **Martín (médico): APROBADO CON CAMBIOS** — modelo "una agenda por bloque" = ventaja ("así pensamos los honorarios"); sus tres pedidos de confianza aplicados (comisión visible, sin-fecha-de-fin, WhatsApp profesional).

## Extensiones de alcance (reportadas, decide Diego)

Consecuencias técnicas del sprint, detectadas en el mapeo previo (5 lectores paralelos sobre agendas/CI/consultorio/hub/pagos):
1. Fix del cron `canal_origen` (bug real: slots privados en la clínica pública).
2. Enforcement de `visible_consultorio_particular` (toggle decorativo → real, por todas las puertas).
3. Guard de canal + no-pisado en `reservarTurno`.
4. Cap de 30 días en la generación inicial de slots (habilita "sin fecha de fin"; alinea el productor on-demand con el horizonte del cron; una agenda que arranca a >30 días se crea con 0 slots y el cron los genera al acercarse).

## Pendientes de decisión de Diego (no bloquean el merge)

- Copy tarjeta "Clínica virtual" orientado a beneficio (propuesta Martín — cambia texto aprobado en spec).
- Promesa "solo te ven los pacientes a los que les compartís el link" (el link es adivinable; la defendible: "no aparece en la clínica de Docto").
- ¿CI también en consultorio particular? (pendiente registrado en la spec; hoy el gate legacy usa `modalidad_atencion`, NULL en médicos nuevos → CI nunca disponible en el consultorio de un médico nuevo).
- Tope máximo de precio por agenda (Nova topa 500–500.000; el form no topa).

## Follow-ups anotados (próximo sprint)

- `editarModelo` (editar agenda existente) — hoy es pausar/eliminar/recrear y el tip promete "editar".
- Panel viejo del dashboard → considerar reducirlo a switch + link al hub (Sofía; hoy conviven dos editores de la misma config con reglas unificadas).
- CAS de reserva sin verificación de filas afectadas (pre-existente — sprint sesiones/robustez).
- Placeholder de duración en panel viejo ya agregado; toggle verde de `ListaModelos` = deuda de color preexistente.
- Renovación asistida de agendas vencidas (el badge es el paso 1).
