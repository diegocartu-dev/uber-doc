/**
 * Medición del pago y de las caídas desde una fecha — SOLO LECTURA.
 *
 * POR QUÉ EXISTE (06/10/2026): desde ese día se paga solo con cuenta de Mercado
 * Pago (PR #528) y cada caída recibe su porqué (#531, #532). Diego pidió medirlo
 * a la semana (~13/10). Este script contesta, contra producción:
 *   1. La escalera de la consulta inmediata: pedidos → aceptados → pagados →
 *      atendidos, y el porqué de cada uno que se cayó.
 *   2. Desde dónde tocan "Pagá con Mercado Pago" (plataforma, navegador o app
 *      que lo contiene, Docto instalado): cuántos no tienen la app de MP a mano.
 *   3. Cada pago: aprobado o rechazado, con qué medio, el motivo de MP y si el
 *      pagador usó su cuenta o fue invitado (lo dice la API de MP).
 *   4. Los turnos pagos que no se atendieron y su porqué.
 *
 * Solo cuentas reales. Los números se imprimen en la terminal: NO van al repo
 * (es público) ni a commits ni PRs.
 *
 * USO:
 *   npx tsx scripts/medir-pagos.mts                       # desde el 06/10 15:00 UTC
 *   npx tsx scripts/medir-pagos.mts --desde 2026-10-13
 *
 * REQUIERE (en .env.local o .env.production.check): NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY y, para el punto 3, MP_TOKEN_ENCRYPTION_KEY.
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

const i = process.argv.indexOf("--desde");
const DESDE = new Date(i > 0 ? process.argv[i + 1] : "2026-10-06T15:00:00Z").toISOString();

const { createClient } = await import("@supabase/supabase-js");
const { diagnosticarConsulta, diagnosticarTurno, suena } = await import("../src/lib/consultas/diagnostico");
const { clasificarAtencion } = await import("../src/lib/consultas/clasificar");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const contar = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const imprimir = (titulo: string, m: Map<string, number>) => {
  console.log(`\n${titulo}`);
  if (!m.size) console.log("  (nada)");
  for (const [k, n] of [...m.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${k}`);
};

const [{ data: medTest }, { data: pacTest }] = await Promise.all([
  admin.from("medicos").select("id").eq("es_cuenta_test", true),
  admin.from("pacientes").select("id, user_id").eq("es_cuenta_test", true),
]);
const testMed = new Set((medTest ?? []).map((m) => m.id));
const testPac = new Set((pacTest ?? []).flatMap((p) => [p.id, p.user_id].filter(Boolean)));
console.log(`Medición desde ${DESDE} (solo cuentas reales)`);

// ── 1. Escalera de la consulta inmediata ─────────────────────────────────────
const { data: cis } = await admin
  .from("consultas")
  .select("id, estado, medico_id, paciente_id, aceptada_at, resuelta_por, resolucion_motivo, pago_id, mp_status, sala_video_url, en_curso_at, cierre_evidencia")
  .gte("created_at", DESDE);
const reales = (cis ?? []).filter((c) => !testMed.has(c.medico_id) && !testPac.has(c.paciente_id));
let aceptados = 0, pagados = 0, atendidos = 0;
const porque = new Map<string, number>();
for (const c of reales) {
  const k = clasificarAtencion(c);
  if (k.fueAceptada) aceptados++;
  if (k.fuePagada) pagados++;
  if (k.desenlace === "atendida") atendidos++;
  const d = diagnosticarConsulta(c);
  if (d.clase !== "atendida") contar(porque, `${suena(d) ? "SUENA " : "      "}${d.texto}`);
}
console.log(`\n1. Consulta inmediata: ${reales.length} pedidos → ${aceptados} aceptados → ${pagados} pagados → ${atendidos} atendidos`);
imprimir("   Porqué de las que no se atendieron:", porque);

// ── 2. Desde dónde tocan "Pagá con Mercado Pago" ─────────────────────────────
const { data: toques } = await admin.from("eventos_funnel").select("metadata").eq("evento", "pago_toque").gte("created_at", DESDE);
const origen = new Map<string, number>();
for (const t of toques ?? []) {
  const m = (t.metadata ?? {}) as Record<string, unknown>;
  if (testPac.has(String(m.user_id ?? ""))) continue;
  contar(origen, m.plataforma ? `${m.plataforma} · ${m.navegador} · ${m.instalada ? "Docto instalado" : "web"}` : "(toque sin origen: anterior al registro)");
}
imprimir('2. Toques de "Pagá con Mercado Pago" por origen:', origen);

// ── 3. Cada pago, según Mercado Pago ─────────────────────────────────────────
const { data: pagos } = await admin
  .from("eventos_funnel")
  .select("evento, metadata")
  .in("evento", ["pago_aprobado", "pago_rechazado"])
  .is("paciente_id", null)
  .gte("created_at", DESDE);
const resumenPagos = new Map<string, number>();
const clave = process.env.MP_TOKEN_ENCRYPTION_KEY;
const { decrypt } = clave ? await import("../src/lib/mp-crypto") : { decrypt: null };
const tokens = new Map<string, string>();
for (const p of pagos ?? []) {
  const m = (p.metadata ?? {}) as Record<string, string>;
  const tabla = m.tipo === "turno" ? "turnos" : "consultas";
  const { data: fila } = await admin.from(tabla).select("medico_id, paciente_id").eq("id", m.recursoId).maybeSingle();
  if (!fila || testMed.has(fila.medico_id) || testPac.has(fila.paciente_id)) continue;
  let detalle = `${p.evento.replace("pago_", "")}${m.detalle ? ` (${m.detalle})` : ""}`;
  if (decrypt && m.paymentId) {
    if (!tokens.has(fila.medico_id)) {
      const { data: c } = await admin.from("medicos_mp_accounts").select("access_token_encrypted").eq("medico_id", fila.medico_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      tokens.set(fila.medico_id, c ? decrypt(c.access_token_encrypted) : "");
    }
    const tok = tokens.get(fila.medico_id);
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${m.paymentId}`, { headers: { Authorization: `Bearer ${tok}` } });
    const j = (await r.json()) as { payment_type_id?: string; payer?: { id?: string } };
    let tipoPagador = "?";
    if (j.payer?.id) {
      const u = (await (await fetch(`https://api.mercadopago.com/users/${j.payer.id}`, { headers: { Authorization: `Bearer ${tok}` } })).json()) as { user_type?: string };
      tipoPagador = u.user_type === "guest" ? "invitado" : u.user_type ? "con cuenta" : "?";
    }
    detalle += ` · ${j.payment_type_id ?? "?"} · ${tipoPagador}`;
  }
  contar(resumenPagos, detalle);
}
imprimir("3. Pagos según Mercado Pago (resultado · medio · pagador):", resumenPagos);

// ── 4. Turnos pagos que no se atendieron ─────────────────────────────────────
const { data: turnos } = await admin
  .from("turnos")
  .select("id, estado, medico_id, paciente_id, mp_status, cierre_evidencia")
  .in("mp_status", ["approved", "refunded", "charged_back"])
  .gte("fecha", DESDE.slice(0, 10));
const porqueTurnos = new Map<string, number>();
let turnosReales = 0;
for (const t of turnos ?? []) {
  if (testMed.has(t.medico_id) || testPac.has(t.paciente_id)) continue;
  turnosReales++;
  const d = diagnosticarTurno(t, t.cierre_evidencia ?? null);
  if (d.clase !== "atendida" && d.clase !== "en_curso") contar(porqueTurnos, `${suena(d) ? "SUENA " : "      "}${d.texto}`);
}
console.log(`\n4. Turnos pagos con fecha desde entonces: ${turnosReales}`);
imprimir("   Porqué de los que no se atendieron:", porqueTurnos);
