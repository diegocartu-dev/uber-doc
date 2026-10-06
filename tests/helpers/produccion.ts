// Acceso a la base de producción desde una prueba de punta a punta, SOLO para
// verificar lo que pasó (y preparar el terreno de las cuentas de prueba).
// Lee las claves de .env.local / .env.production.check si existen; en el CI
// salen de los secrets. Sin claves, `adminClient()` devuelve null y la prueba
// que lo necesita se saltea diciéndolo.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

for (const archivo of [".env.local", ".env.production.check"]) {
  const p = join(process.cwd(), archivo);
  if (!existsSync(p)) continue;
  for (const linea of readFileSync(p, "utf8").split("\n")) {
    const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

export function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key) : null;
}

export const CRON_SECRET = process.env.CRON_SECRET ?? "";

/** Repite `leer` hasta que `listo` dé true o se acabe el tiempo. Devuelve el último valor. */
export async function esperarA<T>(leer: () => Promise<T>, listo: (v: T) => boolean, ms = 30_000): Promise<T> {
  const fin = Date.now() + ms;
  let v = await leer();
  while (!listo(v) && Date.now() < fin) {
    await new Promise((r) => setTimeout(r, 1_500));
    v = await leer();
  }
  return v;
}
