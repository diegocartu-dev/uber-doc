"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function guardarModelo(data: {
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  prioridad: number;
  duracion_turno: number;
  precio: number;
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
      duracion_turno: data.duracion_turno,
      precio: data.precio,
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

  // Generar turnos automáticamente
  const turnos: {
    medico_id: string;
    modelo_id: string;
    fecha: string;
    hora_inicio: string;
    hora_fin: string;
    estado: string;
    monto: number;
  }[] = [];

  // Agrupar franjas por día de la semana
  const franjasPorDia = new Map<number, { hora_inicio: string; hora_fin: string }[]>();
  for (const f of data.franjas) {
    if (!franjasPorDia.has(f.dia_semana)) franjasPorDia.set(f.dia_semana, []);
    franjasPorDia.get(f.dia_semana)!.push({ hora_inicio: f.hora_inicio, hora_fin: f.hora_fin });
  }

  // Iterar cada día del rango
  const inicio = new Date(data.fecha_inicio + "T12:00:00");
  const fin = new Date(data.fecha_fin + "T12:00:00");
  const duracion = data.duracion_turno;

  for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
    // JS: 0=domingo, 1=lunes... Convertir a 1=lunes, 7=domingo
    const jsDay = d.getDay();
    const diaSemana = jsDay === 0 ? 7 : jsDay;

    const franjasDelDia = franjasPorDia.get(diaSemana);
    if (!franjasDelDia) continue;

    const fecha = d.toISOString().split("T")[0];

    for (const franja of franjasDelDia) {
      const [hI, mI] = franja.hora_inicio.split(":").map(Number);
      const [hF, mF] = franja.hora_fin.split(":").map(Number);
      const inicioMin = hI * 60 + mI;
      const finMin = hF * 60 + mF;

      for (let min = inicioMin; min + duracion <= finMin; min += duracion) {
        const turnoInicio = `${Math.floor(min / 60).toString().padStart(2, "0")}:${(min % 60).toString().padStart(2, "0")}`;
        const turnoFin = `${Math.floor((min + duracion) / 60).toString().padStart(2, "0")}:${((min + duracion) % 60).toString().padStart(2, "0")}`;

        turnos.push({
          medico_id: medico.id,
          modelo_id: modelo.id,
          fecha,
          hora_inicio: turnoInicio,
          hora_fin: turnoFin,
          estado: "disponible",
          monto: data.precio,
        });
      }
    }
  }

  // INSERT masivo en lotes de 500
  for (let i = 0; i < turnos.length; i += 500) {
    const lote = turnos.slice(i, i + 500);
    const { error: turnosErr } = await supabase.from("turnos").insert(lote);
    if (turnosErr) return { error: `Error al generar turnos: ${turnosErr.message}` };
  }

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
