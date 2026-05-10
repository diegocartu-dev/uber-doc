import { createAdminClient } from "@/lib/supabase/admin";
import { enviarPush } from "@/lib/push";

interface NotificarPlantadosParams {
  medicoId: string;
  pacienteIds: string[];
  origen: "cron_diario" | "cancelacion_admin";
  motivoAdmin?: string;
}

export async function notificarMedicoPlantados(params: NotificarPlantadosParams) {
  const supabase = createAdminClient();

  const { data: medico } = await supabase
    .from("medicos")
    .select("id, user_id, nombre_completo")
    .eq("id", params.medicoId)
    .single();

  if (!medico) return;

  const primerNombre = medico.nombre_completo.split(" ")[0];

  const { data: entradas } = await supabase
    .from("sala_espera_entradas")
    .select(`
      paciente_id, entrada_en, salida_en,
      paciente:pacientes(nombre_completo)
    `)
    .in("paciente_id", params.pacienteIds)
    .eq("medico_id", params.medicoId)
    .not("salida_en", "is", null)
    .order("entrada_en", { ascending: false })
    .limit(params.pacienteIds.length);

  const detalles = (entradas || []).map((e: Record<string, unknown>) => {
    const paciente = e.paciente as { nombre_completo: string } | null;
    const nombre = paciente?.nombre_completo ?? "Paciente";
    const minutos = e.salida_en
      ? Math.floor(
          (new Date(e.salida_en as string).getTime() -
            new Date(e.entrada_en as string).getTime()) /
            60000
        )
      : 0;
    return `- ${nombre}, esperó ${minutos} min`;
  }).join("\n");

  const cantPacientes = entradas?.length ?? params.pacienteIds.length;

  const titulo =
    params.origen === "cron_diario"
      ? `${cantPacientes} paciente${cantPacientes > 1 ? "s" : ""} te esperaron sin atención`
      : "Cancelación administrativa de pacientes en sala";

  const cuerpo =
    params.origen === "cron_diario"
      ? `Hola ${primerNombre}.\n\nAyer ${cantPacientes} paciente${cantPacientes > 1 ? "s" : ""} te esperaron en sala sin que iniciaras la consulta:\n\n${detalles}\n\nEsto queda registrado en tu historial. Los pacientes recibieron reembolso completo. Si esto se repite, afecta tu estado en la plataforma.`
      : `Hola ${primerNombre}.\n\nUn administrador canceló ${cantPacientes} entrada${cantPacientes > 1 ? "s" : ""} de pacientes que te estaban esperando:\n\n${detalles}\n\nMotivo: ${params.motivoAdmin}\n\nEsto queda registrado en tu historial.`;

  // 1. Mensaje interno persistente
  await supabase.from("mensajes_internos_medicos").insert({
    medico_id: params.medicoId,
    titulo,
    cuerpo,
    severidad: "alta",
  });

  // 2. Web Push (non-blocking)
  try {
    await enviarPush(medico.user_id, {
      title: titulo,
      body: `${cantPacientes} paciente${cantPacientes > 1 ? "s" : ""} esperando sin atención. Ver detalle en la plataforma.`,
      url: "/dashboard",
    });
  } catch (e) {
    console.error("[notificaciones] Error push:", e);
  }
}
