import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notificarMedicoPlantados } from "@/lib/notificaciones-medico";
import { resolverNoShowMedico } from "@/lib/cancelaciones";
import { withCron } from "@/lib/cron-guard";

async function handler(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // PASO 1: Cerrar entradas zombie >24hs
  const { data: zombies, error: zombieErr } = await supabase
    .from("sala_espera_entradas")
    .update({
      salida_en: new Date().toISOString(),
      motivo_salida: "timeout_sistema",
    })
    .is("salida_en", null)
    .lt("entrada_en", cutoff24h)
    .select("id, medico_id, paciente_id");

  if (zombieErr) {
    console.error("[cron/sala-espera] Error cerrando zombies:", zombieErr);
  }

  // PASO 2: Detectar médicos con pacientes plantados (timeout_sistema en últimas 24hs)
  //
  // A PROPÓSITO no incluye `medico_no_acepto`, aunque también sea un paciente
  // plantado. Ese caso ya está cubierto en el momento: el profesional recibe
  // hasta 2 recordatorios y, si igual no acepta, se le apaga la Consulta
  // Inmediata con un mensaje interno explicándole por qué (#435). Sumarlo acá
  // sería un TERCER aviso por lo mismo, al día siguiente — justo lo que el tope
  // de recordatorios vino a cortar.
  //
  // El motivo existe para poder distinguirlo en los datos, no para volver a
  // avisar. Si alguna vez se lo agrega a este filtro, revisar antes esa decisión.
  const { data: plantados } = await supabase
    .from("sala_espera_entradas")
    .select("medico_id, paciente_id")
    .eq("motivo_salida", "timeout_sistema")
    .gte("salida_en", cutoff24h)
    .not("medico_id", "is", null);

  const porMedico = new Map<string, string[]>();
  for (const p of plantados || []) {
    if (!p.medico_id) continue;
    const arr = porMedico.get(p.medico_id) || [];
    arr.push(p.paciente_id);
    porMedico.set(p.medico_id, arr);
  }

  // PASO 3: Notificar a cada médico
  let notificados = 0;
  for (const [medicoId, pacienteIds] of porMedico) {
    try {
      await notificarMedicoPlantados({
        medicoId,
        pacienteIds,
        origen: "cron_diario",
      });
      notificados++;
    } catch (e) {
      console.error(`[cron/sala-espera] Error notificando médico ${medicoId}:`, e);
    }
  }

  // PASO 4: Turnos que quedaron en `en_espera` y el médico NUNCA atendió (no-show).
  // El "tiempo de vida" del turno: pasado el horario del turno + 1h de gracia, se marca
  // `ausente_medico` y se reembolsa al paciente (mismo motor que una cancelación de médico;
  // aparece en el dashboard de reembolsos). Antes quedaban en_espera para siempre (BUG4).
  const nowMs = Date.now();
  const GRACIA_MS = 60 * 60 * 1000; // 1h después del fin del turno
  const { data: enEspera } = await supabase
    .from("turnos")
    .select("id, fecha, hora_fin")
    .eq("estado", "en_espera");

  let noShowResueltos = 0;
  let noShowReembolsados = 0;
  for (const t of enEspera ?? []) {
    // AR es UTC−3 fijo (sin DST). Solo resolver si el horario del turno + gracia ya pasó.
    const finMs = new Date(`${t.fecha}T${t.hora_fin}-03:00`).getTime();
    if (Number.isNaN(finMs) || nowMs < finMs + GRACIA_MS) continue;
    const res = await resolverNoShowMedico(t.id);
    if (res.ok) {
      noShowResueltos++;
      if (res.reembolso === "reembolsado" || res.reembolso === "pendiente" || res.reembolso === "fee_pendiente") {
        noShowReembolsados++;
      }
    }
  }

  return NextResponse.json({
    zombies_cerradas: zombies?.length || 0,
    medicos_notificados: notificados,
    pacientes_plantados_total: plantados?.length || 0,
    no_show_resueltos: noShowResueltos,
    no_show_reembolsados: noShowReembolsados,
  });
}

export const GET = withCron("sala-espera-diaria", handler);
