// Corre a mano la misma copia que el cron copia-storage (para la primera copia
// o para ponerse al día). Uso:
//   npx tsx scripts/respaldo/copiar-storage.mts [ref]   (por defecto, producción B2C)
// Necesita en .env.local: SUPABASE_ACCESS_TOKEN y BLOB_READ_WRITE_TOKEN
// (este último lo trae `npx vercel env pull`). La clave de servicio del proyecto
// se pide a la Management API: no hace falta tenerla a mano.
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { copiarStorage } from "../../src/lib/respaldo/copia-storage";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
);
const ref = process.argv[2] ?? "irpupskopjahbqqvckue";

export async function claveDeServicio(r: string): Promise<string> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${r}/api-keys?reveal=true`, {
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` },
  });
  const claves = (await res.json()) as { name: string; api_key: string }[];
  const k = claves.find((c) => c.name === "service_role");
  if (!k) throw new Error(`sin service_role para ${r}`);
  return k.api_key;
}

const admin = createClient(`https://${ref}.supabase.co`, await claveDeServicio(ref), { auth: { persistSession: false } });
const t0 = Date.now();
const r = await copiarStorage(admin, ref, { presupuestoMs: 30 * 60_000, token: env.BLOB_READ_WRITE_TOKEN });
console.log(JSON.stringify({ ...r, segundos: Math.round((Date.now() - t0) / 1000) }, null, 1));
process.exit(r.fallas.length ? 1 : 0);
