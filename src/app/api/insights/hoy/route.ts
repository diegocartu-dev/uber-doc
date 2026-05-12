import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin } from "@/lib/admin-auth";

function fechaAR(offset = 0) {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  d.setDate(d.getDate() - offset);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function GET() {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const admin = createAdminClient();
  const hoy = fechaAR(0);
  const hace7 = fechaAR(7);
  const hace30 = fechaAR(30);

  const [
    { data: consultasHoy },
    { data: turnosHoy },
    { data: consultas7d },
    { data: turnos7d },
    { count: medicosActivos },
    { count: ciEsperando },
    { data: medicosDisp },
    { data: consultasRecientes },
    { data: turnosRecientes },
    { data: consultasPacientes30d },
  ] = await Promise.all([
    admin.from("consultas").select("id, estado, created_at, medico_id, paciente_id, especialidad, canal_origen, aceptada_at, en_curso_at, completada_at").gte("created_at", hoy),
    admin.from("turnos").select("id, estado, fecha, hora_inicio, medico_id, paciente_id").eq("fecha", hoy),
    admin.from("consultas").select("id, estado, created_at, canal_origen").gte("created_at", hace7).lte("created_at", hoy + "T00:00:00"),
    admin.from("turnos").select("id, estado, fecha").gte("fecha", hace7).lte("fecha", hoy),
    admin.from("medicos").select("id", { count: "exact", head: true }).eq("verificado", true).eq("disponible", true).eq("es_cuenta_test", false),
    admin.from("consultas").select("id", { count: "exact", head: true }).eq("estado", "esperando"),
    admin.from("medicos").select("id, disponible_desde, disponible_hasta").eq("verificado", true).eq("disponible", true).eq("es_cuenta_test", false),
    admin.from("consultas").select("id, estado, created_at, medico_id, paciente_id, especialidad, canal_origen, aceptada_at, completada_at").gte("created_at", hoy).order("created_at", { ascending: false }).limit(10),
    admin.from("turnos").select("id, estado, fecha, hora_inicio, medico_id, paciente_id").eq("fecha", hoy).order("hora_inicio", { ascending: false }).limit(10),
    admin.from("consultas").select("paciente_id, created_at").eq("estado", "completada").gte("created_at", hace30),
  ]);

  const completadasHoy = (consultasHoy ?? []).filter(c => c.estado === "completada").length +
    (turnosHoy ?? []).filter(t => t.estado === "completado").length;
  const totalHoy = (consultasHoy ?? []).length + (turnosHoy ?? []).length;
  const ciHoy = (consultasHoy ?? []).filter(c => c.canal_origen !== "turno").length;
  const turnosHoyCount = (turnosHoy ?? []).length;

  const completadas7dAgo = (consultas7d ?? []).filter(c => {
    const d = c.created_at?.slice(0, 10);
    return d === hace7 && c.estado === "completada";
  }).length + (turnos7d ?? []).filter(t => t.fecha === hace7 && t.estado === "completado").length;

  const delta = completadasHoy - completadas7dAgo;

  // GMV
  const medicoIds = [...new Set([
    ...(consultasHoy ?? []).filter(c => c.estado === "completada").map(c => c.medico_id),
    ...(turnosHoy ?? []).filter(t => t.estado === "completado").map(t => t.medico_id),
  ])];

  let gmv = 0;
  if (medicoIds.length > 0) {
    const { data: medPrecios } = await admin.from("medicos").select("id, precio_consulta").in("id", medicoIds);
    const precioMap = new Map((medPrecios ?? []).map(m => [m.id, m.precio_consulta ?? 0]));
    gmv = (consultasHoy ?? []).filter(c => c.estado === "completada").reduce((sum, c) => sum + (precioMap.get(c.medico_id) ?? 0), 0) +
      (turnosHoy ?? []).filter(t => t.estado === "completado").reduce((sum, t) => sum + (precioMap.get(t.medico_id) ?? 0), 0);
  }
  const comisionDocto = gmv * 0.05;

  // Espera promedio CI
  const ciConTiempo = (consultasHoy ?? []).filter(c => c.aceptada_at && c.created_at);
  const esperaPromMs = ciConTiempo.length > 0
    ? ciConTiempo.reduce((sum, c) => sum + (new Date(c.aceptada_at!).getTime() - new Date(c.created_at).getTime()), 0) / ciConTiempo.length
    : null;

  // Retención 30d
  const pacientesUnicos30d = new Set((consultasPacientes30d ?? []).map(c => c.paciente_id));
  const pacientesRepeat = new Map<string, number>();
  for (const c of consultasPacientes30d ?? []) {
    pacientesRepeat.set(c.paciente_id, (pacientesRepeat.get(c.paciente_id) ?? 0) + 1);
  }
  const repiten = [...pacientesRepeat.values()].filter(n => n > 1).length;
  const retencionPct = pacientesUnicos30d.size > 0 ? Math.round((repiten / pacientesUnicos30d.size) * 100) : 0;

  // No-shows hoy
  const noShowsHoy = (turnosHoy ?? []).filter(t => t.estado === "no_show").length;

  // Horas médico disponibles CI
  let horasDisp = 0;
  for (const m of medicosDisp ?? []) {
    const desde = m.disponible_desde ?? "08:00";
    const hasta = m.disponible_hasta ?? "18:00";
    const [hD, mD] = desde.split(":").map(Number);
    const [hH, mH] = hasta.split(":").map(Number);
    horasDisp += Math.max(0, (hH * 60 + mH - hD * 60 - mD) / 60);
  }

  // Cancelaciones tardías esta semana
  const { data: cancelsTardias } = await admin
    .from("turnos")
    .select("id, fecha, hora_inicio, updated_at")
    .eq("estado", "cancelado")
    .gte("fecha", hace7);

  let cancelTardiasCount = 0;
  for (const t of cancelsTardias ?? []) {
    if (!t.updated_at) continue;
    const turnoTime = new Date(`${t.fecha}T${t.hora_inicio}`).getTime();
    const cancelTime = new Date(t.updated_at).getTime();
    if (turnoTime - cancelTime < 48 * 60 * 60 * 1000) cancelTardiasCount++;
  }

  // Actividad reciente con nombres
  const allMedicoIds = [...new Set([...(consultasRecientes ?? []).map(c => c.medico_id), ...(turnosRecientes ?? []).map(t => t.medico_id)])];
  const allPacienteIds = [...new Set([...(consultasRecientes ?? []).map(c => c.paciente_id), ...(turnosRecientes ?? []).map(t => t.paciente_id)])];

  const [{ data: meds }, { data: pacs }] = await Promise.all([
    allMedicoIds.length > 0 ? admin.from("medicos").select("id, nombre_completo, precio_consulta, es_cuenta_test").in("id", allMedicoIds) : { data: [] },
    allPacienteIds.length > 0 ? admin.from("pacientes").select("user_id, id, nombre_completo").or(`user_id.in.(${allPacienteIds.join(",")}),id.in.(${allPacienteIds.join(",")})`) : { data: [] },
  ]);

  const testMedIds = new Set((meds ?? []).filter(m => m.es_cuenta_test).map(m => m.id));
  const medMap = new Map((meds ?? []).filter(m => !m.es_cuenta_test).map(m => [m.id, m]));
  const pacMapUser = new Map((pacs ?? []).map(p => [p.user_id, p.nombre_completo]));
  const pacMapId = new Map((pacs ?? []).map(p => [p.id, p.nombre_completo]));

  const actividad = [
    ...(consultasRecientes ?? []).filter(c => !testMedIds.has(c.medico_id)).map(c => {
      const med = medMap.get(c.medico_id);
      return {
        id: c.id, tipo: "CI" as const, estado: c.estado,
        medico: med?.nombre_completo ?? "—",
        paciente: pacMapUser.get(c.paciente_id) ?? "Paciente",
        especialidad: c.especialidad,
        precio: med?.precio_consulta ?? 0,
        inicio: c.created_at,
      };
    }),
    ...(turnosRecientes ?? []).filter(t => !testMedIds.has(t.medico_id)).map(t => {
      const med = medMap.get(t.medico_id);
      return {
        id: t.id, tipo: "Turno" as const, estado: t.estado,
        medico: med?.nombre_completo ?? "—",
        paciente: pacMapId.get(t.paciente_id) ?? "Paciente",
        especialidad: "",
        precio: med?.precio_consulta ?? 0,
        inicio: `${t.fecha}T${t.hora_inicio}`,
      };
    }),
  ].sort((a, b) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime()).slice(0, 10);

  return NextResponse.json({
    completadasHoy,
    totalHoy,
    delta,
    ciHoy,
    turnosHoy: turnosHoyCount,
    medicosActivos: medicosActivos ?? 0,
    ciEsperando: ciEsperando ?? 0,
    gmv,
    comisionDocto,
    esperaPromMs,
    retencionPct,
    noShowsHoy,
    horasDisp: Math.round(horasDisp * 10) / 10,
    medicosDispCount: (medicosDisp ?? []).length,
    cancelTardiasCount,
    actividad,
  });
}
