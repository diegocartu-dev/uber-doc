"use server";

import { createClient } from "@/lib/supabase/server";

export async function reservarTurno(turnoId: string, recordatorios: { cuando: string; canal: string }) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (!user) return { error: `No autenticado: ${authErr?.message ?? "sin sesión"}` };

  // Buscar paciente — mismo patrón que crearConsulta en clinica/actions.ts
  const { data: paciente, error: pacErr } = await supabase
    .from("pacientes")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!paciente) {
    return { error: `Perfil de paciente no encontrado. ${pacErr?.message ?? "Verificá que estés registrado como paciente."}` };
  }

  // Verificar que el turno existe y está disponible
  const { data: turno, error: turnoErr } = await supabase
    .from("turnos")
    .select("id, estado")
    .eq("id", turnoId)
    .single();

  if (!turno) return { error: `Turno no encontrado. ${turnoErr?.message ?? ""}` };
  if (turno.estado !== "disponible") return { error: "Este turno ya no está disponible." };

  const { error } = await supabase
    .from("turnos")
    .update({
      estado: "reservado",
      paciente_id: paciente.id,
      recordatorios,
    })
    .eq("id", turnoId)
    .eq("estado", "disponible");

  if (error) return { error: `Error al reservar: ${error.message}` };
  return { success: true };
}
