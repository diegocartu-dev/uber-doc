import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin } from "@/lib/admin-auth";
import { leerSoloReales } from "@/lib/insights/filtro-test";

// Panel "Oferta por horario": oferta de atención por FECHA CONCRETA × hora.
//   - ci:     médico-horas de Consulta Inmediata ofertadas (histórico, del log de
//             disponibilidad). Ventana: HOY y los `dias` días hacia atrás.
//   - turnos: # de médicos con turnos programados habilitados, proyectando la
//             agenda recurrente (agenda_franjas por día de semana) sobre cada fecha
//             real y respetando la vigencia del modelo (fecha_inicio/fecha_fin +
//             activo). Ventana: 7 días atrás · HOY · 30 días adelante.
//
// Argentina es UTC-3 fijo (sin DST): trabajamos en "AR epoch" = utcMs - 3h.

const AR_OFFSET_MS = 3 * 3600_000;
const CAP_MS = 16 * 3600_000; // intervalo de CI abierto se capea a 16h
const DOW_LABEL = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]; // getUTCDay: 0=dom

const TURNOS_ATRAS = 7;
const TURNOS_ADELANTE = 30;

// dayIdx = días enteros desde epoch en horario AR
function arDayIndex(utcMs: number): number {
  return Math.floor((utcMs - AR_OFFSET_MS) / 86_400_000);
}
function diaInfo(dayIdx: number) {
  const arDate = new Date(dayIdx * 86_400_000); // medianoche AR leída con getUTC*
  const y = arDate.getUTCFullYear();
  const m = arDate.getUTCMonth() + 1;
  const day = arDate.getUTCDate();
  const dow = arDate.getUTCDay();            // 0=dom..6=sáb (AR)
  const diaSemanaDB = dow === 0 ? 7 : dow;   // 1=lun..7=dom (igual que agenda_franjas)
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { dayIdx, iso, dow, diaSemanaDB, label: `${DOW_LABEL[dow]} ${day}/${m}` };
}

export async function GET(req: NextRequest) {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const dias = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("dias") ?? "7", 10) || 7, 1), 90);
  const soloReales = leerSoloReales(req.nextUrl.searchParams);
  const admin = createAdminClient();

  const hoyIdx = arDayIndex(Date.now());

  // Ventanas (listas de dayIdx)
  const ciDias: number[] = [];
  for (let i = 0; i < dias; i++) ciDias.push(hoyIdx - i); // hoy→atrás (hoy arriba)
  const turnoDias: number[] = [];
  for (let i = -TURNOS_ATRAS; i <= TURNOS_ADELANTE; i++) turnoDias.push(hoyIdx + i); // atrás→futuro

  // 1 día de margen para el query del log (at es timestamptz; evita perder
  // eventos de las primeras horas del día más viejo por el desfase UTC/AR).
  const desdeISO = diaInfo(Math.min(hoyIdx - dias, hoyIdx - TURNOS_ATRAS) - 1).iso;

  const [{ data: medicos }, { data: modelos }, { data: franjas }, { data: log }] = await Promise.all([
    soloReales
      ? admin.from("medicos").select("id, nombre_completo, especialidad").eq("verificado", true).eq("es_cuenta_test", false)
      : admin.from("medicos").select("id, nombre_completo, especialidad").eq("verificado", true),
    admin.from("agenda_modelos").select("id, medico_id, activo, fecha_inicio, fecha_fin"),
    admin.from("agenda_franjas").select("modelo_id, dia_semana, hora_inicio, hora_fin"),
    admin.from("disponibilidad_log").select("medico_id, online, at").gte("at", desdeISO).order("at", { ascending: true }),
  ]);

  const medicosOk = new Set((medicos ?? []).map((m) => m.id));
  const franjasPorModelo = new Map<string, { dia: number; hIni: number; hFinIncl: number }[]>();
  for (const f of franjas ?? []) {
    const hIni = parseInt(String(f.hora_inicio).slice(0, 2), 10);
    const hFin = parseInt(String(f.hora_fin).slice(0, 2), 10);
    const mFin = parseInt(String(f.hora_fin).slice(3, 5), 10);
    const hFinIncl = mFin > 0 ? hFin : hFin - 1;
    if (!franjasPorModelo.has(f.modelo_id)) franjasPorModelo.set(f.modelo_id, []);
    franjasPorModelo.get(f.modelo_id)!.push({ dia: f.dia_semana as number, hIni, hFinIncl });
  }
  const modelosActivos = (modelos ?? []).filter((mo) => mo.activo && medicosOk.has(mo.medico_id));

  // ── Turnos: por cada fecha, # médicos con agenda habilitada en cada hora ──
  const turnosFilas = turnoDias.map((dayIdx) => diaInfo(dayIdx));
  const turnosMatriz = turnosFilas.map((d) => {
    const sets: Set<string>[] = Array.from({ length: 24 }, () => new Set<string>());
    for (const mo of modelosActivos) {
      // vigencia del modelo en esta fecha (fecha_inicio/fecha_fin son `date`)
      const fi = mo.fecha_inicio ? String(mo.fecha_inicio).slice(0, 10) : null;
      const ff = mo.fecha_fin ? String(mo.fecha_fin).slice(0, 10) : null;
      if (fi && d.iso < fi) continue;
      if (ff && d.iso > ff) continue;
      for (const fr of franjasPorModelo.get(mo.id) ?? []) {
        if (fr.dia !== d.diaSemanaDB) continue;
        for (let h = fr.hIni; h <= fr.hFinIncl; h++) if (h >= 0 && h < 24) sets[h].add(mo.medico_id);
      }
    }
    return sets.map((s) => s.size);
  });

  // ── CI: médico-horas por fecha (índice de día) × hora ──
  const ciPorDia = new Map<number, number[]>(); // dayIdx → [24]
  const ensure = (idx: number) => {
    if (!ciPorDia.has(idx)) ciPorDia.set(idx, new Array(24).fill(0));
    return ciPorDia.get(idx)!;
  };
  const distribuir = (start: number, end: number) => {
    let cur = start;
    while (cur < end) {
      const arMs = cur - AR_OFFSET_MS;
      const dayIdx = Math.floor(arMs / 86_400_000);
      const hora = Math.floor(arMs / 3600_000) % 24;
      const nextBoundary = (Math.floor(arMs / 3600_000) + 1) * 3600_000 + AR_OFFSET_MS;
      const fin = Math.min(end, nextBoundary);
      ensure(dayIdx)[hora] += (fin - cur) / 3600_000;
      cur = fin;
    }
  };
  const porMedico = new Map<string, { online: boolean; at: number }[]>();
  for (const ev of log ?? []) {
    if (!porMedico.has(ev.medico_id)) porMedico.set(ev.medico_id, []);
    porMedico.get(ev.medico_id)!.push({ online: ev.online, at: new Date(ev.at).getTime() });
  }
  const now = Date.now();
  const ciHorasPorMedico = new Map<string, number>(); // para el resumen "quién oferta CI"
  for (const [medicoId, evs] of porMedico.entries()) {
    let openAt: number | null = null;
    let horas = 0;
    for (const ev of evs) {
      if (ev.online) { if (openAt === null) openAt = ev.at; }
      else if (openAt !== null) { distribuir(openAt, ev.at); horas += (ev.at - openAt) / 3600_000; openAt = null; }
    }
    if (openAt !== null) { const fin = Math.min(now, openAt + CAP_MS); distribuir(openAt, fin); horas += (fin - openAt) / 3600_000; }
    if (horas > 0) ciHorasPorMedico.set(medicoId, horas);
  }

  const ciFilas = ciDias.map((dayIdx) => diaInfo(dayIdx));
  const ciMatriz = ciDias.map((dayIdx) =>
    (ciPorDia.get(dayIdx) ?? new Array(24).fill(0)).map((v) => Math.round(v * 10) / 10)
  );

  const hoyISO = diaInfo(hoyIdx).iso;
  const totalCI = ciMatriz.flat().reduce((a, b) => a + b, 0);

  // ── Identidad: quién oferta (médico + especialidad) y qué especialidades quedan sin
  //    oferta a pesar de tener médicos registrados (la brecha de activación). ──
  const medMap = new Map(
    (medicos ?? []).map((m) => [m.id, { nombre: m.nombre_completo ?? "—", especialidad: m.especialidad ?? "Sin especialidad" }]),
  );
  const turnosMedicoSet = new Set<string>();
  for (const mo of modelosActivos) {
    if ((franjasPorModelo.get(mo.id) ?? []).length > 0) turnosMedicoSet.add(mo.medico_id);
  }
  const medicosOferta = [...medMap.entries()]
    .map(([id, m]) => ({
      nombre: m.nombre,
      especialidad: m.especialidad,
      ciHoras: Math.round((ciHorasPorMedico.get(id) ?? 0) * 10) / 10,
      turnos: turnosMedicoSet.has(id),
    }))
    .filter((m) => m.ciHoras > 0 || m.turnos)
    .sort((a, b) => (b.ciHoras + (b.turnos ? 1000 : 0)) - (a.ciHoras + (a.turnos ? 1000 : 0)));

  // Cobertura por especialidad (sobre médicos verificados no-test registrados)
  const porEsp = new Map<string, { total: number; conOferta: number }>();
  for (const [id, m] of medMap) {
    if (!porEsp.has(m.especialidad)) porEsp.set(m.especialidad, { total: 0, conOferta: 0 });
    const e = porEsp.get(m.especialidad)!;
    e.total++;
    if (ciHorasPorMedico.has(id) || turnosMedicoSet.has(id)) e.conOferta++;
  }
  const especialidadesSinOferta = [...porEsp.entries()]
    .filter(([, v]) => v.conOferta === 0)
    .map(([especialidad, v]) => ({ especialidad, medicos: v.total }))
    .sort((a, b) => b.medicos - a.medicos);
  const especialidadesConOferta = [...porEsp.values()].filter((v) => v.conOferta > 0).length;

  return NextResponse.json({
    hoy: hoyISO,
    dias,
    ci: {
      filas: ciFilas.map((d) => ({ iso: d.iso, label: d.label, esHoy: d.iso === hoyISO })),
      matriz: ciMatriz,
    },
    turnos: {
      filas: turnosFilas.map((d) => ({ iso: d.iso, label: d.label, esHoy: d.iso === hoyISO })),
      matriz: turnosMatriz,
    },
    hayDatosCI: totalCI > 0,
    totalMedicoHorasCI: Math.round(totalCI * 10) / 10,
    medicosConAgenda: new Set(modelosActivos.map((m) => m.medico_id)).size,
    // Resumen de identidad
    medicosOferta,
    medicosRegistrados: medMap.size,
    especialidadesConOferta,
    especialidadesSinOferta,
  });
}
