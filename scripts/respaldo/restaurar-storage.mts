// Restaura los archivos del Storage desde la copia en Vercel Blob a un proyecto
// de Supabase, y verifica cada archivo por su md5. Uso:
//   npx tsx scripts/respaldo/restaurar-storage.mts <ref origen> <ref destino>
//
// Qué restaura: los archivos que la BASE del destino dice que existen
// (storage.objects, que viaja con el respaldo de la base). Para cada uno busca
// en la copia la versión con el mismo etag, la sube al destino y comprueba que
// el md5 de lo subido coincida. Así la prueba cubre lo que importa: que cada
// archivo que la base referencia se pueda traer de vuelta, íntegro.
// Nunca usar con destino = producción salvo en un desastre real y a sabiendas
// (sube con upsert: pisa lo que haya).
//
// Necesita en .env.local: SUPABASE_ACCESS_TOKEN y BLOB_READ_WRITE_TOKEN.
// Imprime solo cantidades por bucket (sin rutas): se puede pegar en un doc
// interno, no en el repo.
import fs from "fs";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { get } from "@vercel/blob";
import { listarCopia, rutaEnCopia, normalizarEtag, BUCKETS_EXCLUIDOS } from "../../src/lib/respaldo/copia-storage";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
);
const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i === -1 ? undefined : args[i + 1] ?? ""; };
const [origen, destino] = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const soloArchivo = flag("--archivo"); // <bucket>/<ruta>
const version = flag("--version"); // etag de la versión a restaurar
if (!origen || !destino) {
  console.error(`uso:
  todo, a un proyecto de prueba:
    npx tsx scripts/respaldo/restaurar-storage.mts <ref origen> <ref destino>
  un archivo (deshacer un borrado o un reemplazo): primero ver sus versiones,
    npx tsx scripts/respaldo/restaurar-storage.mts <ref origen> <ref destino> --archivo <bucket>/<ruta>
  y después restaurar la elegida:
    ... --archivo <bucket>/<ruta> --version <etag>
  Sobre producción hace falta además --sobre-produccion.`);
  process.exit(1);
}
// Producción solo a sabiendas: la restauración completa sube con upsert y pisa.
const PRODUCCION = ["irpupskopjahbqqvckue", "ygoenedpeyzwsfblgjsy"];
if (PRODUCCION.includes(destino) && !args.includes("--sobre-produccion")) {
  console.error("El destino es producción. Si es un desastre real o un archivo puntual, repetir con --sobre-produccion.");
  process.exit(1);
}
if (PRODUCCION.includes(destino) && !soloArchivo) {
  console.error("Sobre producción solo se restaura de a un archivo (--archivo). Una restauración completa va a un proyecto nuevo.");
  process.exit(1);
}
const TOK = env.SUPABASE_ACCESS_TOKEN;
const BLOB = env.BLOB_READ_WRITE_TOKEN;

async function sql<T>(ref: string, query: string): Promise<T[]> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOK}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}
async function claveDeServicio(ref: string): Promise<string> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, {
    headers: { Authorization: `Bearer ${TOK}` },
  });
  const k = ((await r.json()) as { name: string; api_key: string }[]).find((c) => c.name === "service_role");
  if (!k) throw new Error(`sin service_role para ${ref}`);
  return k.api_key;
}

const t0 = Date.now();
const admin = createClient(`https://${destino}.supabase.co`, await claveDeServicio(destino), { auth: { persistSession: false } });
const filas = await sql<{ bucket_id: string; name: string; etag: string; tipo: string }>(
  destino,
  `select bucket_id, name, metadata->>'eTag' etag, coalesce(metadata->>'mimetype','application/octet-stream') tipo
     from storage.objects order by bucket_id, name`,
);
const copia = await listarCopia(origen, BLOB);

if (soloArchivo) {
  const barra = soloArchivo.indexOf("/");
  const bucket = soloArchivo.slice(0, barra), ruta = soloArchivo.slice(barra + 1);
  const prefijo = `storage/${origen}/${bucket}/${ruta}@`;
  const versiones = [...copia.entries()]
    .filter(([p]) => p.startsWith(prefijo) && !p.slice(prefijo.length).includes("/"))
    .map(([p, b]) => ({ etag: p.slice(prefijo.length), guardada: b.uploadedAt.toISOString(), bytes: b.size, url: b.url }))
    .sort((x, y) => y.guardada.localeCompare(x.guardada));
  if (!versiones.length) { console.error("Ese archivo no está en la copia."); process.exit(1); }
  if (!version) {
    console.log("Versiones en la copia (la más nueva arriba):");
    for (const v of versiones) console.log(`  --version ${v.etag}   guardada ${v.guardada}   ${v.bytes} bytes`);
    process.exit(0);
  }
  const v = versiones.find((x) => x.etag === version);
  if (!v) { console.error("No hay esa versión."); process.exit(1); }
  const r = await get(v.url, { access: "private", token: BLOB });
  if (!r) throw new Error("no se pudo bajar de la copia");
  const buf = Buffer.from(await new Response(r.stream).arrayBuffer());
  const { error } = await admin.storage.from(bucket).upload(ruta, buf, { upsert: true, contentType: r.blob.contentType ?? undefined });
  if (error) throw new Error(error.message);
  console.log(`Restaurado ${bucket}/${ruta} (versión ${version}).`);
  process.exit(0);
}

type Cuenta = { esperados: number; restaurados: number; md5_ok: number; sin_copia: number; fallas: number; excluido?: string };
const porBucket: Record<string, Cuenta> = {};
const errores: string[] = [];

// Reintenta los cortes de red ("fetch failed"): 3 intentos con espera creciente.
async function conReintento<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 1; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= 3) throw e;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

async function uno(f: (typeof filas)[number]) {
  const c = (porBucket[f.bucket_id] ??= { esperados: 0, restaurados: 0, md5_ok: 0, sin_copia: 0, fallas: 0 });
  c.esperados++;
  if (f.bucket_id in BUCKETS_EXCLUIDOS) { c.excluido = BUCKETS_EXCLUIDOS[f.bucket_id]; return; }
  const etag = normalizarEtag(f.etag);
  const ruta = rutaEnCopia(origen, { bucket: f.bucket_id, ruta: f.name, etag });
  const b = copia.get(ruta);
  if (!b) { c.sin_copia++; return; }
  try {
    const buf = await conReintento(async () => {
      const r = await get(b.url, { access: "private", token: BLOB });
      if (!r) throw new Error("no está en la copia");
      return Buffer.from(await new Response(r.stream).arrayBuffer());
    });
    await conReintento(async () => {
      const { error } = await admin.storage.from(f.bucket_id).upload(f.name, buf, { upsert: true, contentType: f.tipo });
      if (error) throw new Error(error.message);
    });
    // Verificación: bajar lo subido y comparar el md5 con el etag original
    // (en subidas simples el etag ES el md5; si es multiparte, se compara contra la copia).
    const releido = await conReintento(async () => {
      const { data, error: e2 } = await admin.storage.from(f.bucket_id).download(f.name);
      if (e2 || !data) throw new Error(`no se pudo releer: ${e2?.message}`);
      return Buffer.from(await data.arrayBuffer());
    });
    const md5 = crypto.createHash("md5").update(releido).digest("hex");
    const esperado = etag.includes("-") ? crypto.createHash("md5").update(buf).digest("hex") : etag;
    c.restaurados++;
    if (md5 === esperado) c.md5_ok++;
    else throw new Error("md5 distinto");
  } catch (e) {
    c.fallas++;
    errores.push(`${f.bucket_id}: ${(e as Error).message.slice(0, 120)}`);
  }
}

// 6 en paralelo.
const cola = [...filas];
await Promise.all(Array.from({ length: 6 }, async () => { for (let f = cola.shift(); f; f = cola.shift()) await uno(f); }));

console.log(JSON.stringify({ origen, destino, segundos: Math.round((Date.now() - t0) / 1000), porBucket }, null, 1));
if (errores.length) console.log("errores (primeros 10):\n" + errores.slice(0, 10).join("\n"));
const malos = Object.values(porBucket).reduce((s, c) => s + c.sin_copia + c.fallas, 0);
process.exit(malos ? 1 : 0);
