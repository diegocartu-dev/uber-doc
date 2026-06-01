# Sprint Refunds — Olas 2 y 3 (cobro real + reembolsos + prueba controlada)

> **Fecha:** 2026-05-31
> **Estado:** Olas 2 y 3B en producción (dormidas). 3D + 1B + whitelist en revisión final.
> **Política de referencia:** `POLITICA_REEMBOLSOS_DOCTO.md` (decisión de negocio, no rediscutir).
> **Gates:** Roberto (código/seguridad) + Diego (firma) en cada PR. Sofía en UI.

Documento de cierre de punta a punta del sprint que llevó el flujo de pagos de
Docto de **simulación** a **cobro real con Mercado Pago + reembolsos con split**,
y dejó armada una **prueba controlada en producción** scopeada por whitelist.

---

## 0. Resumen ejecutivo

Antes del sprint, Docto operaba con pagos **simulados** (`pago_marketplace=false`:
todo el flujo de pago caía a `/simular`, sin mover dinero). Este sprint:

1. **Ola 2** — Integró el **refund real** contra la API de MP en las cancelaciones
   (reembolso neutro: paciente recupera 100% = neto del médico + comisión de Docto,
   con dos refunds porque MP no revierte el `application_fee` solo).
2. **Ola 3B** — Construyó el manejo del **caso edge** (médico sin saldo): cola de
   reintentos cada 24hs, escalada a cobertura manual por CVU a las 48hs, y tabla
   de deuda del médico.
3. **Ola 3D** — Dashboard de admin de reembolsos (4 vistas).
4. **Whitelist + 1B** — Mecanismo para correr una **prueba controlada de cobro real
   en producción** (CI + turnos) scopeada a cuentas familiares, sin exponer a los
   usuarios existentes.

**Todo el código de cobro/refund queda DORMIDO en producción** hasta setear
`MP_PAGO_REAL_WHITELIST` o prender el flag global `pago_marketplace`. Verificado:
sin esas palancas, el comportamiento es idéntico al previo (todo simula).

---

## 1. Olas y tickets

### OLA 2 — Refund real (PR #102, MERGED)
| Ticket | Qué | Estado |
|---|---|---|
| 2A | Función refund aislada (`src/lib/mp-refund.ts`: `refundPayment` + `refundConReversionDeFee`) | Ya estaba (rama previa) |
| 2B | Integrar refund en `cancelaciones.ts` + retirar crédito 45 días | ✅ Merged |
| 2C | `reintegro_estado` en `consultas` + refund en cancelación de CI | ✅ Merged |

**Mecánica del reembolso neutro (decisión Diego):**
- Pata médico: refund por `mp_net_amount_medico` con token del médico (collector) → debita de su cuenta.
- Pata Docto: segundo refund parcial por `mp_application_fee` con `MP_ACCESS_TOKEN` → devuelve la comisión.
- Orden deliberado: médico primero. Si falla (sin saldo) NO se toca a Docto.
- No atómico (MP no ofrece transacción multi-cuenta): se emula con idempotencia + reintento.

**Mapeo de `reintegro_estado`:**
| Resultado | Estado |
|---|---|
| Ambas patas OK | `reembolsado` |
| Médico OK, Docto falla | `fee_pendiente` (reintentable) |
| Médico falla (sin saldo) | `pendiente` (deriva a edge) |
| Escalado a cobertura Docto | `cubierto_docto` |
| Sin `pago_id` (turno simulado) | `null` (no hubo cobro) |

### OLA 3B — Caso edge (PR #103, MERGED)
| Componente | Detalle |
|---|---|
| `refunds_pendientes` | Cola de reintentos, idempotente por `(tipo, recurso_id)` |
| `medicos_deuda` | Deuda cuando Docto cubre al paciente de su bolsillo |
| `cron/reintentar-refunds` | Diario 4am. fee_pendiente→pata Docto; pendiente→refund completo; 48hs sin saldo→escala |
| Notificación al médico | Push inmediato si no tiene saldo |
| Bugfix `activa`→`activo` | El SELECT de `medicos_mp_accounts` filtraba por estado mal escrito → refund nunca encontraba la cuenta |

### OLA 3D — Dash de reembolsos (PR #104, en revisión)
Panel `/admin/reembolsos` con 4 vistas (sección 5 de la política): cola de pendientes,
acción requerida (CVU), deuda de médicos, + KPIs. Solo lectura. Gate Sofía ✅.

### Whitelist + 1B — Prueba controlada (PR #106, en revisión)
| Commit | Qué |
|---|---|
| Whitelist | `MP_PAGO_REAL_WHITELIST`: cobro real solo si paciente Y médico en la lista |
| 1B | Cablear turnos a `crear-v2` (antes solo simulaban vía `confirmarPagoTurno`) |
| Notif turno | Email + push en webhook al confirmar turno por cobro real (paridad con simulación) |
| Hold 15min | Reserva de turno 5→15min (cubre tiempo de pago real en Checkout Pro) |
| Alertas | Distinguir reentrega benigna de MP de race de expiración |

---

## 2. Migraciones aplicadas en producción

Todas aplicadas vía Supabase Management API y verificadas contra prod:

| Migración | Qué |
|---|---|
| `20260531_refund_fee_pendiente.sql` | `turnos.reintegro_estado` CHECK += `fee_pendiente` |
| `20260531_consultas_reintegro_estado.sql` | Agrega `reintegro_estado` a `consultas` |
| `20260531_refunds_pendientes_deuda.sql` | Tablas `refunds_pendientes` + `medicos_deuda` (RLS: service_role FOR ALL, admin FOR SELECT) |
| `20260531_refunds_pendientes_patas.sql` | Columnas `medico_refund_id` / `docto_refund_id` |
| `20260531_reintegro_cubierto_docto.sql` | CHECK de ambas tablas += `cubierto_docto` |

**Verificación prod (2026-05-31):** ambas tablas existen con 0 filas (esperado, nadie
ha cobrado real aún), columnas `reintegro_estado` y `medico_refund_id` presentes.

---

## 3. Archivos clave

| Archivo | Rol |
|---|---|
| `src/lib/mp-refund.ts` | `refundPayment`, `refundConReversionDeFee`, `getPaymentState` (guard anti-over-refund) |
| `src/lib/cancelaciones.ts` | `ejecutarRefund` (resuelve tokens, mapea estado, encola pendiente, notifica) |
| `src/lib/refunds-pendientes.ts` | `registrarRefundPendiente` (upsert idempotente) |
| `src/lib/pago-whitelist.ts` | `transaccionHabilitadaParaCobroReal` (whitelist por email) |
| `src/app/api/cron/reintentar-refunds/route.ts` | Cron de reintentos + escalada |
| `src/app/api/pago/crear-v2/route.ts` | Crea preferencia MP; guard de cobro real (flag global o whitelist) |
| `src/app/api/pago/webhook/route.ts` | Confirma pago; notif turno; distingue reentrega de race |
| `src/app/admin/reembolsos/` | Dashboard de reembolsos |

---

## 4. Decisiones de producto tomadas en el sprint

1. **Reembolso neutro** (2026-05-31): paciente recupera 100% = neto médico + comisión Docto. Nadie gana ni pierde.
2. **Refund inmediato reemplaza el crédito de 45 días.** Se retiró `DIAS_CREDITO` y la UI de crédito. La **reprogramación** sigue viva (no mueve dinero).
3. **Ventana de escalada 48–71h** (hallazgo I2 Roberto): el cron es diario, así que la cobertura manual CVU cae entre 48 y ~72h. Aceptado. **TyC a ajustar → Carolina** (registrado en `POLITICA_REEMBOLSOS_DOCTO.md` §7).
4. **NO borrar usuarios dormidos.** Producción tiene ~50 cuentas de pacientes inactivas + médicos reales sin MP (incl. Dra. Fasce). En vez de borrar (datos sensibles de salud, Ley 25.326), se usa whitelist para acotar el cobro real. Los dormidos no pueden re-registrarse (beta guard) pero sí loguear; el whitelist evita que paguen real por accidente.
5. **Prueba controlada en producción, scopeada por whitelist** (excepción consciente a "MP testing solo en preview"): el split entre cuentas separadas no se puede validar en sandbox (una sola cuenta). Se hará con 3 cuentas MP reales familiares, `MP_PAGO_REAL_WHITELIST`, sin prender el flag global.
6. **Prueba cubre CI + turnos** (decisión Diego): por eso se cableó 1B.
7. **Recuperación automática del webhook diferida a go-live:** no construir robustez que mueve dinero solo sobre un camino aún no validado en vivo. Para la prueba, monitoreo manual de la alerta de race.

---

## 5. Auditorías de Roberto (resumen)

| PR | Hallazgos | Resolución |
|---|---|---|
| #102 (2B) | I-1 retry fee_pendiente, I-2 textos Nova, I-3 reembolsado sin pago | I-2/I-3 corregidos; I-1 → 3B |
| #103 (3B) | C1 deuda fantasma por TTL idempotency, I1 race de fila, I3 estado terminal | Todos corregidos (getPaymentState + claim atómico + cubierto_docto) |
| #103 (3B 2da) | C1-bis rama por monto global, I4 loop infinito | Corregidos (flags persistidos + MAX_INTENTOS) |
| #106 (whitelist) | Sin bloqueantes; caveat CI-only (turnos no cableados) | → motivó 1B |
| #106 (1B+webhook) | I1 race expiración, I2 falsas alertas | Hold 15min + distinguir reentrega |
| #106 (4-5) | Aprobado | — |

**Principio de evidencia empírica:** la separación física del débito (médico vs Docto)
NO se pudo validar en sandbox (una sola cuenta). Es gate duro pre-go-live, pendiente.

---

## 6. Gates pendientes PRE-GO-LIVE (antes de prender cobro real masivo)

1. 🔴 **E2E split con 3 cuentas MP reales** — runbook `docs/sprints/ola3-validacion-e2e-split.md`. Validar que cada pata debita de su cuenta. No reproducible en sandbox.
2. 🔴 **TyC ajustados** (ventana 48–71h) → Carolina.
3. 🟡 **3A — captura de CVU del paciente** (no existe la columna). Necesario para la transferencia manual del caso edge.
4. 🟡 **Recuperación automática del webhook** (race de expiración) — hoy solo alerta + refund manual.
5. 🟡 **Verificar `MP_ACCESS_TOKEN` de prod** (hoy cuenta GREBA, pendiente SRL) antes del cobro real.
6. 🔵 **S1** — estado `revision_manual` en el recurso (diferido a 3D).

---

## 7. Cómo activar la prueba controlada (cuando estén las 3 cuentas)

1. Médico familiar conecta su MP real por OAuth (`/medico/perfil`). Verificar `medicos_mp_accounts.estado='activo'`, `live_mode=true`.
2. Setear en Vercel **Production**: `MP_PAGO_REAL_WHITELIST=email_paciente,email_medico`.
3. Confirmar que el flag DB `pago_marketplace` **sigue en false**.
4. Correr el runbook `docs/sprints/ola3-validacion-e2e-split.md` (Fases 2-4).
5. Al cerrar: quitar `MP_PAGO_REAL_WHITELIST`, reintegrar plata a los familiares, registrar evidencia.

---

## 8. Estado de PRs al cierre (2026-05-31)

| PR | Título | Estado |
|---|---|---|
| #100 | Política de reembolsos + plan de olas | ✅ Merged |
| #102 | Ola 2 — refund real (2B/2C) | ✅ Merged |
| #103 | Ola 3 — bugfix + cola/deuda (3B) | ✅ Merged |
| #104 | Dash de reembolsos (3D) | 🔄 Abierto (gate Sofía ✅, falta merge) |
| #105 | Runbook E2E split | 🔄 Abierto |
| #106 | Whitelist + 1B turnos | 🔄 Abierto (Roberto ✅ commits 1-5, falta merge de Diego) |

> **Nota:** #106 quedó pendiente de merge directo por Diego (el gate de Roberto está
> completo; el merge lo cierra el gate humano). #104 y #105 pueden mergearse cuando
> Diego dé el OK visual.

---

*Documento de cierre de sprint. La verdad del estado está en el repo + producción,
no en memoria. Actualizar si cambia el estado de los PRs abiertos.*
