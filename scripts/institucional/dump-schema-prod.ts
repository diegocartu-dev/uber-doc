/**
 * Dump de SOLO SCHEMA de la base B2C de producción — insumo del baseline
 * de la instancia institucional (spec §1.1).
 *
 * POR QUÉ EXISTE:
 *   La práctica del proyecto fue aplicar DDL directo por Management API /
 *   SQL Editor, y supabase/migrations/ tiene colisiones de numeración. NO se
 *   puede asumir que las migraciones reproducen el schema productivo: antes
 *   de provisionar la instancia hay que diffear el schema REAL de prod contra
 *   el resultado de correr las migraciones en un proyecto limpio, y capturar
 *   el drift en una migración de baseline. Caso concreto ya verificado: el
 *   constraint `medicos_aprobado_requiere_refeps` no existe en migraciones
 *   (solo DDL directo) — un clon nacería sin el backstop del gate REFEPS.
 *   Incluye GRANTs de columna de `medicos` (el outage 19-24/06 fue
 *   exactamente un grant faltante), triggers, funciones y CHECKs.
 *
 * QUÉ HACE:
 *   Consulta information_schema / pg_catalog (SOLO LECTURA, cero DDL) vía la
 *   Supabase Management API y escribe un JSON ordenado y determinístico en
 *   scripts/institucional/out/ (gitignoreado — el schema de prod no se
 *   commitea). Ordenado = diffeable: correrlo contra prod y contra el
 *   proyecto limpio y comparar los dos archivos.
 *
 * USO (NO correr sin necesidad — pega contra la Management API de prod):
 *   npx tsx scripts/institucional/dump-schema-prod.ts            # dump de prod B2C
 *   npx tsx scripts/institucional/dump-schema-prod.ts <proj-ref> # otro proyecto
 *                                                    # (ej. el clon limpio del baseline)
 *   Salida: scripts/institucional/out/schema-<proj-ref>-<fecha>.json
 *
 * REQUIERE:
 *   SUPABASE_ACCESS_TOKEN en .env.local o entorno (Management API).
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Proyecto B2C de producción (default). Se puede pasar otro ref por argv
// para dumpear el proyecto limpio del baseline y diffear ambos JSON.
const DEFAULT_PROJECT_REF = "irpupskopjahbqqvckue";

// ── cargar .env.local sin dependencias (patrón verify-grants-medicos.ts) ────
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

// ── Las consultas del dump — todas read-only, todas ordenadas ───────────────
// ORDER BY estable en cada una: el output tiene que ser diffeable entre
// corridas y entre proyectos.
const QUERIES: Record<string, string> = {
  tablas: `
    SELECT table_name, table_type
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name`,

  columnas: `
    SELECT table_name, column_name, ordinal_position, data_type,
           is_nullable, column_default, character_maximum_length,
           numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, column_name`,

  // TODOS los constraints con su definición completa (CHECK incluidos —
  // los aplicados por DDL directo no están en migraciones), PK/FK/UNIQUE.
  constraints: `
    SELECT rel.relname AS table_name, con.conname AS constraint_name,
           con.contype AS tipo, pg_get_constraintdef(con.oid) AS definicion
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
    ORDER BY rel.relname, con.conname`,

  // GRANTs a nivel TABLA por rol.
  grants_tabla: `
    SELECT table_name, grantee, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND grantee IN ('anon', 'authenticated', 'service_role')
    ORDER BY table_name, grantee, privilege_type`,

  // GRANTs de COLUMNA — el corazón del baseline: `medicos` usa grants
  // columna-por-columna y un faltante causó el outage 19-24/06.
  grants_columna: `
    SELECT table_name, column_name, grantee, privilege_type
    FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND grantee IN ('anon', 'authenticated', 'service_role')
    ORDER BY table_name, column_name, grantee, privilege_type`,

  // Policies RLS completas (roles, USING, WITH CHECK).
  policies: `
    SELECT tablename AS table_name, policyname, permissive, roles::text,
           cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname`,

  // Estado de RLS por tabla (activo / forzado).
  rls: `
    SELECT rel.relname AS table_name, rel.relrowsecurity AS rls_activo,
           rel.relforcerowsecurity AS rls_forzado
    FROM pg_class rel
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public' AND rel.relkind = 'r'
    ORDER BY rel.relname`,

  triggers: `
    SELECT rel.relname AS table_name, tg.tgname AS trigger_name,
           pg_get_triggerdef(tg.oid) AS definicion
    FROM pg_trigger tg
    JOIN pg_class rel ON rel.oid = tg.tgrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public' AND NOT tg.tgisinternal
    ORDER BY rel.relname, tg.tgname`,

  // Funciones/RPCs del schema public con su fuente completa.
  funciones: `
    SELECT p.proname AS function_name,
           pg_get_function_identity_arguments(p.oid) AS argumentos,
           pg_get_functiondef(p.oid) AS definicion
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public' AND p.prokind = 'f'
    ORDER BY p.proname, argumentos`,

  indices: `
    SELECT tablename AS table_name, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname`,

  // Buckets de Storage (los del B2C tienen migración, pero el diff confirma).
  storage_buckets: `
    SELECT id, name, public
    FROM storage.buckets
    ORDER BY id`,
};

async function runSql(
  projectRef: string,
  token: string,
  query: string
): Promise<unknown> {
  const resp = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  );
  if (!resp.ok) {
    throw new Error(`Management API HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  }
  return resp.json();
}

async function main() {
  loadEnvLocal();
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.error("Falta SUPABASE_ACCESS_TOKEN (en .env.local o entorno).");
    process.exit(1);
  }

  const projectRef = process.argv[2] ?? DEFAULT_PROJECT_REF;
  const fecha = new Date().toISOString().slice(0, 10);
  const outDir = join(process.cwd(), "scripts/institucional/out");
  mkdirSync(outDir, { recursive: true });

  const dump: Record<string, unknown> = {
    _meta: { project_ref: projectRef, generado_at: new Date().toISOString() },
  };

  for (const [nombre, query] of Object.entries(QUERIES)) {
    process.stdout.write(`· ${nombre}… `);
    dump[nombre] = await runSql(projectRef, token, query);
    console.log("ok");
  }

  const outPath = join(outDir, `schema-${projectRef}-${fecha}.json`);
  writeFileSync(outPath, JSON.stringify(dump, null, 2) + "\n");
  console.log(`\nDump escrito en ${outPath}`);
  console.log("Siguiente paso del baseline: ver scripts/institucional/README.md");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
