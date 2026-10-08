/**
 * Bloquea a los profesionales cuyo WhatsApp hoy no recibe avisos (08/10/2026).
 *
 * El bloqueo automático nace con el webhook de Twilio: corre para lo que pase de
 * ahora en adelante. Esto aplica la misma regla a lo que ya pasó: profesionales
 * reales con un aviso NO entregado y ningún aviso entregado después, cuyo
 * motivo según Twilio es "destinatario inválido" (se le pregunta a Twilio el
 * código de error de cada uno, no se supone).
 *
 * USO:
 *   npx tsx scripts/bloquear-whatsapp-invalidos.mts            # solo mira
 *   npx tsx scripts/bloquear-whatsapp-invalidos.mts --aplicar  # bloquea
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
const { esDestinatarioInvalido, bloquearPorWhatsApp, bloqueoActivo } = await import("../src/lib/medicos/bloqueo-whatsapp");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const SID = process.env.TWILIO_ACCOUNT_SID!, TOKEN = process.env.TWILIO_AUTH_TOKEN!;

const { data: envios } = await admin
  .from("whatsapp_envios")
  .select("medico_id, twilio_sid, twilio_status, created_at")
  .not("medico_id", "is", null)
  .in("twilio_status", ["undelivered", "failed", "delivered", "read"])
  .gte("created_at", new Date(Date.now() - 60 * 86_400_000).toISOString())
  .order("created_at", { ascending: true });

// El último estado por profesional manda: si después del rechazo hubo uno entregado, ya recibe.
const ultimo = new Map<string, { sid: string; status: string }>();
for (const e of envios ?? []) ultimo.set(e.medico_id, { sid: e.twilio_sid, status: e.twilio_status });

const { data: test } = await admin.from("medicos").select("id").eq("es_cuenta_test", true);
const esTest = new Set((test ?? []).map((m) => m.id));

for (const [medicoId, u] of ultimo) {
  if (esTest.has(medicoId) || !["undelivered", "failed"].includes(u.status)) continue;
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages/${u.sid}.json`, {
    headers: { Authorization: "Basic " + Buffer.from(`${SID}:${TOKEN}`).toString("base64") },
  });
  const codigo = r.ok ? String(((await r.json()) as { error_code?: number }).error_code ?? "") : "";
  const { data: m } = await admin.from("medicos").select("nombre_completo").eq("id", medicoId).maybeSingle();
  const yaBloqueado = Boolean(await bloqueoActivo(medicoId));
  const corresponde = esDestinatarioInvalido(codigo);
  let accion = corresponde ? (yaBloqueado ? "ya estaba bloqueado" : APLICAR ? "BLOQUEADO" : "se bloquearía") : "no corresponde (otro error)";
  if (APLICAR && corresponde && !yaBloqueado) accion = (await bloquearPorWhatsApp(medicoId, codigo)) ? "BLOQUEADO" : "no se pudo bloquear";
  console.log(`${m?.nombre_completo ?? medicoId} · último aviso ${u.status} · error ${codigo || "?"} → ${accion}`);
}
