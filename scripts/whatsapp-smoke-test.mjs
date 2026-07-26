// Smoke test de las plantillas WhatsApp aprobadas (A y B) — manda 1 mensaje de cada
// una a un número, para verificar que rinden bien con sus variables ANTES de prender
// el flag en prod. Usa las credenciales Twilio de .env.local.
//
// Uso:  node scripts/whatsapp-smoke-test.mjs +5491140289141
//
// NO toca la DB ni el flag: llama directo a la API de Twilio (igual que enviarTwilio).

import fs from "node:fs";

// Cargar .env.local (solo las claves Twilio)
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const SID = env.TWILIO_ACCOUNT_SID;
const TOKEN = env.TWILIO_AUTH_TOKEN;
const FROM = env.TWILIO_WHATSAPP_FROM;
const TO = process.argv[2];

if (!SID || !TOKEN || !FROM) { console.error("Faltan creds Twilio en .env.local"); process.exit(1); }
if (!TO) { console.error("Pasá el número destino, ej: node scripts/whatsapp-smoke-test.mjs +5491140289141"); process.exit(1); }

// ContentSids de las plantillas aprobadas (igual que src/lib/whatsapp.ts)
const PLANTILLAS = [
  { nombre: "A — docto_aceptar_paciente_v2", sid: "HX25f4187f6a159560fe86ed3087ceb8ca", vars: { "1": "Diego", "2": "Juan Pérez" } },
  { nombre: "B — docto_paciente_esperando_v2", sid: "HX8023671239ec07bdd66e6e238438b81b", vars: { "1": "Diego", "2": "un paciente" } },
];

async function enviar(p) {
  const body = new URLSearchParams();
  body.set("From", FROM);
  body.set("To", `whatsapp:${TO}`);
  body.set("ContentSid", p.sid);
  body.set("ContentVariables", JSON.stringify(p.vars));

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${SID}:${TOKEN}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (res.ok) {
    console.log(`✓ ${p.nombre} → sid ${json.sid} status ${json.status}`);
  } else {
    console.error(`✗ ${p.nombre} → ${res.status} code ${json.code}: ${json.message}`);
  }
}

console.log(`Enviando 2 plantillas a ${TO} desde ${FROM}...`);
for (const p of PLANTILLAS) await enviar(p);
console.log("Listo. Revisá el WhatsApp.");
