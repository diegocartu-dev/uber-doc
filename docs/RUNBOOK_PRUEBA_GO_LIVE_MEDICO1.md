# Runbook — Prueba go-live con médico 1 (real, en producción)

**Fecha:** prueba prevista para el día siguiente al 02/06/2026
**Objetivo:** probar el circuito COMPLETO de un médico real en producción —
identidad (Didit) + conexión Mercado Pago + consulta con **cobro real** + reembolso.
Médico cooperativo (amigo de Diego), **founder (5%)**. Diego paga el monto real total.
Si todo OK → go-live (prender flags) + avisar a Sofía que puede seguir su registración.

---

## Estado de partida (todo ya construido, dormido)

| Pieza | Estado |
|---|---|
| Didit (validación de identidad) | ✅ construido, **dormido** (`identidad_gate_activa` = OFF) |
| MP marketplace (OAuth + split + webhook) | ✅ ~95% construido, **dormido** (`pago_marketplace` = OFF → todo simula) |
| Comisiones por categoría | ✅ founder 5% / tradicional 10% (en prod) |
| Cuenta de la plataforma (GREBA) | ✅ configurada, recibe el `application_fee` |

---

## 1. Pre-requisitos — juntar ANTES

**Del médico amigo:**
- [ ] Email con el que se registra
- [ ] Es médico real con **matrícula real (en REFEPS)** + **DNI real** (lo valida Didit)
- [ ] Tiene una cuenta de **Mercado Pago REAL** (no de prueba) y puede autorizarla
- [ ] Trae su **DNI físico** para el Didit (escaneo + selfie)

**De Diego:**
- [ ] Email de **PACIENTE** — ⚠️ distinto a `diegocartu@gmail.com` (ese ya es cuenta de médico)
- [ ] Tarjeta real para pagar el monto completo

---

## 2. Configuración previa (Cortana/Claude, con los 2 emails)

- [ ] `MP_PAGO_REAL_WHITELIST` = `email_medico,email_paciente` (Vercel, Production)
- [ ] `SIGNUP_WHITELIST_EMAILS` += `email_medico` (si la beta de registro está cerrada)
- [ ] Redeploy + verificar que las vars quedaron

---

## 3. Circuito del día — paso a paso

1. **Registro del médico** — el amigo entra a `docto.com.ar`, se registra como médico
   con sus datos reales. Queda **founder** por default, estado `pendiente_revision`.
2. **Aprobación admin** — aprobar al médico en el panel admin → `verificado` + `aprobado`.
3. **Prender el gate de identidad** — `identidad_gate_activa` = ON. Al entrar, el médico
   ve la pantalla "Verificá tu identidad".
4. **Didit (identidad)** — el médico hace: consentimiento → escanea DNI → selfie →
   prueba de vida. Webhook → cruce DNI↔matrícula (REFEPS) → `identidad_validada` = true.
5. **Conectar MP** — Perfil → Cobros → "Conectar Mercado Pago" → autoriza con su cuenta real.
6. **Reservar + pagar (Diego como paciente)** — Diego (cuenta paciente) reserva una
   consulta/turno con el médico y **paga el monto real con tarjeta real**.
7. **Verificar el split** — el webhook MP transiciona la consulta a `en_curso`.
8. **La consulta + receta** — hacen la videollamada, el médico emite una receta.
9. **Reembolso (cancelación)** — cancelar la consulta/turno y verificar las dos patas.

---

## 4. Criterios de éxito (qué verificar)

- [ ] **Identidad:** `medicos.identidad_validada = true` (el cruce real pasó).
      Si queda `didit_status = "In Review"` → el cruce DNI↔matrícula no cerró, revisar.
- [ ] **MP conectado:** `medicos_mp_accounts` con `estado` activo y `live_mode = true`.
- [ ] **Checkout real:** redirige al checkout REAL de MP (no sandbox), pago aprobado.
- [ ] **Split correcto:** en la consulta/turno, `mp_application_fee` = 5% del monto y
      `mp_net_amount_medico` = 95%. En MP: el médico recibió el neto, GREBA la comisión.
- [ ] **Receta:** emitida y firmada, PDF OK.
- [ ] **Reembolso:** devolución al paciente + recupero de la comisión de Docto (dos patas).

---

## 5. Después del test exitoso → GO-LIVE

- [ ] `pago_marketplace` = **ON** (cobro real para todos)
- [ ] `identidad_gate_activa` = **ON** (gate de identidad para todos)
- [ ] Sacar los emails de las whitelists (ya no hacen falta) — o dejarlas, son inocuas
- [ ] **Avisar a Sofía Fasce** que puede seguir su registración

---

## 6. Si algo falla (rollback)

- Apagar `pago_marketplace` → vuelve a simular (cero cobro real)
- Apagar `identidad_gate_activa` → vuelve sin gate
- Cancelar el pago del test para recuperar la plata

---

## 7. Pendientes NO bloqueantes (post go-live, con ticket)

- **Token refresh automático** de MP (los tokens del médico expiran ~6 meses; hoy
  reconexión manual). Falta un cron.
- **Dashboard de comisiones** para que el médico vea su desglose.
- **Facturación AFIP** (emitir comprobantes de comisión).
- **Hardening RLS** del gate de identidad (contra médico malicioso) — antes de abrir
  el registro público.
