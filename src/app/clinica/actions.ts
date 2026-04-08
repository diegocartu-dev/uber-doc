"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function crearConsulta(
  medicoId: string,
  especialidad: string,
  motivoConsulta: string,
  sintomas: string[],
  tiempoSintomas: string,
  canalOrigen: "clinica_virtual" | "consultorio_privado" = "clinica_virtual"
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "No autenticado." };
  }

  if (!motivoConsulta.trim()) {
    return { error: "El motivo de consulta es obligatorio." };
  }

  const { data, error } = await supabase
    .from("consultas")
    .insert({
      paciente_id: user.id,
      medico_id: medicoId,
      especialidad,
      estado: "esperando",
      motivo_consulta: motivoConsulta.trim(),
      sintomas,
      tiempo_sintomas: tiempoSintomas,
      canal_origen: canalOrigen,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  redirect(`/sala-espera/${data.id}`);
}
