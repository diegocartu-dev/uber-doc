import { createAdminClient } from "@/lib/supabase/admin";
import { avisarMedicoEsperandoWhatsApp } from "@/lib/whatsapp";

type TipoEntrada = "ci" | "turno_programado" | "consultorio_particular";

function tipoFromCanalOrigen(canalOrigen: string): TipoEntrada {
  if (canalOrigen === "consultorio_privado") return "consultorio_particular";
  return "ci";
}

export async function registrarEntradaSala(params: {
  pacienteId: string;
  medicoId: string;
  consultaId?: string;
  turnoId?: string;
  canalOrigen?: string;
}): Promise<string | null> {
  const supabase = createAdminClient();
  const tipo = params.canalOrigen
    ? tipoFromCanalOrigen(params.canalOrigen)
    : params.turnoId
      ? "turno_programado"
      : "ci";

  const { data, error } = await supabase.rpc("registrar_entrada_sala", {
    p_paciente_id: params.pacienteId,
    p_consulta_id: params.consultaId ?? null,
    p_turno_id: params.turnoId ?? null,
    p_medico_id: params.medicoId,
    p_tipo: tipo,
  });

  if (error) {
    console.error("[sala-espera] Error registrando entrada:", error);
    return null;
  }

  // Aviso al médico por WhatsApp (respaldo del push) — el momento crítico: hay un
  // paciente en la sala. Único punto que cubre los 3 canales (CI, turno, consultorio
  // particular). Fire-and-forget + throttle interno; inerte sin flag/credenciales.
  void avisarMedicoEsperandoWhatsApp(params.medicoId, "un paciente", {
    consultaId: params.consultaId ?? null,
    turnoId: params.turnoId ?? null,
    disparador: "entrada_sala",
  }).catch(() => {});

  return data as string;
}

/**
 * Motivos de salida que escribe el código de producto. La lista completa que
 * admite la base incluye además `timeout_sistema` (la fila quedó colgada >24 h y
 * la cerró el barrido diario: falla técnica, no de servicio) y `cancelado_admin`
 * — los escriben sus propias rutas, no esta función.
 *
 * `medico_no_acepto` NO es "canceló el paciente" (Diego, 24/08/2026): el
 * paciente pidió la consulta, esperó, y nadie la aceptó. Confundirlos hace que
 * el día que se mire por qué se pierden pacientes, el dato culpe al usuario de
 * algo que no hizo.
 */
export type MotivoSalidaSala =
  | "atendido"
  | "cancelado_paciente"
  | "cancelado_medico"
  | "medico_no_acepto";

export async function cerrarEntradaSala(params: {
  consultaId?: string;
  turnoId?: string;
  motivo: MotivoSalidaSala;
}): Promise<number> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("cerrar_entrada_sala", {
    p_consulta_id: params.consultaId ?? null,
    p_turno_id: params.turnoId ?? null,
    p_motivo: params.motivo,
  });

  if (error) {
    console.error("[sala-espera] Error cerrando entrada:", error);
    return 0;
  }

  return (data as number) ?? 0;
}
