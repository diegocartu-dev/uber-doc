import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushAlMedico } from "@/lib/push";
import { avisarMedicoEsperandoWhatsApp } from "@/lib/whatsapp";

/**
 * Cron cada 10 min (decisión Diego 11/06/2026): re-notificar al médico mientras
 * tenga pacientes pendientes — el primer push puede perderse (teléfono lejos,
 * Concentración, etc.) y un paciente esperando no puede depender de un único aviso.
 *
 * Cubre los 3 casos: CI esperando aceptación, CI pagada sin iniciar video, y
 * turno con el paciente en sala de espera.
 *
 * Diseño:
 * - Solo entradas de sala de espera ABIERTAS cuya consulta/turno sigue PENDIENTE
 *   (estados esperando/aceptada/pagada · en_espera). Las terminadas no molestan.
 * - Solo entradas con >= 8 min de antigüedad: el push inmediato ya avisó al
 *   entrar; esto es un RECORDATORIO, no un duplicado.
 * - Agrupado por médico: un solo push aunque haya N pacientes ("3 pacientes te
 *   esperan"), con tag estable → la notificación se reemplaza (suena de nuevo)
 *   en vez de apilarse.
 */

const PENDIENTES_CONSULTA = new Set(["esperando", "aceptada", "pagada"]);
const PENDIENTES_TURNO = new Set(["en_espera"]);
const EDAD_MINIMA_MIN = 8;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: entradas, error } = await admin
    .from("sala_espera_entradas")
    .select("id, medico_id, paciente_id, consulta_id, turno_id, entrada_en")
    .is("salida_en", null)
    .not("medico_id", "is", null);

  if (error) {
    console.error("[cron/repush-esperando] Error leyendo entradas:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
  if (!entradas || entradas.length === 0) {
    return NextResponse.json({ ok: true, recordatorios: 0 });
  }

  // Estados actuales de las consultas/turnos asociados
  const consultaIds = [...new Set(entradas.map((e) => e.consulta_id).filter(Boolean))] as string[];
  const turnoIds = [...new Set(entradas.map((e) => e.turno_id).filter(Boolean))] as string[];

  const [consultasRes, turnosRes] = await Promise.all([
    consultaIds.length > 0
      ? admin.from("consultas").select("id, estado").in("id", consultaIds)
      : Promise.resolve({ data: [] as { id: string; estado: string }[] }),
    turnoIds.length > 0
      ? admin.from("turnos").select("id, estado").in("id", turnoIds)
      : Promise.resolve({ data: [] as { id: string; estado: string }[] }),
  ]);

  const estadoConsulta = new Map((consultasRes.data ?? []).map((c) => [c.id, c.estado]));
  const estadoTurno = new Map((turnosRes.data ?? []).map((t) => [t.id, t.estado]));

  const ahora = Date.now();

  // Filtrar pendientes con edad mínima, agrupar por médico
  type Pendiente = { pacienteId: string; minutos: number };
  const porMedico = new Map<string, Pendiente[]>();

  for (const e of entradas) {
    const minutos = Math.floor((ahora - new Date(e.entrada_en).getTime()) / 60000);
    if (minutos < EDAD_MINIMA_MIN) continue;

    const ec = e.consulta_id ? estadoConsulta.get(e.consulta_id) : null;
    const et = e.turno_id ? estadoTurno.get(e.turno_id) : null;
    const pendiente = (!!ec && PENDIENTES_CONSULTA.has(ec)) || (!!et && PENDIENTES_TURNO.has(et));
    if (!pendiente) continue;

    const arr = porMedico.get(e.medico_id) ?? [];
    arr.push({ pacienteId: e.paciente_id, minutos });
    porMedico.set(e.medico_id, arr);
  }

  let recordatorios = 0;
  for (const [medicoId, pendientes] of porMedico) {
    const masAntiguo = Math.max(...pendientes.map((p) => p.minutos));

    let body: string;
    if (pendientes.length === 1) {
      const { data: pac } = await admin
        .from("pacientes")
        .select("nombre_completo")
        .eq("id", pendientes[0].pacienteId)
        .maybeSingle();
      body = `${pac?.nombre_completo ?? "Un paciente"} sigue esperando hace ${masAntiguo} min`;
    } else {
      body = `${pendientes.length} pacientes te están esperando (el primero hace ${masAntiguo} min)`;
    }

    const ok = await pushAlMedico(medicoId, {
      title: "🔴 Docto — paciente en espera",
      body,
      url: "/dashboard",
      // Tag estable por médico: reemplaza el recordatorio anterior (renotify
      // hace sonar de nuevo) en vez de apilar notificaciones.
      tag: `espera-recordatorio-${medicoId}`,
    }).catch(() => false);

    if (ok) recordatorios++;

    // Respaldo por WhatsApp del recordatorio (throttle interno por médico evita
    // mandar cada 10 min). Inerte sin flag/credenciales. Fire-and-forget.
    void avisarMedicoEsperandoWhatsApp(
      medicoId,
      pendientes.length === 1 ? "un paciente" : `${pendientes.length} pacientes`
    ).catch(() => {});
  }

  return NextResponse.json({ ok: true, recordatorios, medicosConPendientes: porMedico.size });
}
