/**
 * ¿Hubo consultas hoy en Docto?
 *
 * POR QUÉ EXISTE:
 *   La respuesta vive en `/insights` (página "Hoy"), pero esa pantalla exige
 *   sesión de admin en el browser. Cuando la pregunta se hace desde una sesión
 *   de Claude Code / terminal / cron, no hay cookie: hace falta leer la DB de
 *   producción directo con service role. Este script replica la lógica de
 *   `src/app/api/insights/hoy/route.ts` sin depender de la sesión.
 *
 * QUÉ REPORTA (día argentino completo, UTC-3 fijo):
 *   - Consultas inmediatas (CI) creadas hoy, por estado.
 *   - Turnos de hoy que son atenciones reales (excluye slots
 *     `disponible`/`bloqueado`, que son agenda vacía, no consultas).
 *   - Separación cuentas reales vs. cuentas de test (`es_cuenta_test`).
 *   - Plata REAL cobrada: `monto` de las filas con `mp_status = 'approved'`
 *     y la comisión que MP registró (`mp_application_fee`), nunca un fijo.
 *   - Detalle cronológico de cada atención.
 *
 * USO:
 *   npx tsx scripts/consultas-hoy.ts            # hoy
 *   npx tsx scripts/consultas-hoy.ts 2026-07-31 # una fecha puntual (ART)
 *
 * REQUIERE (contra PRODUCCIÓN, nunca .env.local desactualizado):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   Si faltan: npx vercel env pull .env.local --environment=production
 *   El script es READ-ONLY: solo hace SELECT.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ── Env ───────────────────────────────────────────────────────────────────────
// Carga .env.local solo como fallback si el entorno no trae las vars.
function cargarEnvLocal() {
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const linea of readFileSync(p, "utf8").split("\n")) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, k, vRaw] = m;
    if (process.env[k]) continue;
    process.env[k] = vRaw.replace(/^["']|["']$/g, "");
  }
}
cargarEnvLocal();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error(
    "Faltan credenciales de producción.\n" +
      "  NEXT_PUBLIC_SUPABASE_URL: " + (URL ? "ok" : "AUSENTE") + "\n" +
      "  SUPABASE_SERVICE_ROLE_KEY: " + (KEY ? "ok" : "AUSENTE") + "\n\n" +
      "Traelas de producción con:\n" +
      "  npx vercel env pull .env.local --environment=production",
  );
  process.exit(1);
}

const admin = createClient(URL, KEY);

// ── Fechas ART (UTC-3 fijo, sin horario de verano) ────────────────────────────
function fechaAR(offset = 0): string {
  const d = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }),
  );
  d.setDate(d.getDate() - offset);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const medianocheARenUTC = (f: string) => `${f}T03:00:00Z`;
const finDelDiaARenUTC = (f: string) => {
  const d = new Date(`${f}T03:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
};

const argFecha = process.argv[2];
if (argFecha && !/^\d{4}-\d{2}-\d{2}$/.test(argFecha)) {
  console.error(`Fecha inválida: "${argFecha}". Formato esperado: AAAA-MM-DD.`);
  process.exit(1);
}
const dia = argFecha ?? fechaAR(0);

// Slots de agenda: NO son atenciones.
const SLOT = new Set(["disponible", "bloqueado"]);

const money = (n: number) =>
  "$" + Math.round(n).toLocaleString("es-AR");

type FilaPago = {
  monto: number | null;
  mp_status: string | null;
  mp_application_fee: number | string | null;
  comision_docto_pct: number | string | null;
};

// Comisión real: el fee que registró MP; si falta, reconstruir por pct. Nunca inventar.
function comisionDe(f: FilaPago): number {
  const fee = Number(f.mp_application_fee);
  if (Number.isFinite(fee) && fee > 0) return fee;
  const pct = Number(f.comision_docto_pct);
  if (Number.isFinite(pct) && pct > 0 && f.monto) return (Number(f.monto) * pct) / 100;
  return 0;
}

async function main() {
  const [
    { data: consultasRaw, error: eC },
    { data: turnosRaw, error: eT },
    { data: medsTest },
    { data: pacsTest },
  ] = await Promise.all([
    admin
      .from("consultas")
      .select(
        "id, estado, created_at, medico_id, paciente_id, especialidad, canal_origen, monto, mp_status, mp_application_fee, comision_docto_pct",
      )
      .gte("created_at", medianocheARenUTC(dia))
      .lt("created_at", finDelDiaARenUTC(dia)),
    admin
      .from("turnos")
      .select(
        "id, estado, fecha, hora_inicio, medico_id, paciente_id, monto, mp_status, mp_application_fee, comision_docto_pct, canal_origen",
      )
      .eq("fecha", dia),
    admin.from("medicos").select("id").eq("es_cuenta_test", true),
    admin.from("pacientes").select("user_id, id").eq("es_cuenta_test", true),
  ]);

  if (eC) throw new Error(`consultas: ${eC.message}`);
  if (eT) throw new Error(`turnos: ${eT.message}`);

  const testMed = new Set((medsTest ?? []).map((m: { id: string }) => m.id));
  const testPac = new Set<string>();
  for (const p of (pacsTest ?? []) as { user_id: string | null; id: string | null }[]) {
    if (p.user_id) testPac.add(p.user_id);
    if (p.id) testPac.add(p.id);
  }
  const esTest = (medicoId?: string | null, pacienteId?: string | null) =>
    Boolean((medicoId && testMed.has(medicoId)) || (pacienteId && testPac.has(pacienteId)));

  const consultas = consultasRaw ?? [];
  const turnosAtencion = (turnosRaw ?? []).filter((t) => !SLOT.has(t.estado));
  const slotsLibres = (turnosRaw ?? []).filter((t) => t.estado === "disponible").length;

  // Nombres para el detalle.
  const medicoIds = [
    ...new Set([...consultas.map((c) => c.medico_id), ...turnosAtencion.map((t) => t.medico_id)]),
  ].filter(Boolean);
  const pacienteIds = [
    ...new Set([...consultas.map((c) => c.paciente_id), ...turnosAtencion.map((t) => t.paciente_id)]),
  ].filter(Boolean);

  const [{ data: meds }, { data: pacs }] = await Promise.all([
    medicoIds.length
      ? admin.from("medicos").select("id, nombre_completo, especialidad").in("id", medicoIds)
      : Promise.resolve({ data: [] as { id: string; nombre_completo: string; especialidad: string }[] }),
    pacienteIds.length
      ? admin
          .from("pacientes")
          .select("user_id, id, nombre_completo")
          .or(`user_id.in.(${pacienteIds.join(",")}),id.in.(${pacienteIds.join(",")})`)
      : Promise.resolve({ data: [] as { user_id: string; id: string; nombre_completo: string }[] }),
  ]);

  const medMap = new Map((meds ?? []).map((m) => [m.id, m]));
  const pacMap = new Map<string, string>();
  for (const p of pacs ?? []) {
    if (p.user_id) pacMap.set(p.user_id, p.nombre_completo);
    if (p.id) pacMap.set(p.id, p.nombre_completo);
  }

  const filas = [
    ...consultas.map((c) => ({
      tipo: "CI" as const,
      estado: c.estado as string,
      test: esTest(c.medico_id, c.paciente_id),
      medico: medMap.get(c.medico_id)?.nombre_completo ?? "—",
      paciente: pacMap.get(c.paciente_id) ?? "—",
      especialidad: c.especialidad ?? medMap.get(c.medico_id)?.especialidad ?? "",
      inicio: c.created_at as string,
      pago: c as FilaPago,
    })),
    ...turnosAtencion.map((t) => ({
      tipo: "Turno" as const,
      estado: t.estado as string,
      test: esTest(t.medico_id, t.paciente_id),
      medico: medMap.get(t.medico_id)?.nombre_completo ?? "—",
      paciente: pacMap.get(t.paciente_id) ?? "—",
      especialidad: medMap.get(t.medico_id)?.especialidad ?? "",
      // Offset explícito: sin él el server (UTC) ordenaría el turno 3 h antes.
      inicio: `${t.fecha}T${t.hora_inicio}-03:00`,
      pago: t as FilaPago,
    })),
  ].sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());

  const reales = filas.filter((f) => !f.test);
  const tests = filas.filter((f) => f.test);

  const hora = (iso: string) =>
    new Date(iso).toLocaleTimeString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      hour: "2-digit",
      minute: "2-digit",
    });

  const completada = (f: (typeof filas)[number]) =>
    f.estado === "completada" || f.estado === "completado";

  console.log(`\n═══ Docto — actividad del ${dia} (hora Argentina) ═══\n`);

  if (filas.length === 0) {
    console.log("Sin actividad: 0 consultas inmediatas y 0 turnos con paciente.");
    console.log(`(Slots de agenda libres publicados para el día: ${slotsLibres})\n`);
    return;
  }

  const resumen = (nombre: string, xs: typeof filas) => {
    if (xs.length === 0) return;
    const porEstado = new Map<string, number>();
    for (const f of xs) porEstado.set(f.estado, (porEstado.get(f.estado) ?? 0) + 1);
    const pagadas = xs.filter((f) => f.pago.mp_status === "approved");
    const cobrado = pagadas.reduce((s, f) => s + (Number(f.pago.monto) || 0), 0);
    const comision = pagadas.reduce((s, f) => s + comisionDe(f.pago), 0);

    console.log(`── ${nombre} ──`);
    console.log(`   Total: ${xs.length}  |  completadas: ${xs.filter(completada).length}`);
    console.log(`   CI: ${xs.filter((f) => f.tipo === "CI").length}  |  Turnos: ${xs.filter((f) => f.tipo === "Turno").length}`);
    console.log(
      `   Estados: ${[...porEstado.entries()].map(([e, n]) => `${e}=${n}`).join(", ")}`,
    );
    console.log(
      `   Plata (mp_status=approved): cobrado ${money(cobrado)} | comisión Docto ${money(comision)} | neto médicos ${money(cobrado - comision)}`,
    );
    for (const f of xs) {
      const $ = f.pago.mp_status === "approved" ? money(Number(f.pago.monto) || 0) : "sin pago";
      console.log(
        `   ${hora(f.inicio)}  ${f.tipo.padEnd(5)} ${f.estado.padEnd(12)} ${f.medico} → ${f.paciente}  (${f.especialidad || "s/esp"}, ${$})`,
      );
    }
    console.log("");
  };

  resumen("CUENTAS REALES", reales);
  resumen("CUENTAS DE TEST (no cuentan para métricas)", tests);
  console.log(`Slots de agenda libres publicados para el día: ${slotsLibres}\n`);
}

main().catch((e) => {
  console.error("Error consultando producción:", e instanceof Error ? e.message : e);
  process.exit(1);
});
