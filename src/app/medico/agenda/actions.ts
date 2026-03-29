"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function guardarModelo(data: {
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  prioridad: number;
  franjas: { dia_semana: number; hora_inicio: string; hora_fin: string }[];
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const { data: medico } = await supabase
    .from("medicos").select("id").eq("user_id", user.id).single();
  if (!medico) return { error: "No sos médico." };

  if (!data.nombre || !data.fecha_inicio || !data.fecha_fin || data.franjas.length === 0) {
    return { error: "Completá todos los campos y al menos una franja horaria." };
  }

  const { data: modelo, error: modeloErr } = await supabase
    .from("agenda_modelos")
    .insert({
      medico_id: medico.id,
      nombre: data.nombre,
      fecha_inicio: data.fecha_inicio,
      fecha_fin: data.fecha_fin,
      prioridad: data.prioridad,
      activo: true,
    })
    .select("id")
    .single();

  if (modeloErr) return { error: modeloErr.message };

  const franjasInsert = data.franjas.map((f) => ({
    modelo_id: modelo.id,
    dia_semana: f.dia_semana,
    hora_inicio: f.hora_inicio,
    hora_fin: f.hora_fin,
  }));

  const { error: franjasErr } = await supabase
    .from("agenda_franjas")
    .insert(franjasInsert);

  if (franjasErr) return { error: franjasErr.message };

  redirect("/medico/agenda");
}

export async function toggleModelo(modeloId: string, activo: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("agenda_modelos")
    .update({ activo })
    .eq("id", modeloId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function eliminarModelo(modeloId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("agenda_modelos")
    .delete()
    .eq("id", modeloId);
  if (error) return { error: error.message };
  return { success: true };
}
