import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolverNoShowMedico, resolverAusentePaciente } from "@/lib/cancelaciones";

/**
 * Cron cada 10 min (decisión Diego 08/07/2026): resuelve turnos vencidos sin esperar al
 * cron diario de las 02:59 (que queda como backstop).
 *
 * 1) `en_espera` (paciente en la sala, médico nunca entró): pasados 20 MIN DEL INICIO,
 *    ausente_medico + reembolso — PERO SOLO SI EL MÉDICO NO ESTÁ ATENDIENDO a otro
 *    paciente (CI o turno en_curso). Si está atendiendo, la espera es legítima: no se
 *    resuelve y la sala de espera le informa al paciente (banner "está atendiendo otra
 *    consulta"). Backstop del caso médico-ocupado-eterno: sala-espera-diaria (fin + 1 h).
 *
 * 2) `confirmado` que NADIE tomó (el paciente nunca entró — si hubiera entrado sería
 *    en_espera): pasado el FIN + 20 min → ausente_paciente, SIN reembolso (ganancia del
 *    médico, decisión Diego). Medible en reportes como consulta no realizada.
 */

export const maxDuration = 60;

const GRACIA_MIN = 20;
const MAX_POR_CORRIDA = 20;

// fecha "YYYY-MM-DD" + hora "HH:MM[:SS]" en AR (UTC-3 fijo, sin DST) → epoch ms.
function epochAR(fecha: string, hora: string): number {
  const h = hora.length === 5 ? `${hora}:00` : hora;
  return new Date(`${fecha}T${h}-03:00`).getTime();
}

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowMs = Date.now();
  const graciaMs = GRACIA_MIN * 60 * 1000;

  // ── 1) en_espera vencidos (inicio + 20 min) con médico LIBRE ──
  const { data: enEspera } = await admin
    .from("turnos")
    .select("id, medico_id, fecha, hora_inicio")
    .eq("estado", "en_espera")
    .order("fecha", { ascending: true })
    .limit(200);

  const vencidosEspera = (enEspera ?? []).filter((t) => {
    const inicio = epochAR(t.fecha, t.hora_inicio);
    return !Number.isNaN(inicio) && nowMs >= inicio + graciaMs;
  });

  // Médicos ocupados AHORA (CI en_curso o turno en_curso): su espera es legítima.
  let ocupados = new Set<string>();
  if (vencidosEspera.length > 0) {
    const medicoIds = [...new Set(vencidosEspera.map((t) => t.medico_id).filter(Boolean))];
    const [{ data: cis }, { data: tns }] = await Promise.all([
      admin.from("consultas").select("medico_id").in("medico_id", medicoIds).eq("estado", "en_curso"),
      admin.from("turnos").select("medico_id").in("medico_id", medicoIds).eq("estado", "en_curso"),
    ]);
    ocupados = new Set([...(cis ?? []), ...(tns ?? [])].map((r) => r.medico_id).filter(Boolean));
  }

  let noShowResueltos = 0;
  let esperasConMedicoOcupado = 0;
  for (const t of vencidosEspera.slice(0, MAX_POR_CORRIDA)) {
    if (ocupados.has(t.medico_id)) {
      esperasConMedicoOcupado++;
      continue;
    }
    const res = await resolverNoShowMedico(t.id);
    if (res.ok) noShowResueltos++;
  }

  // ── 2) confirmados que nadie tomó (fin + 20 min) → ausente_paciente ──
  const { data: confirmados } = await admin
    .from("turnos")
    .select("id, fecha, hora_fin")
    .eq("estado", "confirmado")
    .order("fecha", { ascending: true })
    .limit(200);

  const vencidosConfirmados = (confirmados ?? []).filter((t) => {
    const fin = epochAR(t.fecha, t.hora_fin);
    return !Number.isNaN(fin) && nowMs >= fin + graciaMs;
  });

  let ausentesPaciente = 0;
  for (const t of vencidosConfirmados.slice(0, MAX_POR_CORRIDA)) {
    const res = await resolverAusentePaciente(t.id);
    if (res.ok) ausentesPaciente++;
  }

  const resumen = {
    ok: true,
    no_show_medico_resueltos: noShowResueltos,
    esperas_con_medico_ocupado: esperasConMedicoOcupado,
    ausentes_paciente: ausentesPaciente,
  };
  if (noShowResueltos || ausentesPaciente || esperasConMedicoOcupado) {
    console.log("[cron/turnos-vencidos]", JSON.stringify(resumen));
  }
  return NextResponse.json(resumen);
}
