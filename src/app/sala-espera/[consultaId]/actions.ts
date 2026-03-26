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
