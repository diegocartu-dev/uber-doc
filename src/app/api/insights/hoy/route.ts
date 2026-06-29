import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin } from "@/lib/admin-auth";
import { setsDeTest, esTest, leerSoloReales, COMISION_DOCTO_POR_CONSULTA } from "@/lib/insights/filtro-test";

function fechaAR(offset = 0) {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  d.setDate(d.getDate() - offset);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const SLOT = new Set(["disponible", "bloqueado"]);

export async function GET(req: NextRequest) {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const admin = createAdminClient();
  const soloReales = leerSoloReales(req.nextUrl.searchParams);
  const sets = await setsDeTest(admin);
  const hoy = fechaAR(0);
  const hace7 = fechaAR(7);
  const hace30 = fechaAR(30);

  const [
    { data: consultasHoyRaw },
    { data: turnosHoyRaw },
    { data: consultas7d },
    { data: turnos7d },
    { count: ciEsperando },
    { data: medicosDispRaw },
    { data: consultasRecientes },
    { data: turnosRecientes },
    { data: consultasPacientes30d },
  ] = await Promise.all([
    admin.from("consultas").select("id, estado, created_at, medico_id, paciente_id, especialidad, canal_origen, aceptada_at, en_curso_at, completada_at").gte("created_at", hoy),
    admin.from("turnos").select("id, estado, fecha, hora_inicio, medico_id, paciente_id").eq("fecha", hoy),
    admin.from("consultas").select("id, estado, created_at, canal_origen, medico_id, paciente_id").gte("created_at", hace7).lte("created_at", hoy + "T00:00:00"),
    admin.from("turnos").select("id, estado, fecha, medico_id, paciente_id").gte("fecha", hace7).lte("fecha", hoy),
    admin.from("consultas").select("id", { count: "exact", head: true }).eq("estado", "esperando"),
    soloReales
      ? admin.from("medicos").select("id, nombre_completo, especialidad, disponible_desde, disponible_hasta").eq("verificado", true).eq("disponible", true).eq("es_cuenta_test", false)
      : admin.from("medicos").select("id, nombre_completo, especialidad, disponible_desde, disponible_hasta").eq("verificado", true).eq("disponible", true),
    admin.from("consultas").select("id, estado, created_at, medico_id, paciente_id, especialidad, canal_origen, aceptada_at, completada_at").gte("created_at", hoy).order("created_at", { ascending: false }).limit(20),
    admin.from("turnos").select("id, estado, fecha, hora_inicio, medico_id, paciente_id").eq("fecha", hoy).not("estado", "in", "(disponible,bloqueado)").order("hora_inicio", { ascending: false }).limit(20),
    admin.from("consultas").select("paciente_id, medico_id, created_at").eq("estado", "completada").gte("created_at", hace30),
  ]);

  // Filtro test unificado (médico O paciente). turnosHoy MANTIENE los slots porque se
  // usan para "Disponibles ahora" (modo Turno); para los conteos de atención se excluyen.
  const consultasHoy = (consultasHoyRaw ?? []).filter(c => !soloReales || !esTest(sets, c.medico_id, c.paciente_id));
  const turnosHoy = (turnosHoyRaw ?? []).filter(t => !soloReales || !esTest(sets, t.medico_id, t.paciente_id));
  const turnosAtencionHoy = turnosHoy.filter(t => !SLOT.has(t.estado)); // turnos reales (no slots)
  const medicosDisp = medicosDispRaw ?? [];
  const medicosActivos = medicosDisp.length;

  const completadasHoy = consultasHoy.filter(c => c.estado === "completada").length +
    turnosAtencionHoy.filter(t => t.estado === "completado").length;
  const totalHoy = consultasHoy.length + turnosAtencionHoy.length;
  const ciHoy = consultasHoy.filter(c => c.canal_origen !== "turno").length;
  const turnosHoyCount = turnosAtencionHoy.length;

  const completadas7dAgo = (consultas7d ?? []).filter(c => {
    const d = c.created_at?.slice(0, 10);
    return d === hace7 && c.estado === "completada" && (!soloReales || !esTest(sets, c.medico_id, c.paciente_id));
  }).length + (turnos7d ?? []).filter(t => t.fecha === hace7 && t.estado === "completado" && (!soloReales || !esTest(sets, t.medico_id, t.paciente_id))).length;

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
  const comisionDocto = completadasHoy * COMISION_DOCTO_POR_CONSULTA;

  // Espera promedio CI
  const ciConTiempo = (consultasHoy ?? []).filter(c => c.aceptada_at && c.created_at);
  const esperaPromMs = ciConTiempo.length > 0
    ? ciConTiempo.reduce((sum, c) => sum + (new Date(c.aceptada_at!).getTime() - new Date(c.created_at).getTime()), 0) / ciConTiempo.length
    : null;

  // Retención 30d (solo reales por default: excluye pacientes/médicos test).
  // Sin base de pacientes → null ("—" en la UI), nunca 0% ni 100% fantasma.
  const consPac30 = (consultasPacientes30d ?? []).filter(c => !soloReales || !esTest(sets, c.medico_id, c.paciente_id));
  const pacientesUnicos30d = new Set(consPac30.map(c => c.paciente_id));
  const pacientesRepeat = new Map<string, number>();
  for (const c of consPac30) {
    pacientesRepeat.set(c.paciente_id, (pacientesRepeat.get(c.paciente_id) ?? 0) + 1);
  }
  const repiten = [...pacientesRepeat.values()].filter(n => n > 1).length;
  const retencionPct = pacientesUnicos30d.size > 0 ? Math.round((repiten / pacientesUnicos30d.size) * 100) : null;

  // No-shows del médico hoy. El estado real es `ausente_medico` (NO `no_show`, que no
  // existe en la tabla turnos → la métrica daba 0 siempre, semáforo verde falso).
  const noShowsHoy = (turnosHoy ?? []).filter(t => t.estado === "ausente_medico").length;

  // Horas médico disponibles CI
  let horasDisp = 0;
  for (const m of medicosDisp ?? []) {
    const desde = m.disponible_desde ?? "08:00";
    const hasta = m.disponible_hasta ?? "18:00";
    const [hD, mD] = desde.split(":").map(Number);
    const [hH, mH] = hasta.split(":").map(Number);
    horasDisp += Math.max(0, (hH * 60 + mH - hD * 60 - mD) / 60);
  }

  // Cancelaciones tardías esta semana. Estados reales: `cancelado_paciente` /
  // `cancelado_medico` (NO `cancelado`, que no existe → la métrica daba 0 siempre).
  const { data: cancelsTardias } = await admin
    .from("turnos")
    .select("id, fecha, hora_inicio, updated_at")
    .in("estado", ["cancelado_paciente", "cancelado_medico"])
    .gte("fecha", hace7);

  let cancelTardiasCount = 0;
  for (const t of cancelsTardias ?? []) {
    if (!t.updated_at) continue;
    const turnoTime = new Date(`${t.fecha}T${t.hora_inicio}`).getTime();
    const cancelTime = new Date(t.updated_at).getTime();
    if (turnoTime - cancelTime < 48 * 60 * 60 * 1000) cancelTardiasCount++;
  }

  // Médicos con slots de agenda abiertos hoy (modo Turno para "Disponibles ahora").
  const medicosConTurnoHoy = new Set(turnosHoy.filter(t => t.estado === "disponible").map(t => t.medico_id));

  // ── Atenciones de hoy (reales, no slots — turnosRecientes ya excluye disponible/bloqueado) ──
  const allMedicoIds = [...new Set([
    ...(consultasRecientes ?? []).map(c => c.medico_id),
    ...(turnosRecientes ?? []).map(t => t.medico_id),
    ...medicosConTurnoHoy,
  ])];
  const allPacienteIds = [...new Set([...(consultasRecientes ?? []).map(c => c.paciente_id), ...(turnosRecientes ?? []).map(t => t.paciente_id)])];

  const [{ data: meds }, { data: pacs }] = await Promise.all([
    allMedicoIds.length > 0 ? admin.from("medicos").select("id, nombre_completo, especialidad, precio_consulta").in("id", allMedicoIds) : { data: [] },
    allPacienteIds.length > 0 ? admin.from("pacientes").select("user_id, id, nombre_completo").or(`user_id.in.(${allPacienteIds.join(",")}),id.in.(${allPacienteIds.join(",")})`) : { data: [] },
  ]);

  const medMap = new Map((meds ?? []).map(m => [m.id, m]));
  const pacMapUser = new Map((pacs ?? []).map(p => [p.user_id, p.nombre_completo]));
  const pacMapId = new Map((pacs ?? []).map(p => [p.id, p.nombre_completo]));
  const nombrePaciente = (pid: string) => pacMapUser.get(pid) ?? pacMapId.get(pid) ?? "—";

  const actividad = [
    ...(consultasRecientes ?? []).filter(c => !soloReales || !esTest(sets, c.medico_id, c.paciente_id)).map(c => {
      const med = medMap.get(c.medico_id);
      return {
        id: c.id, tipo: "CI" as const, estado: c.estado,
        medico: med?.nombre_completo ?? "—",
        paciente: nombrePaciente(c.paciente_id),
        especialidad: c.especialidad,
        precio: med?.precio_consulta ?? 0,
        inicio: c.created_at,
      };
    }),
    ...(turnosRecientes ?? []).filter(t => !soloReales || !esTest(sets, t.medico_id, t.paciente_id)).map(t => {
      const med = medMap.get(t.medico_id);
      return {
        id: t.id, tipo: "Turno" as const, estado: t.estado,
        medico: med?.nombre_completo ?? "—",
        paciente: nombrePaciente(t.paciente_id),
        especialidad: med?.especialidad ?? "",
        precio: med?.precio_consulta ?? 0,
        inicio: `${t.fecha}T${t.hora_inicio}`,
      };
    }),
  ].sort((a, b) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime()).slice(0, 12);

  // ── Disponibles ahora: quién puede atender en este momento y en qué modo ──
  // CI = flag `disponible` (con su ventana horaria). Turno = tiene slots de agenda
  // abiertos hoy. Un médico puede estar en ambos modos.
  const turnoSoloIds = [...medicosConTurnoHoy].filter(id => !medicosDisp.some(m => m.id === id));
  const disponiblesAhora = [
    ...medicosDisp.map(m => ({
      id: m.id,
      nombre: m.nombre_completo,
      especialidad: m.especialidad,
      modos: medicosConTurnoHoy.has(m.id) ? ["CI", "Turno"] : ["CI"],
      desde: m.disponible_desde ? String(m.disponible_desde).slice(0, 5) : null,
      hasta: m.disponible_hasta ? String(m.disponible_hasta).slice(0, 5) : null,
    })),
    ...turnoSoloIds.map(id => {
      const m = medMap.get(id);
      return {
        id,
        nombre: m?.nombre_completo ?? "—",
        especialidad: m?.especialidad ?? "",
        modos: ["Turno"],
        desde: null,
        hasta: null,
      };
    }),
  ];

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
    retencionBase: pacientesUnicos30d.size, // tamaño de muestra → la UI no pinta verde con n chico
    noShowsHoy,
    horasDisp: Math.round(horasDisp * 10) / 10,
    medicosDispCount: medicosDisp.length,
    cancelTardiasCount,
    disponiblesAhora,
    actividad,
  });
}
