# Runbook — Validación E2E del split real (Ola 3, gate pre-go-live)

> **Objetivo:** confirmar empíricamente que un cobro con `marketplace_fee` y su
> posterior reembolso debitan de la cuenta correcta: el **neto** desde la cuenta
> del **médico** (collector), el **fee** desde la cuenta de **Docto** (marketplace),
> y el paciente recupera el **100%**. El sandbox NO puede validar esto (usa una
> sola cuenta). Es el último gate duro antes de prender el marketplace.

> **Regla inviolable:** se corre en un **Preview deploy con
> `OVERRIDE_FLAG_PAGO_MARKETPLACE=true`**. **NUNCA** se prende el flag de DB
> `pago_marketplace` en producción durante la validación. Ese flag se lee de una
> tabla de DB **compartida por todos los deploys** (`getFlag` en
> `src/lib/feature-flags.ts`), así que prenderlo expondría a TODOS los usuarios de
> docto.com.ar al cobro real de golpe. El override por env var actúa **solo en ese
> deploy de Preview** — es el mecanismo de aislamiento correcto.

---

## Fase 0 — Prerrequisitos (Diego)

- [ ] **3 cuentas Mercado Pago reales y distintas:**
  - **Docto** (marketplace / recibe el `application_fee`) → su access token va en `MP_ACCESS_TOKEN`. Definir si es la cuenta GREBA actual o la SRL real antes de empezar (ver nota MP_ACCESS_TOKEN abajo).
  - **Médico** (collector / familiar) → se conecta por OAuth dentro de la app.
  - **Paciente** (pagador / familiar) → paga desde Checkout Pro.
  - Las tres deben poder operar plata real (no cuentas de test del sandbox).
- [ ] **Whitelist** de beta cerrada con los mails del médico y paciente familiares (extender la lista de PR #87) para que nadie más se cuele.
- [ ] **Saldo** en la cuenta del paciente para pagar la consulta de prueba.
- [ ] Plan de **reintegro**: Diego le devuelve la plata a los familiares al cerrar la prueba.

> **Nota MP_ACCESS_TOKEN:** hoy el token de prod es la cuenta **GREBA**
> (28443305, diegocartu@me.com), pendiente de separar con la SRL. Si la prueba
> usa la cuenta Docto "real", setear ese token **scopeado a Preview**, no pisar
> el de producción.

## Fase 1 — Entorno (Diego, con guía mía)

- [ ] Identificar el **Preview deploy** a usar. El de la **PR #104** es ideal: incluye el código de refund (3B) + el cron + el dashboard de reembolsos (3D) para observar en vivo.
- [ ] Setear en ese Preview (env scope = **Preview**, no Production):
  - `OVERRIDE_FLAG_PAGO_MARKETPLACE=true`
  - `MP_ACCESS_TOKEN` = token de la cuenta **Docto** elegida (si difiere del de prod).
- [ ] Confirmar que el flag DB `pago_marketplace` **sigue en false** (prod intacto).
- [ ] El **médico familiar** entra al Preview, completa onboarding y **conecta su MP por OAuth** (`/medico/perfil` → conectar Mercado Pago). Verificar `medicos_mp_accounts.estado = 'activo'`.

## Fase 2 — Cobro real (happy path)

- [ ] Médico publica disponibilidad / un turno (o habilita CI).
- [ ] **Paciente familiar** recorre el camino real: elige médico → paga con Checkout Pro con **plata real** de su cuenta MP.
- [ ] Verificar transición: webhook → `consultas`/`turnos` pasa a `en_curso`/`confirmado`, con `pago_id`, `mp_application_fee`, `mp_net_amount_medico` persistidos.
- [ ] **Evidencia (regla de evidencia empírica):**
  - Captura del pago en el panel MP de la cuenta **médico** (debe ver el neto acreditado).
  - Captura en el panel MP de **Docto** (debe ver el `application_fee` liberado).
  - Fila de `consultas`/`turnos` con los tres campos MP poblados.

## Fase 3 — EL GATE: reembolso con split

- [ ] Cancelar con derecho a reembolso (paciente >48hs, o médico cancela).
- [ ] Verificar las **dos patas** (sección 2.1 política):
  - Pata médico: refund por `mp_net_amount_medico` **debita de la cuenta del médico**.
  - Pata Docto: refund por `mp_application_fee` **debita de la cuenta de Docto**.
  - El pago en MP queda `refunded` (suma = 100%).
- [ ] **Mirar el dashboard** `/admin/reembolsos` en el Preview: si todo sale OK, la cola queda vacía (no se encola nada). Si algo falla, aparece en "Pendientes".
- [ ] **Evidencia:**
  - Panel MP médico: débito del neto.
  - Panel MP Docto: débito del fee.
  - Panel MP paciente: acreditación del 100%.
  - `reintegro_estado = 'reembolsado'` en el recurso; `refunds_pendientes` sin fila activa.

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
- ✅ Cero impacto en producción (flag DB `pago_marketplace` nunca se prendió).

## Después del gate (NO parte de esta validación)

- TyC ajustados (ventana 48–71h) → Carolina.
- 3A (captura CVU) para cerrar el caso edge de cobertura manual.
- Recién entonces: decisión de go-live = prender `pago_marketplace` en prod.

---

*Documento operativo. La validación NO se considera cerrada sin la evidencia
empírica de las Fases 2 y 3 registrada (capturas de los 3 paneles MP + filas DB).*
