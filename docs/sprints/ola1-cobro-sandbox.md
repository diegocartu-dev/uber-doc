# Ola 1 — Cobro real end-to-end en sandbox

> Sprint MP refund — Ola 1 (ver `POLITICA_REEMBOLSOS_DOCTO.md` sección 8).
> **Estado: VALIDADA** (2026-05-30). Cobro + vendedor + webhook probados con evidencia empírica.
> El único paso bloqueado fue completar el pago dentro del checkout sandbox de MP (bug externo de MP, ver abajo).

## Objetivo
Validar el cobro real de Consulta Inmediata (CI) contra el sandbox de Mercado Pago,
en un Preview aislado, sin prender el kill switch `pago_marketplace` en producción.

## Setup usado

| Parte | Valor | Modo |
|---|---|---|
| Preview | `uber-doc-git-feat-mp-ola1-cobro-real` (deploy `uber-13ovhpr2y`) | aislado |
| Vendedor (médico) | `diegocartu@gmail.com` (medico `f9a9644d`) — mp_user `3405160162` | TEST (`live_mode=false`) |
| App / marketplace | `MP_ACCESS_TOKEN_TEST` (scope Preview) | TEST |
| Comprador | tarjeta de test APRO `5031 7557 3453 0604` | TEST |
| Flag de cobro | `OVERRIDE_FLAG_PAGO_MARKETPLACE=true` — **branch-scoped** a esta rama | aislado |
| Consulta de prueba | `effac430-d48c-4e23-b7d4-2832ba0e703a` ($30.000) | — |

## Resultados — qué quedó VALIDADO (evidencia empírica)

### 1. Flag de cobro real activo en el preview
- `POST /api/pago/simular` → **404** (deshabilitado) = `pago_marketplace` ON vía override. Correcto.

### 2. Cobro real (`crear-v2`) + vendedor correcto
- `POST /api/pago/crear-v2` → **200**, redirige a `sandbox.mercadopago.com.ar`.
- Preferencia creada con `preference-id=3405160162-...` → **el collector es el vendedor de test** `3405160162`.
- **Blocker del 19/05 ("una de las partes es de prueba") RESUELTO**: las 3 partes alineadas en TEST.

### 3. Webhook real (`/api/pago/webhook`) — validado por simulador
Como el checkout sandbox está roto (ver blocker), se validó el webhook sin depender de él:
creando un pago REAL en el sandbox vía API directa (`scripts/validar-webhook-ola1.ts`) y
disparando el webhook firmado (HMAC) desde el navegador.

- Pago real creado: `payment_id=1327301998`, `status=approved`, `external_reference=consulta:effac430…`.
- `POST /api/pago/webhook` con firma HMAC válida → **HTTP 200 `{received:true}`**.
- Estado de la consulta tras el webhook (verificado en DB de producción):

| Campo | Valor |
|---|---|
| estado | `aceptada` → **`en_curso`** |
| pago_id | **`1327301998`** (real) |
| mp_status | **`approved`** |
| monto | 30000 |
| mp_application_fee | 1230.00 |
| mp_net_amount_medico | 28770.00 |

> Nota: el fee 1230 es el de procesamiento de MP (el pago de prueba se creó por API sin split);
> en el flujo real con checkout ese campo lleva el `marketplace_fee` de Docto (~10%).
> Lo validado es que el webhook recibe, consulta el pago, marca `pago_id` real y deja estado consistente.

## Blocker externo (NO es de Docto)
- Completar el pago dentro del **checkout sandbox de MP** falla con **`ERR_TOO_MANY_REDIRECTS`**
  al loguear test users. Es un bug **conocido y documentado** del sandbox de MP
  (ver `docs/qa/workaround-pago-simulado.md`), no del código de Docto.
- En producción este paso lo ejecuta el comprador real en MP producción, sin ese bug.

## Hallazgos del camino (para no repetir)
1. **Cuenta MP de test atada a `diegocartu@gmail.com`** (`f9a9644d`, mp_user `3405160162`, `live_mode=false`).
   Se usó esa para evitar tocar la whitelist y el OAuth de producción.
2. **`MP_TOKEN_ENCRYPTION_KEY` del preview estaba corrupta** (trailing `\n`, 66 vs 64 chars reales).
   El token del médico se encripta en el callback de prod, así que el preview no podía desencriptarlo →
   `crear-v2` daba 500. Se alineó la key del preview (branch-scoped) con la de producción.
3. **Franja de disponibilidad CI** (`disponible_desde`/`disponible_hasta`) es por hora del día;
   el médico aparecía "no disponible" fuera de su franja.
4. **MP sandbox rechaza ciertos `payer.email`** ("Payer email forbidden") — usar un email genérico.

## Limpieza pendiente (post-pruebas, NO ahora)
- Quitar `3410484183` (cuenta real) de `MP_TEST_SELLERS_WHITELIST` o documentar por qué está.
- Env vars branch-scoped del preview (`OVERRIDE_FLAG_PAGO_MARKETPLACE`, `MP_TOKEN_ENCRYPTION_KEY`) — limpiar al cerrar.
- Password seteado a `diegocartu@gmail.com` (cuenta de pruebas) y franja extendida — revertir si corresponde.

## Qué queda para la Ola 2 (refund real)
Según `POLITICA_REEMBOLSOS_DOCTO.md` sección 8:
- **2A** — Función refund `POST /v1/payments/{pago_id}/refunds` con token del médico.
- **2B** — `cancelaciones.ts` dispara el refund real (hoy solo marca `reintegro_estado`). Firma intacta, no-op sin `pago_id`.
- **2C** — Columna `reintegro_estado` en `consultas` + **retirar crédito de 45 días** + ajustar cron `cerrar-huerfanas`.

> El `pago_id` real ya validado en esta ola (`1327301998`) es exactamente lo que la Ola 2 necesita para refundear.
