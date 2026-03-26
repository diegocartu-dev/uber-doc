"use server";

import { createClient } from "@/lib/supabase/server";

export async function actualizarDisponibilidad(data: {
  disponible: boolean;
  disponible_desde: string;
  disponible_hasta: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "No autenticado." };
  }

  const { error } = await supabase
    .from("medicos")
    .update({
      disponible: data.disponible,
      disponible_desde: data.disponible_desde,
      disponible_hasta: data.disponible_hasta,
    })
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
