import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notificarMedicoPlantados } from "@/lib/notificaciones-medico";

export async function GET(req: Request) {
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

  return NextResponse.json({
    zombies_cerradas: zombies?.length || 0,
    medicos_notificados: notificados,
    pacientes_plantados_total: plantados?.length || 0,
  });
}
