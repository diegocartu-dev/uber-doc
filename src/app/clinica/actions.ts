"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function crearConsulta(medicoId: string, especialidad: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "No autenticado." };
  }

  const { data, error } = await supabase
    .from("consultas")
    .insert({
      paciente_id: user.id,
      medico_id: medicoId,
      especialidad,
      estado: "esperando",
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  redirect(`/sala-espera/${data.id}`);
}
