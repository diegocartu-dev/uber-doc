import { createAdminClient } from "@/lib/supabase/admin";

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

  return data as string;
}

export async function cerrarEntradaSala(params: {
  consultaId?: string;
  turnoId?: string;
  motivo: "atendido" | "cancelado_paciente" | "cancelado_medico";
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
