import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin } from "@/lib/admin-auth";

type TipoCancelacion =
  | "cancelado_medico"
  | "cancelado_paciente"
  | "ausente_paciente"
  | "ausente_medico"
  | "cancelada_sistema"
  | "cancelada";

interface CancelacionRow {
  id: string;
  tipo: "CI" | "Turno";
  modalidad: string;
  estado: string;
  medico_id: string;
  medico: string;
  paciente: string;
  fecha: string;
  motivo: string | null;
  reembolso: string | null;
}

interface MedicoStats {
  medico_id: string;
  medico: string;
  total_turnos: number;
  canceladas_por_el: number;
  plantadas_no_inicio: number;
  canceladas_por_pacientes: number;
  tasa_total: number;
}

function getDateRange(periodo: string, desde?: string, hasta?: string) {
  const now = new Date();
  const arNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));

  if (periodo === "personalizado" && desde) {
    return {
      desde: desde,
      hasta: hasta ? hasta + "T23:59:59" : new Date().toISOString(),
    };
  }

  const pad = (n: number) => n.toString().padStart(2, "0");
  const hoy = `${arNow.getFullYear()}-${pad(arNow.getMonth() + 1)}-${pad(arNow.getDate())}`;

  if (periodo === "hoy") {
    return { desde: hoy, hasta: hoy + "T23:59:59" };
  }

  if (periodo === "semana") {
    const weekAgo = new Date(arNow);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekStr = `${weekAgo.getFullYear()}-${pad(weekAgo.getMonth() + 1)}-${pad(weekAgo.getDate())}`;
    return { desde: weekStr, hasta: hoy + "T23:59:59" };
  }

  // mes (default)
  const monthAgo = new Date(arNow);
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  const monthStr = `${monthAgo.getFullYear()}-${pad(monthAgo.getMonth() + 1)}-${pad(monthAgo.getDate())}`;
  return { desde: monthStr, hasta: hoy + "T23:59:59" };
}

const CANCEL_STATES_TURNOS = ["cancelado_paciente", "cancelado_medico", "ausente_paciente", "ausente_medico"];

export async function GET(req: NextRequest) {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const periodo = req.nextUrl.searchParams.get("periodo") ?? "mes";
  const desde = req.nextUrl.searchParams.get("desde") ?? undefined;
  const hasta = req.nextUrl.searchParams.get("hasta") ?? undefined;
  const filtroMedico = req.nextUrl.searchParams.get("medico") ?? undefined;
  const filtroTipo = req.nextUrl.searchParams.get("tipo_cancelacion") ?? undefined;
  const filtroModalidad = req.nextUrl.searchParams.get("modalidad") ?? undefined;

  const range = getDateRange(periodo, desde, hasta);
  const admin = createAdminClient();

  const desdeDate = range.desde.slice(0, 10);
  const hastaDate = (range.hasta ?? "").slice(0, 10);

  // Fetch cancelled turnos (filter by fecha for consistency with totalTurnos)
  let turnosQuery = admin
    .from("turnos")
    .select("id, estado, fecha, hora_inicio, medico_id, paciente_id, motivo_cancelacion, reintegro_estado, updated_at")
    .in("estado", CANCEL_STATES_TURNOS)
    .gte("fecha", desdeDate)
    .lte("fecha", hastaDate)
    .order("fecha", { ascending: false })
    .limit(500);

  if (filtroMedico) turnosQuery = turnosQuery.eq("medico_id", filtroMedico);

  // Fetch cancelled consultas
  let consultasQuery = admin
    .from("consultas")
    .select("id, estado, created_at, medico_id, paciente_id, especialidad")
    .eq("estado", "cancelada")
    .gte("created_at", range.desde)
    .lte("created_at", range.hasta)
    .order("created_at", { ascending: false })
    .limit(500);

  if (filtroMedico) consultasQuery = consultasQuery.eq("medico_id", filtroMedico);

  // Fetch total turnos for the period (same fecha filter as cancelled)
  const totalTurnosQuery = admin
    .from("turnos")
    .select("id, medico_id, estado", { count: "exact", head: false })
    .gte("fecha", desdeDate)
    .lte("fecha", hastaDate)
    .not("estado", "in", '("disponible","bloqueado")');

  // Fetch total consultas for the period (for correct tasa_global denominator)
  const totalConsultasQuery = admin
    .from("consultas")
    .select("id", { count: "exact", head: true })
    .gte("created_at", range.desde)
    .lte("created_at", range.hasta);

  const [turnosResult, consultasResult, totalTurnosResult, totalConsultasResult] = await Promise.all([
    turnosQuery,
    consultasQuery,
    totalTurnosQuery,
    totalConsultasQuery,
  ]);

  const turnosCancelados = turnosResult.data ?? [];
  const consultasCanceladas = consultasResult.data ?? [];
  const totalTurnos = totalTurnosResult.data ?? [];
  const totalConsultasCount = totalConsultasResult.count ?? 0;

  // Resolve medico and paciente names
  const medicoIds = [...new Set([
    ...turnosCancelados.map((t) => t.medico_id),
    ...consultasCanceladas.map((c) => c.medico_id),
  ].filter(Boolean))];

  const pacienteIdsFromTurnos = turnosCancelados.map((t) => t.paciente_id).filter(Boolean);
  const pacienteIdsFromConsultas = consultasCanceladas.map((c) => c.paciente_id).filter(Boolean);

  const [{ data: medicos }, { data: pacientesById }, { data: pacientesByUserId }] = await Promise.all([
    medicoIds.length > 0
      ? admin.from("medicos").select("id, nombre_completo").in("id", medicoIds)
      : { data: [] },
    pacienteIdsFromTurnos.length > 0
      ? admin.from("pacientes").select("id, nombre_completo").in("id", pacienteIdsFromTurnos)
      : { data: [] },
    pacienteIdsFromConsultas.length > 0
      ? admin.from("pacientes").select("id, user_id, nombre_completo").in("user_id", pacienteIdsFromConsultas)
      : { data: [] },
  ]);

  const medMap = new Map((medicos ?? []).map((m) => [m.id, m.nombre_completo]));
  const pacMapId = new Map((pacientesById ?? []).map((p) => [p.id, p.nombre_completo]));
  const pacMapUserId = new Map((pacientesByUserId ?? []).map((p) => [p.user_id, p.nombre_completo]));

  // Build cancelaciones list
  const cancelaciones: CancelacionRow[] = [];

  for (const t of turnosCancelados) {
    const tipo = t.estado as TipoCancelacion;
    if (filtroTipo && tipo !== filtroTipo) continue;
    if (filtroModalidad && filtroModalidad !== "Turno") continue;

    cancelaciones.push({
      id: t.id,
      tipo: "Turno",
      modalidad: "Turno",
      estado: t.estado,
      medico_id: t.medico_id,
      medico: medMap.get(t.medico_id) ?? "—",
      paciente: pacMapId.get(t.paciente_id) ?? "Paciente",
      fecha: t.updated_at ?? `${t.fecha}T${t.hora_inicio}`,
      motivo: t.motivo_cancelacion ?? null,
      reembolso: t.reintegro_estado ?? null,
    });
  }

  for (const c of consultasCanceladas) {
    if (filtroTipo && filtroTipo !== "cancelada") continue;
    if (filtroModalidad && filtroModalidad !== "CI") continue;

    cancelaciones.push({
      id: c.id,
      tipo: "CI",
      modalidad: "CI",
      estado: "cancelada",
      medico_id: c.medico_id,
      medico: medMap.get(c.medico_id) ?? "—",
      paciente: pacMapUserId.get(c.paciente_id) ?? "Paciente",
      fecha: c.created_at,
      motivo: null,
      reembolso: null,
    });
  }

  cancelaciones.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  // KPIs
  const totalCancelaciones = cancelaciones.length;
  const totalConsultasTurnos = totalTurnos.length + totalConsultasCount;
  const tasaGlobal = totalConsultasTurnos > 0 ? totalCancelaciones / totalConsultasTurnos : 0;

  const porTipo = {
    cancelado_medico: turnosCancelados.filter((t) => t.estado === "cancelado_medico").length,
    cancelado_paciente: turnosCancelados.filter((t) => t.estado === "cancelado_paciente").length,
    ausente_paciente: turnosCancelados.filter((t) => t.estado === "ausente_paciente").length,
    ausente_medico: turnosCancelados.filter((t) => t.estado === "ausente_medico").length,
    cancelada_ci: consultasCanceladas.length,
  };

  // Per-medico stats
  const medicoStatsMap = new Map<string, {
    total: number;
    canceladas_por_el: number;
    plantadas: number;
    canceladas_por_pac: number;
  }>();

  for (const t of totalTurnos) {
    if (!t.medico_id) continue;
    const entry = medicoStatsMap.get(t.medico_id) ?? { total: 0, canceladas_por_el: 0, plantadas: 0, canceladas_por_pac: 0 };
    entry.total++;
    medicoStatsMap.set(t.medico_id, entry);
  }

  for (const t of turnosCancelados) {
    if (!t.medico_id) continue;
    const entry = medicoStatsMap.get(t.medico_id) ?? { total: 0, canceladas_por_el: 0, plantadas: 0, canceladas_por_pac: 0 };
    if (t.estado === "cancelado_medico") entry.canceladas_por_el++;
    else if (t.estado === "ausente_medico") entry.plantadas++;
    else if (t.estado === "cancelado_paciente") entry.canceladas_por_pac++;
    else if (t.estado === "ausente_paciente") entry.canceladas_por_pac++;
    medicoStatsMap.set(t.medico_id, entry);
  }

  const medicoStats: MedicoStats[] = [];
  for (const [medicoId, stats] of medicoStatsMap) {
    if (stats.total === 0) continue;
    const totalCancel = stats.canceladas_por_el + stats.plantadas + stats.canceladas_por_pac;
    medicoStats.push({
      medico_id: medicoId,
      medico: medMap.get(medicoId) ?? "—",
      total_turnos: stats.total,
      canceladas_por_el: stats.canceladas_por_el,
      plantadas_no_inicio: stats.plantadas,
      canceladas_por_pacientes: stats.canceladas_por_pac,
      tasa_total: totalCancel / stats.total,
    });
  }

  medicoStats.sort((a, b) => b.tasa_total - a.tasa_total);

  // Platform averages for coloring
  const totalMedicos = medicoStats.length || 1;
  const promedios = {
    canceladas_por_el: medicoStats.reduce((s, m) => s + (m.total_turnos > 0 ? m.canceladas_por_el / m.total_turnos : 0), 0) / totalMedicos,
    plantadas_no_inicio: medicoStats.reduce((s, m) => s + (m.total_turnos > 0 ? m.plantadas_no_inicio / m.total_turnos : 0), 0) / totalMedicos,
    canceladas_por_pacientes: medicoStats.reduce((s, m) => s + (m.total_turnos > 0 ? m.canceladas_por_pacientes / m.total_turnos : 0), 0) / totalMedicos,
    tasa_total: medicoStats.reduce((s, m) => s + m.tasa_total, 0) / totalMedicos,
  };

  return NextResponse.json({
    kpis: {
      total_cancelaciones: totalCancelaciones,
      tasa_global: tasaGlobal,
      por_tipo: porTipo,
    },
    cancelaciones,
    medico_stats: medicoStats,
    promedios,
    medicos_disponibles: medicoIds.map((id) => ({ id, nombre: medMap.get(id) ?? "—" })),
  });
}
