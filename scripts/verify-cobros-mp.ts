/**
 * ¿Por qué no entran consultas? — comprobación empírica de la cadena de cobro
 *
 * POR QUÉ EXISTE (27/08/2026):
 *   Se registraron pacientes y no entró ninguna consulta. Leyendo el código
 *   aparecieron tres frenos posibles, y ninguno se puede confirmar sin mirar
 *   producción. Este script los prueba de una: no deduce nada del código, hace
 *   las preguntas contra la base real.
 *
 * QUÉ COMPRUEBA
 *   1. Los flags que apagan la función entera. `getFlag` devuelve FALSE si la
 *      key no existe, así que una fila faltante apaga la Consulta Inmediata o
 *      el cobro sin que nadie lo note.
 *   2. Los permisos de cobro de Mercado Pago de cada profesional aprobado:
 *      si vencieron, si no existen, y —lo importante— si el profesional igual
 *      figura PUBLICADO. Ese cruce es el que produce consultas incobrables:
 *      el paciente pide, el profesional acepta, y el pago muere al final.
 *   3. Dónde mueren las atenciones de los últimos días, por estado. Es la
 *      respuesta directa a "hay pacientes y no hay consultas".
 *
 * USO:
 *   npx tsx scripts/verify-cobros-mp.ts
 *
 * REQUIERE:
 *   SUPABASE_ACCESS_TOKEN en .env.local o en el entorno (Management API).
 *
 * SOLO LECTURA: no aplica DDL, no escribe una sola fila.
 *
 * OJO — la salida trae datos de personas reales (nombres, mails). Sirve para
 * actuar, no para pegar en el repo, en un PR ni en un issue: el repo es público.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const PROJECT_REF = "irpupskopjahbqqvckue";
const MGMT_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

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

async function q(token: string, query: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(MGMT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  if (data && typeof data === "object" && !Array.isArray(data) && "message" in data) {
    throw new Error(String((data as { message: string }).message));
  }
  return data as Record<string, unknown>[];
}

function tabla(filas: Record<string, unknown>[]) {
  if (filas.length === 0) {
    console.log("   (sin filas)");
    return;
  }
  console.table(filas);
}

async function main() {
  loadEnvLocal();
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.error("❌ Falta SUPABASE_ACCESS_TOKEN (en .env.local o en el entorno).");
    process.exit(2);
  }

  let problemas = 0;

  // ── 1. Flags ───────────────────────────────────────────────────────────────
  console.log("\n1) FLAGS QUE APAGAN LA FUNCIÓN ENTERA");
  const flags = await q(
    token,
    `select key, activo from feature_flags
      where key in ('consulta_inmediata_global','pago_marketplace') order by key`
  );
  tabla(flags);

  for (const esperado of ["consulta_inmediata_global", "pago_marketplace"]) {
    const fila = flags.find((f) => f.key === esperado);
    if (!fila) {
      console.log(`   ❌ FALTA la fila '${esperado}' → getFlag devuelve false → APAGADO.`);
      problemas++;
    } else if (fila.activo !== true) {
      console.log(`   ❌ '${esperado}' está en OFF.`);
      problemas++;
    }
  }
  if (problemas === 0) console.log("   ✅ Los dos flags existen y están en ON.");

  // ── 2. Permisos de cobro ───────────────────────────────────────────────────
  console.log("\n2) PERMISOS DE COBRO (Mercado Pago) DE CADA PROFESIONAL APROBADO");
  const cuentas = await q(
    token,
    `select m.nombre_completo,
            m.disponible,
            coalesce(a.estado,'SIN CUENTA')            as estado_mp,
            a.expires_at,
            (a.expires_at <= now())                    as token_vencido,
            a.ultima_renovacion
       from medicos m
       left join medicos_mp_accounts a on a.medico_id = m.id
      where m.estado_registro = 'aprobado'
        and coalesce(m.es_cuenta_test,false) = false
      order by a.expires_at nulls first`
  );
  tabla(cuentas);

  const incobrables = cuentas.filter(
    (c) => c.estado_mp === "SIN CUENTA" || c.token_vencido === true || c.estado_mp !== "activo"
  );
  const publicadosIncobrables = incobrables.filter((c) => c.disponible === true);

  if (incobrables.length > 0) {
    console.log(`   ❌ ${incobrables.length} profesional(es) aprobados NO pueden cobrar.`);
    problemas++;
  }
  if (publicadosIncobrables.length > 0) {
    console.log(
      `   ❌❌ ${publicadosIncobrables.length} de ellos figuran DISPONIBLES: pueden aceptar` +
        ` consultas que van a fallar al pagar. Este es el cruce que deja pacientes sin atención.`
    );
  }
  if (incobrables.length === 0) console.log("   ✅ Todos los aprobados tienen permiso de cobro vigente.");

  // ── 3. Dónde mueren las atenciones ─────────────────────────────────────────
  console.log("\n3) CONSULTAS INMEDIATAS DE LOS ÚLTIMOS 3 DÍAS, POR ESTADO");
  tabla(
    await q(
      token,
      `select estado, count(*)::int as cantidad
         from consultas
        where created_at > now() - interval '3 days'
        group by estado order by cantidad desc`
    )
  );
  console.log("   Referencia: 'esperando' = nadie la aceptó todavía · 'aceptada' sin pago = murió en el checkout.");

  console.log("\n   PACIENTES CREADOS EN LOS ÚLTIMOS 3 DÍAS");
  tabla(
    await q(
      token,
      `select date_trunc('day', created_at)::date as dia, count(*)::int as pacientes
         from pacientes
        where created_at > now() - interval '3 days'
        group by 1 order by 1 desc`
    )
  );

  console.log(
    problemas === 0
      ? "\n✅ La cadena de cobro está sana. El freno está en otro lado.\n"
      : `\n❌ ${problemas} problema(s) confirmados arriba.\n`
  );
  process.exit(problemas === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("❌ Error corriendo la comprobación:", err instanceof Error ? err.message : err);
  process.exit(2);
});
