# Runbook — Validación E2E del split real (Ola 3, gate pre-go-live)

> **Objetivo:** confirmar empíricamente que un cobro con `marketplace_fee` y su
> posterior reembolso debitan de la cuenta correcta: el **neto** desde la cuenta
> del **médico** (collector), el **fee** desde la cuenta de **Docto** (marketplace),
> y el paciente recupera el **100%**. El sandbox NO puede validar esto (usa una
> sola cuenta). Es el último gate duro antes de prender el marketplace.

## Mecanismo de aislamiento — whitelist en producción

> **Decisión de Diego (2026-05-31):** la prueba se corre en **producción real
> (docto.com.ar)** pero **scopeada por whitelist de emails**, NO prendiendo el
> flag global `pago_marketplace`.

**Por qué whitelist y no el flag global:** `pago_marketplace` se lee de una tabla
de DB **compartida por todos los deploys** (`getFlag` en `feature-flags.ts`).
Prenderlo expondría al cobro real a TODOS los usuarios de docto.com.ar de golpe
(~50 cuentas de pacientes dormidas + médicos reales). En cambio
`MP_PAGO_REAL_WHITELIST` (env var, ver `src/lib/pago-whitelist.ts`, PR #106)
habilita el cobro real **solo cuando paciente Y médico están ambos en la lista**
— el resto sigue cayendo a `/simular` intacto. Es fail-safe: cualquier cuenta
fuera de la whitelist, o cualquier error resolviendo emails, cae a simulación,
nunca cobra a un tercero (auditado por Roberto, PR #106).

> **Excepción consciente a "MP testing solo en preview" (MEMORY).** La regla
> general es no probar MP en producción. Esta prueba la viola **deliberadamente**
> porque el split entre cuentas separadas no se puede reproducir en sandbox/Preview
> con una sola cuenta de test, y el whitelist acota el blast radius a las cuentas
> familiares de Diego. Decisión explícita de Diego, registrada acá.

> **⚠️ Alcance: SOLO Consultas Inmediatas (CI).** Los turnos NO pasan por
> `crear-v2` — usan `confirmarPagoTurno` (server action que solo hace
> `update estado='confirmado'`, sin MP). Por lo tanto esta prueba valida el split
> **únicamente en CI**. Cablear turnos a MP es el **ticket 1B** (pendiente,
> decisión de timing diferida por Diego 2026-05-31). Si la prueba quiere cubrir
> turnos, primero hay que hacer 1B.

---

## Fase 0 — Prerrequisitos (Diego)

- [ ] **3 cuentas Mercado Pago reales y distintas:**
  - **Docto** (marketplace / recibe el `application_fee`) → su access token va en `MP_ACCESS_TOKEN`.
  - **Médico** (collector / familiar) → se conecta por OAuth dentro de la app.
  - **Paciente** (pagador / familiar) → paga desde Checkout Pro.
  - Las tres deben poder operar plata real (`live_mode=true`, no cuentas de test del sandbox).
- [ ] **Emails** del médico y paciente familiares confirmados (tal como figuran en `auth.users`) para cargar la whitelist.
- [ ] **Saldo** en la cuenta del paciente para pagar la consulta de prueba.
- [ ] Plan de **reintegro**: Diego le devuelve la plata a los familiares al cerrar la prueba.

> **⚠️ Verificar `MP_ACCESS_TOKEN` de prod ANTES de cobrar (regla de verificación
> contra producción).** Hoy el token de prod es la cuenta **GREBA**
> (28443305, diegocartu@me.com), pendiente de separar con la SRL. El
> `application_fee` se libera a la cuenta de ESE token. Confirmar con
> `npx vercel env pull` qué cuenta está en `MP_ACCESS_TOKEN` de Vercel prod, y
> que sea la cuenta Docto deseada, antes de que entre plata real. (Hallazgo
> Roberto, PR #106.)

## Fase 1 — Activación (Diego, con guía mía)

- [ ] El **médico familiar** entra a docto.com.ar, completa onboarding y **conecta su MP real por OAuth** (`/medico/perfil` → conectar Mercado Pago). Verificar `medicos_mp_accounts.estado='activo'` y `live_mode=true`.
- [ ] Setear en **Vercel Production**:
  - `MP_PAGO_REAL_WHITELIST=email_paciente_familiar,email_medico_familiar`
- [ ] Confirmar que el flag DB `pago_marketplace` **sigue en false** (el resto de los usuarios sigue simulando).
- [ ] (Opcional, recomendado) Verificar con una cuenta NO whitelisted que sigue cayendo a `/simular` (no cobra real).

## Fase 2 — Cobro real (happy path, CI)

- [ ] El médico familiar habilita CI (Clínica Inmediata).
- [ ] El **paciente familiar** recorre el camino real: pide consulta → médico acepta → paga con Checkout Pro con **plata real** de su cuenta MP.
- [ ] Verificar transición: webhook → `consultas` pasa a `en_curso`, con `pago_id`, `mp_application_fee`, `mp_net_amount_medico` persistidos.
- [ ] **Evidencia (regla de evidencia empírica):**
  - Captura del pago en el panel MP de la cuenta **médico** (neto acreditado).
  - Captura en el panel MP de **Docto** (`application_fee` liberado).
  - Fila de `consultas` con los tres campos MP poblados.

## Fase 3 — EL GATE: reembolso con split

- [ ] Cancelar con derecho a reembolso (médico cancela, o paciente con la regla aplicable a CI).
- [ ] Verificar las **dos patas** (sección 2.1 política):
  - Pata médico: refund por `mp_net_amount_medico` **debita de la cuenta del médico**.
  - Pata Docto: refund por `mp_application_fee` **debita de la cuenta de Docto**.
  - El pago en MP queda `refunded` (suma = 100%).
- [ ] **Mirar el dashboard** `/admin/reembolsos`: si todo sale OK, la cola queda vacía. Si algo falla, aparece en "Pendientes".
- [ ] **Evidencia:**
  - Panel MP médico: débito del neto.
  - Panel MP Docto: débito del fee.
  - Panel MP paciente: acreditación del 100%.
  - `reintegro_estado='reembolsado'` en el recurso; `refunds_pendientes` sin fila activa.

## Fase 4 — Caso edge (médico sin saldo) — opcional pero recomendado

Forzar el edge para validar la cola + escalada:
- [ ] Antes de cancelar, el médico **retira su saldo** de MP (deja la cuenta sin fondos para cubrir el neto).
- [ ] Cancelar → la pata médico debe fallar por saldo insuficiente.
- [ ] Verificar en `/admin/reembolsos`:
  - Aparece en **Pendientes** con badge "Médico sin saldo".
  - Llega push al médico ("Reembolso pendiente / necesitás saldo").
- [ ] (Reintento) Reponer saldo y correr el cron manualmente
  (`GET /api/cron/reintentar-refunds` con `Authorization: Bearer $CRON_SECRET`) → debe resolver y pasar a `reembolsado`.
- [ ] (Escalada) Si se deja sin saldo 48hs, el cron escala → fila en **Acción requerida**, `medicos_deuda` con el total, alerta a admin. (Para no esperar 48hs, validar la lógica de escalada por separado bajando temporalmente `HORAS_ESCALADA` en un Preview, o aceptar la validación lógica que ya hizo Roberto.)

## Criterio de "listo" (cierra el gate)

- ✅ Fase 2 + Fase 3 con evidencia de **débito separado real** (médico ≠ Docto) y paciente recuperando el 100%.
- ✅ Fase 4 al menos hasta "aparece en Pendientes + push al médico".
- ✅ Cero impacto en los usuarios existentes (flag DB `pago_marketplace` nunca se prendió; solo la whitelist operó).

## Cierre de la prueba

- [ ] **Quitar `MP_PAGO_REAL_WHITELIST`** de Vercel prod (vuelve todo a simulación).
- [ ] Reintegrar la plata a los familiares.
- [ ] Registrar resultado + evidencia en este doc.

## Después del gate (NO parte de esta validación)

- TyC ajustados (ventana 48–71h) → Carolina.
- 3A (captura CVU) para cerrar el caso edge de cobertura manual.
- Decisión sobre turnos: cablear 1B si se quiere cobro real de turnos.
- Recién entonces: decisión de go-live = prender `pago_marketplace` en prod (o ampliar la whitelist gradualmente).

---

*Documento operativo. La validación NO se considera cerrada sin la evidencia
empírica de las Fases 2 y 3 registrada (capturas de los 3 paneles MP + filas DB).*
