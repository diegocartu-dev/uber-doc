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
  //
  // EXCEPCIÓN: la CI que todavía nadie aceptó. Ahí `crearConsulta` acaba de
  // mandar el aviso "aceptá esta consulta", y el paciente llega a esta sala en el
  // mismo movimiento — así que este segundo mensaje salía con UN SEGUNDO de
  // diferencia del primero, diciendo casi lo mismo. Gastaba de entrada los dos
  // avisos que el profesional tiene permitido recibir. Desde acá el reloj lo
  // lleva el cron `liberar-ci-sin-aceptar`: un recordatorio al minuto 5 y listo.
  if (!(await esCiSinAceptar(params.consultaId))) {
    void avisarMedicoEsperandoWhatsApp(params.medicoId, "un paciente").catch(() => {});
  }

  return data as string;
}

export async function cerrarEntradaSala(params: {
  consultaId?: string;
  turnoId?: string;
  // `timeout_sistema` = lo cerró un proceso automático por vencimiento, sin que
  // nadie apretara nada. Ya era el motivo que escribía el barrido diario de la
  // sala; faltaba en el tipo porque aquel lo inserta con un UPDATE directo.
  motivo: "atendido" | "cancelado_paciente" | "cancelado_medico" | "timeout_sistema";
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

/**
 * ¿Esta entrada corresponde a una CI que el profesional todavía no aceptó?
 * Ante cualquier duda (sin consultaId, o si la lectura falla) devuelve false:
 * el default sigue siendo avisar, que es el comportamiento seguro para el
 * paciente que está esperando.
 */
async function esCiSinAceptar(consultaId?: string): Promise<boolean> {
  if (!consultaId) return false;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("consultas")
    .select("estado")
    .eq("id", consultaId)
    .maybeSingle();
  if (error || !data) return false;
  return data.estado === "esperando";
}
