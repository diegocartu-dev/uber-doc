import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin } from "@/lib/admin-auth";
import { setsDeTest, esTest, leerSoloReales } from "@/lib/insights/filtro-test";
import { cobradoDe, comisionTotalDe } from "@/lib/insights/plata";
import { fechaAR, medianocheARenUTC, fechaARdeISO } from "@/lib/insights/fechas";
import { sinReservasAbandonadas, soloActividadReal } from "@/lib/insights/reservas";

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
    admin.from("medicos").select("id, nombre_completo, especialidad, disponible, verificado, estado_registro, es_cuenta_test, jurisdicciones, precio_consulta").eq("verificado", true),
    admin.from("consultas").select("id, estado, medico_id, paciente_id, canal_origen, created_at, monto, mp_status, mp_application_fee, comision_docto_pct, reintegro_estado, resolucion_motivo").gte("created_at", medianocheARenUTC(desde)),
    admin.from("turnos").select("id, estado, medico_id, paciente_id, fecha, updated_at, hora_inicio, monto, mp_status, mp_application_fee, comision_docto_pct, turno_origen_id, canal_origen, reservado_hasta, reintegro_estado, resolucion_motivo").gte("fecha", desde),
    // Refunds ejecutados: esos pagos siguen "approved" en consultas/turnos pero la
    // plata VOLVIÓ al paciente (caso turno de Alexandra 24/07) — se excluyen del cobrado.
    admin.from("refunds_pendientes").select("tipo, recurso_id").eq("estado", "resuelto"),
    setsDeTest(admin),
  ]);
  const refundeados = new Set((refundsRaw ?? []).map((r) => `${r.tipo}:${r.recurso_id}`));

  // Valor por canal (pedido Diego 27/07): el monto de la ÚLTIMA CI y del ÚLTIMO
  // turno de cada médico, sobre TODO el histórico (no la ventana del período).
  // Escala actual (~centenares de filas) banca el reduce en JS sin distinct-on.
  const [{ data: ultimasCI }, { data: ultimosTurnos }] = await Promise.all([
    admin.from("consultas").select("medico_id, monto, created_at").not("monto", "is", null).order("created_at", { ascending: false }).limit(2000),
    admin.from("turnos").select("medico_id, monto, fecha, hora_inicio").not("monto", "is", null).order("fecha", { ascending: false }).order("hora_inicio", { ascending: false }).limit(2000),
  ]);
  const valorCIde = new Map<string, number>();
  for (const c of ultimasCI ?? []) if (!valorCIde.has(c.medico_id)) valorCIde.set(c.medico_id, Number(c.monto));
  const valorTurnoDe = new Map<string, number>();
  for (const t of ultimosTurnos ?? []) if (!valorTurnoDe.has(t.medico_id)) valorTurnoDe.set(t.medico_id, Number(t.monto));
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
  // + reservas ABANDONADAS afuera (ver lib/insights/reservas.ts): retención de
  // 15 min vencida sin pago = el paciente se arrepintió y el slot ya está libre.
  // Inflaban el "total" de atenciones del médico sin ser nada.
  const turnos = sinReservasAbandonadas(
    (turnosRaw ?? [])
      .filter((t) => !SLOT.has(t.estado))
      .filter((t) => !soloReales || !esTest(sets, t.medico_id, t.paciente_id)),
  );

  const stats = medicos.map(m => {
    const misConsultas = consultas.filter(c => c.medico_id === m.id);
    const misTurnos = turnos.filter(t => t.medico_id === m.id);
    const completadas = misConsultas.filter(c => c.estado === "completada").length + misTurnos.filter(t => t.estado === "completado").length;
    // Tres categorías (Diego 28/07): CI / turno clínica virtual / turno consultorio.
    const atendidasCI = misConsultas.filter(c => c.estado === "completada").length;
    const atendidasTurnoClinica = misTurnos.filter(t => t.estado === "completado" && t.canal_origen !== "consultorio_privado").length;
    const atendidasTurnoConsultorio = misTurnos.filter(t => t.estado === "completado" && t.canal_origen === "consultorio_privado").length;
    const canceladas = misConsultas.filter(c => c.estado === "cancelada").length + misTurnos.filter(t => t.estado === "cancelado_paciente" || t.estado === "cancelado_medico").length;
    const noShows = misTurnos.filter(t => t.estado === "ausente_medico").length;
    // Todas las atenciones (sin slots) y sin reservas EN CURSO: el paciente que
    // está pagando ahora mismo todavía no es una atención del médico. Su plata
    // (si la hay) se sigue contando abajo: `filasPago` usa misTurnos completo.
    const total = misConsultas.length + soloActividadReal(misTurnos).length;
    // Plata REAL (ver lib/insights/plata.ts): lo aprobado en MP y el fee que MP
    // registró — muere el GMV teórico (precio de lista × atendidas) y el
    // hardcode de $1.500 por consulta.
    const filasPago = [
      ...misConsultas.filter(c => !refundeados.has(`consulta:${c.id}`)),
      ...misTurnos.filter(t => !refundeados.has(`turno:${t.id}`)),
    ];
    const cobrado = cobradoDe(filasPago);
    const comision = comisionTotalDe(filasPago);

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
      atendidasCI,
      atendidasTurnoClinica,
      atendidasTurnoConsultorio,
      total,
      canceladas,
      noShows,
      cobrado,
      comision,
      jurisdicciones: (m.jurisdicciones as string[] | null) ?? [],
      // Valor CI: última CI real; si nunca tuvo, su precio configurado (lo que
      // costaría hoy). Valor turno: su último turno con precio (incluye slots
      // ofrecidos → refleja el precio vigente de su agenda).
      valorCI: valorCIde.get(m.id) ?? m.precio_consulta ?? null,
      valorTurno: valorTurnoDe.get(m.id) ?? null,
      ultimaActividad: ultimaAct,
    };
  });

  stats.sort((a, b) => b.cobrado - a.cobrado);

  return NextResponse.json({ medicos: stats });
}
