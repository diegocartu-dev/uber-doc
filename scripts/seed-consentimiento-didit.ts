/**
 * Siembra la versión del consentimiento de verificación de identidad (Didit)
 * en `versiones_textos_legales`. Idempotente (ON CONFLICT → UPDATE).
 *
 * Uso:  npx tsx scripts/seed-consentimiento-didit.ts
 *
 * Lee SUPABASE_ACCESS_TOKEN de .env.local y usa la Management API.
 */
import { createHash } from "crypto";
import { readFileSync } from "fs";
import {
  CONSENTIMIENTO_TIPO,
  CONSENTIMIENTO_VERSION,
  CONSENTIMIENTO_IDENTIDAD_TEXTO,
} from "../src/lib/didit/consentimiento";

const PROJECT_REF = "irpupskopjahbqqvckue";

function getAccessToken(): string {
  const env = readFileSync(".env.local", "utf8");
  const line = env
    .split("\n")
    .find((l) => l.startsWith("SUPABASE_ACCESS_TOKEN="));
  if (!line) throw new Error("No se encontró SUPABASE_ACCESS_TOKEN en .env.local");
  return line
    .slice("SUPABASE_ACCESS_TOKEN=".length)
    .trim()
    .replace(/^["']|["']$/g, "");
}

async function main() {
  const token = getAccessToken();
  const hash = createHash("sha256")
    .update(CONSENTIMIENTO_IDENTIDAD_TEXTO, "utf8")
    .digest("hex");

  const sql = `
    INSERT INTO versiones_textos_legales (tipo, version, texto_completo, hash_sha256)
    VALUES ($tipo$${CONSENTIMIENTO_TIPO}$tipo$, $ver$${CONSENTIMIENTO_VERSION}$ver$, $txt$${CONSENTIMIENTO_IDENTIDAD_TEXTO}$txt$, $hash$${hash}$hash$)
    ON CONFLICT (tipo, version)
    DO UPDATE SET texto_completo = EXCLUDED.texto_completo, hash_sha256 = EXCLUDED.hash_sha256
    RETURNING id, tipo, version, hash_sha256;
  `;

  const resp = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  const body = await resp.text();
  if (!resp.ok) {
    console.error(`Error (${resp.status}):`, body);
    process.exit(1);
  }
  console.log("✅ Consentimiento sembrado:");
  console.log("   hash SHA-256:", hash);
  console.log("   respuesta:", body);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
