/**
 * Completa el estado de entrega de los avisos por WhatsApp que quedaron
 * "enviado" sin estado, preguntándoselo a Twilio (la fuente oficial).
 *
 * POR QUÉ EXISTE (06/10/2026): la confirmación de Twilio a veces llegaba antes
 * de que existiera la fila del envío y se perdía. De 34 avisos "sin estado" en
 * 60 días, Twilio tenía el estado real de los 34 (2 de ellos NO entregados,
 * sin que sonara ninguna alarma). El arreglo hacia adelante está en
 * /api/twilio/status y en estadoDeEntrega(); esto corrige lo que ya pasó.
 *
 * USO:
 *   npx tsx scripts/completar-estados-whatsapp.mts            # solo mira (no escribe)
 *   npx tsx scripts/completar-estados-whatsapp.mts --aplicar  # escribe en producción
 *
 * Imprime conteos por estado, nunca teléfonos ni nombres.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

for (const archivo of [".env.local", ".env.production.check"]) {
  const p = join(process.cwd(), archivo);
  if (!existsSync(p)) continue;
  for (const linea of readFileSync(p, "utf8").split("\n")) {
    const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}
const APLICAR = process.argv.includes("--aplicar");
const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const SID = process.env.TWILIO_ACCOUNT_SID!, TOKEN = process.env.TWILIO_AUTH_TOKEN!;

const { data: filas, error } = await admin
  .from("whatsapp_envios")
  .select("id, twilio_sid")
  .eq("resultado", "enviado")
  .is("twilio_status", null)
  .not("twilio_sid", "is", null);
if (error) throw error;

const cuenta = new Map<string, number>();
for (const f of filas ?? []) {
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages/${f.twilio_sid}.json`, {
    headers: { Authorization: "Basic " + Buffer.from(`${SID}:${TOKEN}`).toString("base64") },
  });
  const estado = r.ok ? ((await r.json()) as { status?: string }).status ?? null : null;
  cuenta.set(estado ?? `sin_respuesta_${r.status}`, (cuenta.get(estado ?? `sin_respuesta_${r.status}`) ?? 0) + 1);
  if (APLICAR && estado) {
    await admin.from("whatsapp_envios").update({ twilio_status: estado, twilio_status_at: new Date().toISOString() }).eq("id", f.id).is("twilio_status", null);
  }
}
console.log(`${APLICAR ? "Completados" : "Se completarían (modo lectura)"}: ${filas?.length ?? 0}`, Object.fromEntries(cuenta));
