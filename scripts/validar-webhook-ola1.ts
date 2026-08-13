// Ola 1 — Validación del webhook MP sin depender del checkout (redirect loop sandbox).
// 1) Crea un pago REAL en el sandbox vía API directa con external_reference a la consulta.
// 2) Construye la firma HMAC del webhook (igual que MP) para dispararlo después desde el navegador.
import { createHmac, randomUUID } from "crypto";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync("/tmp/preview.env", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      let v = l.slice(i + 1).trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      return [l.slice(0, i), v];
    })
);

const ACCESS = env.MP_ACCESS_TOKEN_TEST;
const PUBKEY = env.MP_PUBLIC_KEY_TEST;
const SECRET = env.MP_WEBHOOK_SECRET;
const CONSULTA_ID = "effac430-d48c-4e23-b7d4-2832ba0e703a";
const MONTO = 30000;

async function main() {
  // 1) Tokenizar la tarjeta de test APRO
  const tokRes = await fetch(`https://api.mercadopago.com/v1/card_tokens?public_key=${PUBKEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      card_number: "5031755734530604",
      expiration_month: 11,
      expiration_year: 2030,
      security_code: "123",
      cardholder: { name: "APRO", identification: { type: "DNI", number: "12345678" } },
    }),
  });
  const tok = await tokRes.json();
  if (!tok.id) { console.log("ERROR card_token:", JSON.stringify(tok)); return; }
  console.log("✓ Card token:", String(tok.id).slice(0, 10) + "…");

  // 2) Crear el pago (titular APRO fuerza aprobación en sandbox)
  const payRes = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ACCESS}`,
      "X-Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify({
      transaction_amount: MONTO,
      token: tok.id,
      description: "Consulta de Clínica médica — Dr. Diego Gonzalez",
      installments: 1,
      payment_method_id: "master",
      payer: { email: "comprador.ola1.docto@gmail.com" },
      external_reference: `consulta:${CONSULTA_ID}`,
    }),
  });
  const pay = await payRes.json();
  if (!pay.id) { console.log("ERROR payment:", JSON.stringify(pay)); return; }
  console.log("✓ Pago creado en sandbox:");
  console.log("    payment_id:", pay.id);
  console.log("    status:", pay.status, "| status_detail:", pay.status_detail);
  console.log("    transaction_amount:", pay.transaction_amount);
  console.log("    external_reference:", pay.external_reference);

  // 3) Construir la firma HMAC del webhook (igual que verificarFirmaMP)
  const paymentId = String(pay.id);
  const ts = Date.now().toString();
  const reqId = randomUUID();
  const manifest = `id:${paymentId};request-id:${reqId};ts:${ts};`;
  const v1 = createHmac("sha256", SECRET).update(manifest).digest("hex");

  console.log("\n=== POST AL WEBHOOK (ejecutar desde el navegador, mismo origen del preview) ===");
  console.log(JSON.stringify({
    paymentId,
    headers: { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": reqId },
    body: { action: "payment.created", data: { id: paymentId } },
  }, null, 2));
}
main();
