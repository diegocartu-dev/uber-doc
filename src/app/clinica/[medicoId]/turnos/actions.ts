"use server";

import { createClient } from "@/lib/supabase/server";

export async function reservarTurno(turnoId: string, recordatorios: { cuando: string; canal: string }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const { data: paciente } = await supabase
    .from("pacientes").select("id").eq("user_id", user.id).single();
  if (!paciente) return { error: "Paciente no encontrado." };

  const { error } = await supabase
    .from("turnos")
    .update({
      estado: "reservado",
      paciente_id: paciente.id,
      recordatorios,
    })
    .eq("id", turnoId)
    .eq("estado", "disponible");

  if (error) return { error: error.message };
  return { success: true };
}
