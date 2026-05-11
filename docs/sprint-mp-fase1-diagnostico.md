# Diagnóstico MP — Sprint Marketplace Fase 1

**Fecha:** 2026-05-12
**Autor:** Marcos (Distinguished Engineer)

---

## 1. Dónde vive el código de pago hoy

**API Routes:**
- `src/app/api/pago/route.ts` — Crea preferencia de MP (Checkout Pro). 135 líneas.
- `src/app/api/pago/simular/route.ts` — Simulador: actualiza consulta a "pagada" sin tocar MP. 45 líneas.
- `src/app/api/pago/webhook/route.ts` — Webhook que recibe notificaciones de MP. 87 líneas.

**Frontend:**
- `src/app/sala-espera/[consultaId]/SalaEsperaCliente.tsx` — Sala de espera CI. Botón de pago MP real + simulador.
- `src/app/turno/[turnoId]/pago/PagoPendiente.tsx` — Pago de turnos programados. Solo simulación, NO llama a MP.
- `src/app/consulta/[id]/confirmacion/EsperaVideo.tsx` — Post-pago CI. Polling de estado.

**Server Action:**
- `src/app/clinica/[medicoId]/turnos/actions.ts` (línea 56) — `confirmarPagoTurno()`: cambia estado a "confirmado" sin MP.

**Health check:**
- `src/app/api/admin/integraciones/route.ts` (líneas 103-118) — `checkMercadoPago()` verifica token con GET /users/me.

## 2. Qué SDK / librería usa

**SDK oficial v2** — `"mercadopago": "^2.12.0"` en package.json.

Importa `MercadoPagoConfig` y `Preference` en `src/app/api/pago/route.ts`.
El webhook usa `fetch` directo a la API REST de MP (no SDK).

## 3. Se usa Checkout Pro, Checkout API, o Bricks

**Checkout Pro exclusivamente.** Crea `Preference` con items, back_urls, notification_url y external_reference. Devuelve `init_point`.

No hay Checkout API (no tokeniza tarjeta). No hay Bricks (no hay componentes de UI de MP en frontend).

## 4. Flujo actual

**Preferencia + redirect.**

1. Frontend POST a `/api/pago` con `consultaId`
2. Backend crea `Preference`, obtiene `init_point`
3. Frontend redirige a MP (`window.location.href = init_point`)
4. Usuario paga en MP
5. MP redirige a `back_urls.success` → `/consulta/{id}/info-medica?redirect=/consulta/{id}/confirmacion`
6. MP envía webhook a `/api/pago/webhook`
7. Webhook verifica firma HMAC, consulta pago, si `approved` → actualiza consulta a `pagada`

**Turnos programados NO usan MP.** `confirmarPagoTurno()` cambia estado directo. Botón dice "Simular pago aprobado".

## 5. Dónde se guarda el payment_id de MP

**NO SE GUARDA.** Ni para consultas ni para turnos.

- Tabla `consultas`: no tiene columna payment_id, pago_id, ni preference_id.
- Tabla `turnos`: tiene columna `pago_id text` (migración 019) pero NUNCA se escribe.
- El webhook solo hace `update({ estado: "pagada" })` usando `external_reference` (consultaId) como lookup. El ID del pago de MP se pierde.

**Agujero crítico para reconciliación y reembolsos.**

## 6. Webhook — estado en producción

**Existe** en `src/app/api/pago/webhook/route.ts`. Procesa `payment.created` y `payment.updated`.

**ROTO EN PRODUCCIÓN:** `MP_WEBHOOK_SECRET` no está configurada en Vercel. El webhook verifica firma HMAC con esa variable; como no existe, rechaza todo request con 401. Los pagos dependen enteramente del redirect de `back_urls`.

## 7. Tokens MP en la DB

**No hay ninguno.** No existe OAuth flow para médicos. El único token es `MP_ACCESS_TOKEN` como variable de entorno (cuenta única de Docto).

## 8. Variables de entorno MP en Vercel

| Variable | Configurada | Usada en código |
|----------|-------------|-----------------|
| `MP_ACCESS_TOKEN` | Sí | Sí — route.ts, webhook, health check |
| `MP_PUBLIC_KEY` | Sí | **No** — ningún archivo la importa |
| `MP_WEBHOOK_SECRET` | **No** | Sí — webhook.ts (por eso está roto) |

---

## Hallazgos críticos

1. **Webhook roto** — falta `MP_WEBHOOK_SECRET` en Vercel. No bloquea Fase 1 pero hay que arreglarlo.
2. **Sin trazabilidad de pagos** — payment_id no se persiste. Crítico para Fase 2 (split payments).
3. **Turnos no pasan por MP** — usan simulación directa. Fase 2 debe cubrir ambos flujos.
4. **Token de cuenta única** — no hay multi-seller. Fase 1 construye el cimiento OAuth.
5. **MP_PUBLIC_KEY sin uso** — configurada pero nadie la importa.
