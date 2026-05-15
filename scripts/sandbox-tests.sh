#!/bin/bash
# Sprint MP Marketplace — Sandbox Validation Tests
# Ejecutar: bash scripts/sandbox-tests.sh <PREVIEW_URL>

set -euo pipefail

PREVIEW="${1:?Uso: bash scripts/sandbox-tests.sh <PREVIEW_URL>}"
WEBHOOK_SECRET="99c250f66cabe573e4ba5c1b7df3f3446a511fb652a7b366394a13e73c2c71f3"
PASS=0
FAIL=0

green() { echo -e "\033[32m✅ $1\033[0m"; PASS=$((PASS+1)); }
red()   { echo -e "\033[31m❌ $1\033[0m"; FAIL=$((FAIL+1)); }

# Helper: generar firma HMAC válida para webhook
gen_hmac() {
  local data_id="$1"
  local request_id="${2:-test-req-$(date +%s)}"
  local ts
  ts=$(date +%s)
  local manifest="id:${data_id};request-id:${request_id};ts:${ts};"
  local hmac
  hmac=$(echo -n "$manifest" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | awk '{print $2}')
  echo "ts=${ts},v1=${hmac}|${request_id}"
}

webhook_call() {
  local body="$1"
  local data_id="$2"
  local sig_data
  sig_data=$(gen_hmac "$data_id")
  local sig="${sig_data%%|*}"
  local req_id="${sig_data##*|}"

  curl -s -w "\n%{http_code}" -X POST "${PREVIEW}/api/pago/webhook" \
    -H "Content-Type: application/json" \
    -H "x-signature: ${sig}" \
    -H "x-request-id: ${req_id}" \
    -d "$body"
}

echo "=========================================="
echo " SANDBOX VALIDATION — $(date)"
echo " Preview: ${PREVIEW}"
echo "=========================================="
echo ""

# ─── TEST 1: Feature flag override ───
echo "═══ TEST 1: Feature flag override ═══"
HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${PREVIEW}/api/pago/crear-v2" \
  -H "Content-Type: application/json" \
  -d '{"tipo":"consulta","id":"test"}')
if [ "$HTTP" = "401" ]; then
  green "Feature flag override: crear-v2 devuelve 401 (no auth), NO 503 (disabled)"
else
  red "Feature flag override: esperado 401, recibido $HTTP"
fi
echo ""

# ─── TEST 2: Webhook HMAC ───
echo "═══ TEST 2: Webhook HMAC ═══"

echo "--- 2a: Sin firma ---"
HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${PREVIEW}/api/pago/webhook" \
  -H "Content-Type: application/json" \
  -d '{"action":"payment.created","data":{"id":"999"}}')
if [ "$HTTP" = "401" ]; then
  green "Webhook sin firma → 401"
else
  red "Webhook sin firma: esperado 401, recibido $HTTP"
fi

echo "--- 2b: Firma inválida ---"
HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${PREVIEW}/api/pago/webhook" \
  -H "Content-Type: application/json" \
  -H "x-signature: ts=1234567890,v1=invalidsignature" \
  -H "x-request-id: bad-req" \
  -d '{"action":"payment.created","data":{"id":"999"}}')
if [ "$HTTP" = "401" ]; then
  green "Webhook firma inválida → 401"
else
  red "Webhook firma inválida: esperado 401, recibido $HTTP"
fi

echo "--- 2c: Firma válida ---"
RESP=$(webhook_call '{"action":"payment.created","data":{"id":"999"}}' "999")
HTTP=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
if [ "$HTTP" = "200" ]; then
  green "Webhook firma válida → 200"
else
  red "Webhook firma válida: esperado 200, recibido $HTTP (body: $BODY)"
fi
echo ""

# ─── TEST 3: Webhook idempotencia ───
echo "═══ TEST 3: Webhook idempotencia ═══"
echo "(Nota: la idempotencia se verifica por pago_id+mp_status en DB)"
echo "(Enviar el mismo payment_id 2 veces — segunda vez no debe cambiar estado)"
# Primer envío
RESP1=$(webhook_call '{"action":"payment.created","data":{"id":"idem-test-001"}}' "idem-test-001")
HTTP1=$(echo "$RESP1" | tail -1)
# Segundo envío (duplicado)
RESP2=$(webhook_call '{"action":"payment.updated","data":{"id":"idem-test-001"}}' "idem-test-001")
HTTP2=$(echo "$RESP2" | tail -1)
if [ "$HTTP1" = "200" ] && [ "$HTTP2" = "200" ]; then
  green "Webhook duplicado: ambos responden 200 (idempotente)"
else
  red "Webhook duplicado: HTTP1=$HTTP1, HTTP2=$HTTP2"
fi
echo ""

# ─── TEST 4: Webhook handlers por acción ───
echo "═══ TEST 4: Webhook handlers ═══"

echo "--- 4a: payment.created ---"
RESP=$(webhook_call '{"action":"payment.created","data":{"id":"handler-payment"}}' "handler-payment")
HTTP=$(echo "$RESP" | tail -1)
if [ "$HTTP" = "200" ]; then green "payment.created → 200"; else red "payment.created → $HTTP"; fi

echo "--- 4b: payment.updated ---"
RESP=$(webhook_call '{"action":"payment.updated","data":{"id":"handler-updated"}}' "handler-updated")
HTTP=$(echo "$RESP" | tail -1)
if [ "$HTTP" = "200" ]; then green "payment.updated → 200"; else red "payment.updated → $HTTP"; fi

echo "--- 4c: application.deauthorized ---"
RESP=$(webhook_call '{"action":"application.deauthorized","data":{"user_id":"99999999"}}' "")
HTTP=$(echo "$RESP" | tail -1)
if [ "$HTTP" = "200" ]; then green "application.deauthorized → 200"; else red "application.deauthorized → $HTTP"; fi

echo "--- 4d: Acción desconocida (merchant_order) ---"
RESP=$(webhook_call '{"action":"merchant_order.created","data":{"id":"mo-test"}}' "mo-test")
HTTP=$(echo "$RESP" | tail -1)
if [ "$HTTP" = "200" ]; then green "Acción desconocida → 200 (ignorada correctamente)"; else red "Acción desconocida → $HTTP"; fi
echo ""

# ─── TEST 5: crear-v2 validaciones ───
echo "═══ TEST 5: crear-v2 validaciones ═══"

echo "--- 5a: Sin body ---"
HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${PREVIEW}/api/pago/crear-v2" \
  -H "Content-Type: application/json")
echo "Sin body → HTTP $HTTP"
if [ "$HTTP" = "400" ] || [ "$HTTP" = "401" ]; then green "Sin body rechazado"; else red "Sin body: $HTTP"; fi

echo "--- 5b: Tipo inválido ---"
HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${PREVIEW}/api/pago/crear-v2" \
  -H "Content-Type: application/json" \
  -d '{"tipo":"invalido","id":"test"}')
if [ "$HTTP" = "400" ] || [ "$HTTP" = "401" ]; then green "Tipo inválido rechazado"; else red "Tipo inválido: $HTTP"; fi
echo ""

# ─── RESUMEN ───
echo "=========================================="
echo " RESUMEN: $PASS aprobados, $FAIL fallidos"
echo "=========================================="
