import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin } from "@/lib/admin-auth";
import { setsDeTest, esTest, leerSoloReales } from "@/lib/insights/filtro-test";
import { cobradoDe, comisionTotalDe } from "@/lib/insights/plata";
import { fechaAR, medianocheARenUTC, fechaARdeISO } from "@/lib/insights/fechas";

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

  const [{ data: medicosRaw }, { data: consultasRaw }, { data: turnosRaw }, { data: refundsRaw }, sets] = await Promise.all([
    admin.from("medicos").select("id, nombre_completo, especialidad, disponible, verificado, estado_registro, es_cuenta_test, jurisdicciones").eq("verificado", true),
    admin.from("consultas").select("id, estado, medico_id, paciente_id, canal_origen, created_at, aceptada_at, monto, mp_status, mp_application_fee, comision_docto_pct").gte("created_at", medianocheARenUTC(desde)),
    admin.from("turnos").select("id, estado, medico_id, paciente_id, fecha, updated_at, hora_inicio, monto, mp_status, mp_application_fee, comision_docto_pct, turno_origen_id").gte("fecha", desde),
    // Refunds ejecutados: esos pagos siguen "approved" en consultas/turnos pero la
    // plata VOLVIÓ al paciente (caso turno de Alexandra 24/07) — se excluyen del cobrado.
    admin.from("refunds_pendientes").select("tipo, recurso_id").eq("estado", "resuelto"),
    setsDeTest(admin),
  ]);
  const refundeados = new Set((refundsRaw ?? []).map((r) => `${r.tipo}:${r.recurso_id}`));
  // Un turno reprogramado guarda la plata en la fila ORIGINAL de la cadena
  // (el pago viaja por turno_origen_id) — si el refund apunta a la fila final,
  // hay que excluir también a sus ancestros (caso Alexandra/Glauciana 24/07).
  {
    const origenDe = new Map((turnosRaw ?? []).map((t) => [t.id, t.turno_origen_id as string | null]));
    for (const r of refundsRaw ?? []) {
      if (r.tipo !== "turno") continue;
      let cursor = origenDe.get(r.recurso_id) ?? null;
      for (let paso = 0; cursor && paso < 10; paso++) {
        refundeados.add(`turno:${cursor}`);
        cursor = origenDe.get(cursor) ?? null;
      }
    }
  }

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
    // Plata REAL (ver lib/insights/plata.ts): lo aprobado en MP y el fee que MP
    // registró — muere el GMV teórico (precio de lista × atendidas) y el
    // hardcode de $1.500 por consulta.
    const filasPago = [
      ...misConsultas.filter(c => !refundeados.has(`consulta:${c.id}`)),
      ...misTurnos.filter(t => !refundeados.has(`turno:${t.id}`)),
    ];
    const cobrado = cobradoDe(filasPago);
    const comision = comisionTotalDe(filasPago);

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
      // fechaARdeISO: el día ARGENTINO de la consulta — el slice del ISO UTC
      // corría al día siguiente las de 21:00-24:00 ART.
      ...misConsultas.filter(c => ATENDIDA.has(c.estado) && c.created_at).map(c => fechaARdeISO(c.created_at)).filter(d => d <= hoy),
      ...misTurnos.filter(t => ATENDIDA.has(t.estado)).map(t => t.fecha).filter((d): d is string => !!d && d <= hoy),
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
      cobrado,
      comision,
      jurisdicciones: (m.jurisdicciones as string[] | null) ?? [],
      esperaPromMs,
      retencion,
      ultimaActividad: ultimaAct,
    };
  });

  stats.sort((a, b) => b.cobrado - a.cobrado);

  return NextResponse.json({ medicos: stats });
}
