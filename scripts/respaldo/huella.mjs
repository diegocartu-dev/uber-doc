// Huella de una base para comparar producción contra una restauración.
// SOLO LECTURA. Uso:
//   node scripts/respaldo/huella.mjs <project_ref> <corte ISO, la hora del respaldo>
// Ejemplo:
//   node scripts/respaldo/huella.mjs irpupskopjahbqqvckue 2026-11-16T04:23:42Z > "$TMPDIR/prod.json"
//   node scripts/respaldo/huella.mjs <ref-de-la-copia> 2026-11-16T04:23:42Z > "$TMPDIR/copia.json"
//   node scripts/respaldo/comparar.mjs "$TMPDIR/prod.json" "$TMPDIR/copia.json"
//
// Datos: por tabla, cantidad de filas creadas hasta el corte y un md5 de sus ids
// ordenados (si coinciden, son exactamente las mismas filas). Esquema: md5 de
// columnas, funciones, triggers, políticas RLS, tablas con RLS, constraints,
// índices, grants y roles. La salida tiene conteos de producción: NO va al repo
// (repo público): siempre a $TMPDIR, nunca a la carpeta del repo.
import fs from "fs";

const [ref, corte] = process.argv.slice(2);
if (!ref || !corte) {
  console.error("uso: node scripts/respaldo/huella.mjs <project_ref> <corte ISO>");
  process.exit(1);
}
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const TOK = process.env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_ACCESS_TOKEN;

async function q(sql) {
  for (let intento = 1; intento <= 4; intento++) {
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: { Authorization: "Bearer " + TOK, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    });
    const t = await r.text();
    if (r.ok) return JSON.parse(t);
    if (r.status !== 429 || intento === 4) throw new Error(`${r.status} ${t.slice(0, 300)}`);
    await new Promise((res) => setTimeout(res, 2000 * intento));
  }
}

// Tablas principales con su columna de alta. Las demás tablas se comparan por
// cantidad total (pueden haber cambiado después del corte; se informa aparte).
const PRINCIPALES = {
  medicos: "created_at",
  consultas: "created_at",
  turnos: "created_at",
  documentos: "created_at",
  firma_logs: "created_at",
  admin_audit_log: "creado_en",
};

const huella = { ref, corte, datos: {}, todas: {}, esquema: {} };
const c = corte.replace(/'/g, "");

for (const [tabla, col] of Object.entries(PRINCIPALES)) {
  const [row] = await q(
    `select count(*)::int n, md5(coalesce(string_agg(id::text, ',' order by id::text), '')) h
       from public.${tabla} where ${col} <= '${c}'::timestamptz`,
  );
  huella.datos[tabla] = row;
}

// auth.users: lo que hace falta para entrar al admin.
{
  const [row] = await q(
    `select count(*)::int n, md5(coalesce(string_agg(id::text, ',' order by id::text), '')) h
       from auth.users where created_at <= '${c}'::timestamptz`,
  );
  huella.datos["auth.users"] = row;
}

// Cantidad de filas de todas las tablas de public (estimación exacta por count).
const tablas = await q(
  `select table_name from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE' order by 1`,
);
for (const { table_name } of tablas) {
  const [row] = await q(`select count(*)::int n from public."${table_name}"`);
  huella.todas[table_name] = row.n;
}

const ESQUEMA = {
  columnas: `select md5(string_agg(table_name||'.'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,''), '|' order by table_name, column_name)) h, count(*)::int n
               from information_schema.columns where table_schema='public'`,
  funciones: `select md5(string_agg(p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'||md5(p.prosrc), '|' order by p.proname, pg_get_function_identity_arguments(p.oid))) h, count(*)::int n
                from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`,
  triggers: `select md5(string_agg(c.relname||'.'||t.tgname||':'||pg_get_triggerdef(t.oid), '|' order by c.relname, t.tgname)) h, count(*)::int n
               from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
              where n.nspname in ('public','storage','auth') and not t.tgisinternal`,
  politicas_rls: `select md5(string_agg(schemaname||'.'||tablename||'.'||policyname||':'||cmd||':'||coalesce(qual,'')||':'||coalesce(with_check,'')||':'||array_to_string(roles, ','), '|' order by schemaname, tablename, policyname)) h, count(*)::int n
                    from pg_policies where schemaname in ('public','storage')`,
  tablas_con_rls: `select md5(string_agg(c.relname||':'||c.relrowsecurity, '|' order by c.relname)) h, count(*) filter (where c.relrowsecurity)::int n
                     from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'`,
  constraints: `select md5(string_agg(conrelid::regclass::text||'.'||conname||':'||pg_get_constraintdef(oid), '|' order by conrelid::regclass::text, conname)) h, count(*)::int n
                  from pg_constraint where connamespace='public'::regnamespace`,
  indices: `select md5(string_agg(indexdef, '|' order by indexname)) h, count(*)::int n from pg_indexes where schemaname='public'`,
  grants_columna: `select md5(string_agg(grantee||':'||table_name||'.'||column_name||':'||privilege_type, '|' order by grantee, table_name, column_name, privilege_type)) h, count(*)::int n
                     from information_schema.column_privileges where table_schema='public' and grantee in ('anon','authenticated','service_role')`,
  grants_tabla: `select md5(string_agg(grantee||':'||table_name||':'||privilege_type, '|' order by grantee, table_name, privilege_type)) h, count(*)::int n
                   from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated','service_role')`,
  roles: `select md5(string_agg(rolname||':'||rolcanlogin||':'||rolbypassrls, '|' order by rolname)) h, count(*)::int n from pg_roles where rolname not like 'pg\\_%'`,
  buckets: `select md5(string_agg(id||':'||public::text, '|' order by id)) h, count(*)::int n from storage.buckets`,
  objetos_storage_meta: `select md5(coalesce(string_agg(bucket_id||'/'||name, '|' order by bucket_id, name), '')) h, count(*)::int n
                           from storage.objects where created_at <= '${c}'::timestamptz`,
  extensiones: `select md5(string_agg(extname||':'||extversion, '|' order by extname)) h, count(*)::int n from pg_extension`,
};
for (const [nombre, sql] of Object.entries(ESQUEMA)) {
  try {
    const [row] = await q(sql);
    huella.esquema[nombre] = row;
  } catch (e) {
    huella.esquema[nombre] = { error: String(e.message).slice(0, 160) };
  }
}

console.log(JSON.stringify(huella, null, 1));
