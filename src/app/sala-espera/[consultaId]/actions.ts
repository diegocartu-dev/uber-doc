"use server";

import { createClient } from "@/lib/supabase/server";

export async function aceptarConsulta(consultaId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "No autenticado." };
  }

  // Verificar que el médico es dueño de esta consulta
  const { data: medico } = await supabase
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!medico) {
    return { error: "No sos médico." };
  }

  // --- Bloqueo durante ventana de rejoin (Fase 1, §13.3 / §6.4 del diseño) ---
  // Si el médico tiene una consulta en_curso con un corte pendiente
  // (desconectado_at != null), está dentro de la ventana de 2 min de reconexión:
  // no puede tomar otra hasta que se retome o expire.
  const { data: corteEnCurso } = await supabase
    .from("consultas")
    .select("id")
    .eq("medico_id", medico.id)
    .eq("estado", "en_curso")
    .not("desconectado_at", "is", null)
    .limit(1)
    .maybeSingle();

  if (corteEnCurso) {
    return { error: "Tenés una consulta esperando reconexión. Retomala o esperá a que se cierre antes de tomar otra." };
  }

  const { error } = await supabase
    .from("consultas")
    .update({ estado: "aceptada" })
    .eq("id", consultaId)
    .eq("medico_id", medico.id)
    .eq("estado", "esperando");

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
