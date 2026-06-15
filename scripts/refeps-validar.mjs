// Valida DNIs contra REFEPS (Bus FHIR real), replicando src/lib/refeps/client.ts.
// Uso: node scripts/refeps-validar.mjs <dni> [<dni> ...]
// Solo lectura (Practitioner read). Credenciales de .env.local.
import fs from "fs";
import { createHmac } from "crypto";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const SYSTEM_ID = env.REFEPS_SYSTEM_ID?.trim();
const CREDENTIAL_ID = env.REFEPS_CREDENTIAL_ID?.trim();
const TOKEN_SECRET = env.REFEPS_TOKEN_SECRET?.trim();
if (!SYSTEM_ID || !CREDENTIAL_ID || !TOKEN_SECRET) { console.error("Faltan REFEPS_* en .env.local"); process.exit(1); }

const FHIR_BASE_URL = "https://bus.msal.gob.ar/fhir";
const TOKEN_ENDPOINT = "https://bus.msal.gob.ar/bus-auth/v2/auth";
const REFEPS_SYS = "https://sisa.msal.gov.ar/REFEPS";

const b64u = (s) => Buffer.from(s, "utf8").toString("base64url");

function buildJWT() {
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: "https://docto.com.ar", sub: SYSTEM_ID, aud: TOKEN_ENDPOINT, iat: now, exp: now + 900, scope: "Practitioner/*.read", ident: CREDENTIAL_ID, name: "docto", role: "user" };
  const head = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64u(JSON.stringify(claims));
  const sig = createHmac("sha256", TOKEN_SECRET).update(`${head}.${payload}`).digest("base64url");
  return `${head}.${payload}.${sig}`;
}

async function token() {
  const r = await fetch(TOKEN_ENDPOINT, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grantType: "client_credentials", scope: "Practitioner/*.read", clientAssertionType: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer", clientAssertion: buildJWT() }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`TOKEN ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  if (!d.accessToken) throw new Error("sin accessToken");
  return d.accessToken;
}

async function buscar(dni, tk) {
  const refepsId = dni.startsWith("5410") && dni.length > 10 ? dni : `5410${dni}`;
  const url = new URL(`${FHIR_BASE_URL}/Practitioner`);
  url.searchParams.set("identifier", `${REFEPS_SYS}|${refepsId}`);
  url.searchParams.set("_format", "json");
  const r = await fetch(url, { headers: { Authorization: `Bearer ${tk}`, Accept: "application/fhir+json" }, signal: AbortSignal.timeout(10000) });
  if (r.status === 404) return { http: 404, practitioner: null };
  if (!r.ok) throw new Error(`PRACT ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  return { http: r.status, practitioner: data.entry?.[0]?.resource ?? null };
}

const dnis = process.argv.slice(2);
if (!dnis.length) { console.error("uso: node scripts/refeps-validar.mjs <dni> [dni...]"); process.exit(1); }

console.log("Pidiendo token al Bus FHIR...");
const tk = await token();
console.log("✓ Token OK (el bus responde)\n");

for (const dni of dnis) {
  try {
    const { http, practitioner: p } = await buscar(dni, tk);
    if (!p) { console.log(`DNI ${dni}: ✗ NO ENCONTRADO en REFEPS (HTTP ${http})\n`); continue; }
    const nom = (p.name?.[0]?.given?.join(" ") ?? "") + " " + (p.name?.[0]?.family ?? "");
    const mats = [];
    for (const q of p.qualification ?? []) {
      let hab = false, jur = "";
      for (const e of q.extension ?? []) {
        if (e.url?.includes("MatriculaHabilitada")) hab = e.valueBoolean === true;
        if (e.url?.includes("JurisdMatricula") && e.valueCoding) jur = e.valueCoding.display ?? e.valueCoding.code ?? "";
      }
      for (const id of q.identifier ?? []) mats.push({ numero: id.value, jur, hab });
    }
    console.log(`DNI ${dni}: ✓ ENCONTRADO — ${nom.trim()} | active=${p.active}`);
    if (mats.length) mats.forEach((m) => console.log(`   ${m.hab ? "✓ HABILITADA" : "✗ no habilitada"}  Mat ${m.numero}  ${m.jur}`));
    else console.log("   (sin matrículas en el registro)");
    console.log("");
  } catch (e) { console.log(`DNI ${dni}: ERROR — ${e.message}\n`); }
}
