# Camino al lanzamiento real — Docto V1.0

> Estado al 07/06/2026: **V1.0 feature-complete en producción** (docto.com.ar), **beta cerrada**. Lo que sigue es el camino para abrir al mundo. Checklist accionable.

## Dónde estamos
- Flujos core en prod y probados: **CI + turnos + video (LiveKit) + receta + evolución + HC + orden + alertas del médico**, firma electrónica, REFEPS (SISA produccion), vademécum CNPM.
- **Registro cerrado:** gateado por `BETA_PASSWORD=DoctoTest2026!` (ver `docs/REGISTRO_BETA_GATE.md`).
- **Pagos:** split de comisión configurado; el **cobro real está gateado por whitelist** (`MP_PAGO_REAL_WHITELIST`) hasta validarlo con plata real.

---

## 🎯 Fase 1 — Prueba real de pagos (el hito que falta)
**Objetivo:** una consulta real, con plata real, y que la comisión caiga bien. Es lo único que separa el "funciona" del "se puede cobrar".

**Par de prueba** (ambos en `MP_PAGO_REAL_WHITELIST` + `es_cuenta_test=true` → aislados del carril real, pero **pagan real**):
- Médico: `paancogliando@gmail.com`
- Paciente: `pbuenoloco@gmail.com`

**Pasos:**
1. [ ] Los dos se **registran** en docto.com.ar (contraseña beta `DoctoTest2026!`).
2. [ ] Diego **aprueba al médico** en `/admin/medicos` (`verificado=true`, `estado_registro=aprobado`).
3. [ ] El médico **conecta su Mercado Pago** (cuenta real, `live_mode=true`) vía OAuth.
4. [ ] **Verificar antes de cobrar:** ambos emails en `MP_PAGO_REAL_WHITELIST` (con **deploy fresco**, no redeploy), `es_cuenta_test=true` en ambos, MP del médico en **live** (no sandbox).
5. [ ] El paciente pide una **CI → paga con tarjeta real**.
6. [ ] **Verificar el split:** el médico recibe su parte; la comisión (founder 5% / tradicional 10%) cae en **GREBA** (collector `28443305` / `diegocartu@me.com`).
7. [ ] Verificar que la consulta completa (video + documentación + receta + evolución + orden) anda end-to-end **con pago real**.

**A vigilar:** el token MP de prod es **GREBA** (la separación con SRL es posterior). E2E de MP nunca en prod salvo esta prueba controlada con el par whitelisteado.

---

## 🔧 Fase 2 — Correcciones (si algo falla en la prueba real)
- Cualquier bug que aparezca → **fix puntual** (un commit por ticket, gates de Roberto/Sofia si corresponde).
- No abrir el registro hasta que la prueba real de pagos esté 100% OK.

---

## 🚀 Fase 3 — Largar (abrir el registro)
Hoy el registro está cerrado por `BETA_PASSWORD`. Para abrir:
- **Opción A — abrir total:** sacar `/auth/register` y `/auth/registro-medico` de `BETA_PROTECTED` en `src/middleware.ts` (**cambio de código**), **manteniendo `BETA_PASSWORD` seteada** (sino el sitio loopea — ver doc beta-gate).
- **Opción B — lanzamiento controlado:** mantener el gate y dar la contraseña a un grupo inicial.
- **Habilitar el cobro real general:** cuando esté validado, sacar la dependencia de `MP_PAGO_REAL_WHITELIST` (flag `pago_marketplace` o equivalente) para que cualquier médico cobre real. Decisión de Diego.

---

## ✅ Checklist pre-lanzamiento
- [ ] Prueba real de pagos OK (Fase 1).
- [ ] Storage buckets verificados (`npx tsx scripts/verify-storage-buckets.ts`).
- [ ] `BETA_PASSWORD` "All Preview" en el dashboard de Vercel (deja de romper el CI en cada PR).
- [ ] Decidir: abrir registro (Opción A/B) + habilitar cobro real general.
- [x] Canal de soporte: `soporte@docto.com.ar` (en los menús de paciente y médico).

---

## Deuda conocida (no bloqueante para lanzar)
- **PanelEstudios** acoplado a `consultas` para turnos → los estudios temporales del turno no se gestionan. Si los turnos van a adjuntar estudios durante la llamada, hay que hacer esa cadena channel-aware.
- **2 PRs viejos abiertos:** `#57` (legacy historia clínica + nova, superado por lo construido hoy) y `#129` (voz de Nova) → decisión de Diego cerrarlos.
- **Unit tests del motor** (`node:test`) no corren en el CI (solo Playwright E2E chromium). Sugerencia: step `npx tsx --test 'src/**/*.test.ts'`.
- **CI mobile-safari** pendiente (hoy solo chromium). Pre-F&F: `npx playwright install webkit` + `--project=mobile-safari`.

---

## Operativo
- **Diego:** `/permissions` allow `Bash(gh pr merge *)` + `BETA_PASSWORD` "All Preview" en Vercel (corta la fricción de cada PR).
- **Post-lanzamiento:** monitorear errores en vivo; soporte por `soporte@docto.com.ar`.

---

## Resumen de una línea
**Falta una sola cosa de verdad para cobrar: la prueba real de pagos (Fase 1).** El resto es decidir cuándo y cómo abrir la puerta.
