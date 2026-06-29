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

// Estados de turno que NO son atenciones (slots de agenda). Se excluyen de todo conteo.
const SLOT = new Set(["disponible", "bloqueado"]);
const ATENDIDA = new Set(["completada", "completado", "en_curso"]);

export async function GET(req: NextRequest) {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const dias = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("dias") ?? "30", 10) || 30, 1), 365);
  const soloReales = leerSoloReales(req.nextUrl.searchParams);
  const desde = fechaAR(dias);
  const hoy = fechaAR(0);
  const admin = createAdminClient();

  const [{ data: medicosRaw }, { data: consultasRaw }, { data: turnosRaw }, sets] = await Promise.all([
    admin.from("medicos").select("id, nombre_completo, especialidad, precio_consulta, disponible, verificado, estado_registro, es_cuenta_test").eq("verificado", true),
    admin.from("consultas").select("id, estado, medico_id, paciente_id, canal_origen, created_at, aceptada_at").gte("created_at", desde),
    admin.from("turnos").select("id, estado, medico_id, paciente_id, fecha, updated_at, hora_inicio").gte("fecha", desde),
    setsDeTest(admin),
  ]);

  // Filtro test unificado (médico O paciente) + sacar slots de agenda (no son atenciones).
  const medicos = (medicosRaw ?? []).filter((m) => !soloReales || !m.es_cuenta_test);
  const consultas = (consultasRaw ?? []).filter((c) => !soloReales || !esTest(sets, c.medico_id, c.paciente_id));
  const turnos = (turnosRaw ?? [])
    .filter((t) => !SLOT.has(t.estado))
    .filter((t) => !soloReales || !esTest(sets, t.medico_id, t.paciente_id));

  const stats = medicos.map(m => {
    const misConsultas = consultas.filter(c => c.medico_id === m.id);
    const misTurnos = turnos.filter(t => t.medico_id === m.id);
    const completadas = misConsultas.filter(c => c.estado === "completada").length + misTurnos.filter(t => t.estado === "completado").length;
    const canceladas = misConsultas.filter(c => c.estado === "cancelada").length + misTurnos.filter(t => t.estado === "cancelado_paciente" || t.estado === "cancelado_medico").length;
    const noShows = misTurnos.filter(t => t.estado === "ausente_medico").length;
    const total = misConsultas.length + misTurnos.length; // todas las atenciones (sin slots)
    const gmv = completadas * (m.precio_consulta ?? 0);

    const ciConEspera = misConsultas.filter(c => c.aceptada_at && c.created_at);
    const esperaPromMs = ciConEspera.length > 0
      ? ciConEspera.reduce((s, c) => s + (new Date(c.aceptada_at!).getTime() - new Date(c.created_at).getTime()), 0) / ciConEspera.length
      : null;

    const pacientes = new Set([...misConsultas.map(c => c.paciente_id), ...misTurnos.map(t => t.paciente_id)]);
    const pacientesRepeat = new Map<string, number>();
    for (const c of misConsultas) pacientesRepeat.set(c.paciente_id, (pacientesRepeat.get(c.paciente_id) ?? 0) + 1);
    for (const t of misTurnos) pacientesRepeat.set(t.paciente_id, (pacientesRepeat.get(t.paciente_id) ?? 0) + 1);
    const repiten = [...pacientesRepeat.values()].filter(n => n > 1).length;
    // Sin pacientes → retención indefinida ("—"), NO 0% ni 100%.
    const retencion = pacientes.size > 0 ? Math.round((repiten / pacientes.size) * 100) : null;

    // Última actividad: solo atenciones que OCURRIERON (atendidas) y nunca futura
    // (antes tomaba la fecha de slots de agenda futura → "30/7/2026").
    const ultimaAct = [
      ...misConsultas.filter(c => ATENDIDA.has(c.estado)).map(c => c.created_at).filter((d): d is string => !!d && d.slice(0, 10) <= hoy),
      ...misTurnos.filter(t => ATENDIDA.has(t.estado)).map(t => t.fecha).filter((d): d is string => !!d && d.slice(0, 10) <= hoy),
    ].sort().pop() ?? null;

    return {
      id: m.id,
      nombre: m.nombre_completo,
      especialidad: m.especialidad,
      disponible: m.disponible,
      consultas: completadas, // atendidas (compat con el cliente)
      atendidas: completadas,
      total,
      canceladas,
      noShows,
      gmv,
      comision: completadas * COMISION_DOCTO_POR_CONSULTA,
      esperaPromMs,
      retencion,
      ultimaActividad: ultimaAct,
    };
  });

  stats.sort((a, b) => b.gmv - a.gmv);

  return NextResponse.json({ medicos: stats });
}
