# Ola 1 — Cobro real end-to-end en sandbox

> Sprint MP refund — Ola 1 (ver `POLITICA_REEMBOLSOS_DOCTO.md` sección 8).
> Estado: validación en curso. NO mergear hasta E2E OK + gate de Diego.

## Objetivo
Validar el cobro real de Consulta Inmediata (CI) contra el sandbox de Mercado Pago,
en un Preview aislado, sin prender el kill switch `pago_marketplace` en producción.

## Setup de la validación

| Parte | Valor | Modo |
|---|---|---|
| Vendedor (médico) | `diegocartu@gmail.com` (medico `f9a9644d`) — mp_user `3405160162` | TEST (`live_mode=false`) |
| App / marketplace | `MP_ACCESS_TOKEN_TEST` (scope Preview) | TEST |
| Comprador (paciente) | cuenta compradora de test de MP (al momento de pagar) | TEST |
| Flag de cobro | `OVERRIDE_FLAG_PAGO_MARKETPLACE=true` — branch-scoped a esta rama | aislado |

## Por qué este setup
- Se usa el médico `f9a9644d` porque su cuenta MP ya está conectada en `live_mode=false`,
  evitando tocar la whitelist de producción y el OAuth de prod.
- `OVERRIDE_FLAG` se setea **solo para esta rama** (no scope Preview global) para no
  afectar los previews de otras sesiones ni la simulación de pago.
- `medico.test` (`f52f79f9`, cuenta real `3410484183`) y la whitelist quedan intactos;
  su limpieza es una tarea separada.

## Checklist E2E (pendiente de correr — gate de Diego)
- [ ] Preview deploy levantado con la env var aplicada
- [ ] Médico `f9a9644d` disponible para CI con precio configurado
- [ ] Paciente de test solicita CI → médico acepta
- [ ] Paciente paga con cuenta/tarjeta de test → checkout MP real (sandbox)
- [ ] Webhook recibe `approved` → consulta pasa a `pagada` con `pago_id` real
- [ ] Verificar `pago_id`, `mp_application_fee`, `mp_net_amount_medico` en DB

## Riesgos a vigilar
- Blocker del 19/05 ("una de las partes es de prueba"): mitigado al alinear las 3 partes en TEST.
- Producción intacta: no se prende `pago_marketplace`, no se toca whitelist ni `medico.test`.
