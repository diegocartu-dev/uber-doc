"use server";

import { createClient } from "@/lib/supabase/server";

export async function actualizarDisponibilidad(data: {
  disponible: boolean;
  disponible_desde: string;
  disponible_hasta: string;
  duracion_consulta?: number;
  precio_consulta?: number;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "No autenticado." };
  }

  const updateData: Record<string, unknown> = {
    disponible: data.disponible,
    disponible_desde: data.disponible_desde,
    disponible_hasta: data.disponible_hasta,
  };
  if (data.duracion_consulta) updateData.duracion_consulta = data.duracion_consulta;
  if (data.precio_consulta) updateData.precio_consulta = data.precio_consulta;

  const { error } = await supabase
    .from("medicos")
    .update(updateData)
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
