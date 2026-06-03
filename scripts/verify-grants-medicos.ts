/**
 * Verificador de GRANTs de columna en la tabla `medicos`
 *
 * POR QUÉ EXISTE (incidente 2026-06-03):
 *   `public.medicos` usa grants SELECT columna-por-columna (no a nivel tabla),
 *   por el control de seguridad de 20260527_contacto_privado_medico.sql que
 *   oculta celular_personal/email_personal. Es FRÁGIL: todo ADD COLUMN futuro
 *   nace SIN grant y rompe en silencio cualquier SELECT de cliente que lo
 *   incluya (con error 42501 "permission denied"), tirando abajo a TODOS los
 *   médicos (caen en modo paciente, turnos/reservas caídos).
 *   Ver docs/security/2026-06-03-incidente-grant-medicos-didit.md
 *
 * QUÉ VALIDA (contra producción real):
 *   1. El SELECT real del dashboard (lo lee del código → auto-sync) corre como
 *      `authenticated` sin error 42501.
 *   2. El filtro de /clinica (WHERE identidad_validada) corre como authenticated.
 *   3. El perfil público /dr/[slug] corre como `anon` (lee identidad_validada).
 *   4. celular_personal y email_personal SIGUEN ocultas (auth y anon = false).
 *
 * USO (post-deploy / post-migración que toque `medicos`):
 *   npx tsx scripts/verify-grants-medicos.ts
 *
 * REQUIERE:
 *   SUPABASE_ACCESS_TOKEN en .env.local o entorno (Management API).
 *   No aplica DDL: todo corre en transacciones con ROLLBACK / read-only.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const PROJECT_REF = "irpupskopjahbqqvckue";
const MGMT_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

// ── cargar .env.local sin dependencias ──────────────────────────────────────
function loadEnvLocal() {
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  }
}

// ── extraer el SELECT del dashboard desde el código (auto-sync) ──────────────
function dashboardMedicoSelect(): string {
  const p = join(process.cwd(), "src/app/dashboard/page.tsx");
  const src = readFileSync(p, "utf8");
  // El SELECT del médico es el único .select("...") que incluye identidad_validada
  const m = src.match(/\.select\(\s*"([^"]*identidad_validada[^"]*)"\s*\)/);
  if (!m) {
    throw new Error(
      "No pude extraer el SELECT del dashboard (¿cambió page.tsx?). Revisar manualmente."
    );
  }
  return m[1];
}

async function runSql(query: string): Promise<{ ok: boolean; error?: string; rows?: unknown }> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error("Falta SUPABASE_ACCESS_TOKEN en .env.local o entorno.");
  const res = await fetch(MGMT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  if (data && typeof data === "object" && "message" in data) {
    return { ok: false, error: String((data as { message: string }).message) };
  }
  return { ok: true, rows: data };
}

type Check = { nombre: string; pasa: boolean; detalle: string };

async function main() {
  loadEnvLocal();
  const checks: Check[] = [];
  const dashSelect = dashboardMedicoSelect();

  // 1. SELECT exacto del dashboard como authenticated → no debe dar 42501
  {
    const r = await runSql(
      `BEGIN; SET LOCAL ROLE authenticated; SELECT ${dashSelect} FROM public.medicos LIMIT 1; ROLLBACK;`
    );
    checks.push({
      nombre: "Dashboard SELECT (role authenticated)",
      pasa: r.ok,
      detalle: r.ok ? `${dashSelect.split(",").length} columnas OK` : r.error!.split("\n")[0],
    });
  }

  // 2. Filtro de /clinica (WHERE identidad_validada) como authenticated
  {
    const r = await runSql(
      `BEGIN; SET LOCAL ROLE authenticated; SELECT id FROM public.medicos WHERE identidad_validada = true LIMIT 1; ROLLBACK;`
    );
    checks.push({
      nombre: "Filtro /clinica WHERE identidad_validada (authenticated)",
      pasa: r.ok,
      detalle: r.ok ? "OK" : r.error!.split("\n")[0],
    });
  }

  // 3. Perfil público /dr/[slug] como anon (lee identidad_validada)
  {
    const r = await runSql(
      `BEGIN; SET LOCAL ROLE anon; SELECT nombre_completo, identidad_validada FROM public.medicos LIMIT 1; ROLLBACK;`
    );
    checks.push({
      nombre: "Perfil público /dr/[slug] (role anon)",
      pasa: r.ok,
      detalle: r.ok ? "OK" : r.error!.split("\n")[0],
    });
  }

  // 4. celular_personal / email_personal DEBEN seguir ocultas (auth y anon)
  {
    const r = await runSql(
      `SELECT
         has_column_privilege('authenticated','public.medicos','celular_personal','SELECT') AS cel_auth,
         has_column_privilege('anon','public.medicos','celular_personal','SELECT')          AS cel_anon,
         has_column_privilege('authenticated','public.medicos','email_personal','SELECT')   AS mail_auth,
         has_column_privilege('anon','public.medicos','email_personal','SELECT')            AS mail_anon;`
    );
    const row = (r.rows as Record<string, boolean>[] | undefined)?.[0];
    const expuesta = row && (row.cel_auth || row.cel_anon || row.mail_auth || row.mail_anon);
    checks.push({
      nombre: "celular_personal / email_personal ocultas",
      pasa: r.ok && !expuesta,
      detalle: !r.ok ? r.error!.split("\n")[0] : expuesta ? "⚠️ EXPUESTA a cliente" : "siguen privadas OK",
    });
  }

  // ── reporte ──
  console.log("\n  Verificación de GRANTs en `medicos` (producción)\n");
  let fallo = false;
  for (const c of checks) {
    console.log(`  ${c.pasa ? "✅" : "❌"}  ${c.nombre}\n      ${c.detalle}`);
    if (!c.pasa) fallo = true;
  }
  console.log("");

  if (fallo) {
    console.error(
      "  ❌ FALLÓ. Probable columna nueva en `medicos` sin GRANT, o una columna\n" +
        "     privada quedó expuesta. Ver docs/security/2026-06-03-incidente-grant-medicos-didit.md\n"
    );
    process.exit(1);
  }
  console.log("  ✅ Todo OK — los GRANTs de `medicos` están consistentes.\n");
}

main().catch((e) => {
  console.error("  ❌ Error ejecutando la verificación:", e.message);
  process.exit(1);
});
