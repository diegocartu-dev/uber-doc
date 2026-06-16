import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin } from "@/lib/admin-auth";

// Panel "Oferta por horario": cuánta oferta de atención hay en cada franja
// (día de semana × hora), para analizar la oferta y decidir acciones.
//   - turnos: # de médicos con turnos PROGRAMADOS habilitados en esa franja
//             (de agenda_franjas → agenda_modelos activos → médicos verificados).
//   - ci:     médico-horas de CONSULTA INMEDIATA ofertadas en el período, a partir
//             del log de disponibilidad (se acumula desde que se instrumentó).
//
// Convención de día: 1=lunes … 7=domingo (igual que agenda_franjas / crear-agenda.ts).
// Argentina es UTC-3 fijo (sin DST), así que el cálculo horario resta 3h al UTC.

function fechaAR(offset = 0) {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  d.setDate(d.getDate() - offset);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const AR_OFFSET_MS = 3 * 3600_000; // AR = UTC-3
const CAP_MS = 16 * 3600_000;      // intervalo de CI abierto: se capea a 16h (evita inflar si el médico quedó "disponible" sin sacarse)

export async function GET(req: NextRequest) {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const dias = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("dias") ?? "30", 10) || 30, 1), 365);
  const desde = fechaAR(dias);
  const admin = createAdminClient();

  // Matrices [día 0..6 = lun..dom][hora 0..23]
  const turnos = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const ci = Array.from({ length: 7 }, () => new Array(24).fill(0));

  const [{ data: medicos }, { data: modelos }, { data: franjas }, { data: log }] = await Promise.all([
    admin.from("medicos").select("id").eq("verificado", true).eq("es_cuenta_test", false),
    admin.from("agenda_modelos").select("id, medico_id, activo"),
    admin.from("agenda_franjas").select("modelo_id, dia_semana, hora_inicio, hora_fin"),
    admin.from("disponibilidad_log").select("medico_id, online, at").gte("at", desde).order("at", { ascending: true }),
  ]);

  // ── Turnos habilitados ──────────────────────────────────────────────
  const medicosOk = new Set((medicos ?? []).map((m) => m.id));
  const modeloMedico = new Map<string, string>(); // modelo activo de médico verificado → medico_id
  for (const mo of modelos ?? []) {
    if (mo.activo && medicosOk.has(mo.medico_id)) modeloMedico.set(mo.id, mo.medico_id);
  }
  // Set de médicos distintos por franja (un médico con 2 franjas en la misma hora cuenta 1)
  const turnoSets: Set<string>[][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => new Set<string>()));
  for (const f of franjas ?? []) {
    const medicoId = modeloMedico.get(f.modelo_id);
    if (!medicoId) continue;
    const diaIdx = (f.dia_semana as number) - 1; // 1..7 → 0..6
    if (diaIdx < 0 || diaIdx > 6) continue;
    const hIni = parseInt(String(f.hora_inicio).slice(0, 2), 10);
    const hFin = parseInt(String(f.hora_fin).slice(0, 2), 10);
    const mFin = parseInt(String(f.hora_fin).slice(3, 5), 10);
    const hFinIncl = mFin > 0 ? hFin : hFin - 1; // si cierra en :00, esa hora no cuenta
    for (let h = hIni; h <= hFinIncl; h++) {
      if (h >= 0 && h < 24) turnoSets[diaIdx][h].add(medicoId);
    }
  }
  for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) turnos[d][h] = turnoSets[d][h].size;

  // ── CI ofertada (médico-horas) ──────────────────────────────────────
  const porMedico = new Map<string, { online: boolean; at: number }[]>();
  for (const ev of log ?? []) {
    if (!porMedico.has(ev.medico_id)) porMedico.set(ev.medico_id, []);
    porMedico.get(ev.medico_id)!.push({ online: ev.online, at: new Date(ev.at).getTime() });
  }
  const now = Date.now();
  const distribuir = (start: number, end: number) => {
    let cur = start;
    while (cur < end) {
      const arMs = cur - AR_OFFSET_MS;
      const dd = new Date(arMs);
      const jsDay = dd.getUTCDay();             // 0=dom..6=sáb
      const diaIdx = (jsDay === 0 ? 7 : jsDay) - 1; // → 0=lun..6=dom
      const hora = dd.getUTCHours();
      const nextBoundary = (Math.floor(arMs / 3600_000) + 1) * 3600_000 + AR_OFFSET_MS;
      const fin = Math.min(end, nextBoundary);
      ci[diaIdx][hora] += (fin - cur) / 3600_000;
      cur = fin;
    }
  };
  for (const evs of porMedico.values()) {
    let openAt: number | null = null;
    for (const ev of evs) {
      if (ev.online) { if (openAt === null) openAt = ev.at; }
      else if (openAt !== null) { distribuir(openAt, ev.at); openAt = null; }
    }
    if (openAt !== null) distribuir(openAt, Math.min(now, openAt + CAP_MS));
  }
  // Redondear a 1 decimal
  for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) ci[d][h] = Math.round(ci[d][h] * 10) / 10;

  const totalCI = ci.flat().reduce((a, b) => a + b, 0);
  return NextResponse.json({
    dias,
    desde,
    diasNombres: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"],
    turnos,
    ci,
    hayDatosCI: totalCI > 0,
    totalMedicoHorasCI: Math.round(totalCI * 10) / 10,
    medicosConAgenda: new Set([...modeloMedico.values()]).size,
  });
}
