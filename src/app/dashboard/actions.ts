"use server";

import { revalidatePath } from "next/cache";
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

export async function fetchMetricasMedico(
  medicoId: string,
  periodo: "hoy" | "semana" | "mes"
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { turnos: 0, enEspera: 0, completadas: 0, ingresos: 0 };

  const { data: med } = await supabase
    .from("medicos").select("id, precio_consulta").eq("id", medicoId).eq("user_id", user.id).maybeSingle();
  if (!med) return { turnos: 0, enEspera: 0, completadas: 0, ingresos: 0 };

  const ahora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const pad = (n: number) => n.toString().padStart(2, "0");
  const hoy = `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}`;

  let fechaDesde = hoy;
  let fechaHasta = hoy;

  if (periodo === "semana") {
    const d = new Date(ahora);
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    fechaDesde = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    d.setDate(d.getDate() + 6);
    fechaHasta = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  } else if (periodo === "mes") {
    fechaDesde = `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-01`;
    const lastDay = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate();
    fechaHasta = `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(lastDay)}`;
  }

  const { count: turnosCount } = await supabase
    .from("turnos").select("id", { count: "exact", head: true })
    .eq("medico_id", medicoId)
    .gte("fecha", hoy).lte("fecha", fechaHasta)
    .in("estado", ["confirmado", "en_espera"]);

  const { count: turnosEspera } = await supabase
    .from("turnos").select("id", { count: "exact", head: true })
    .eq("medico_id", medicoId).eq("estado", "en_espera");
  const { count: consultasEspera } = await supabase
    .from("consultas").select("id", { count: "exact", head: true })
    .eq("medico_id", medicoId).eq("estado", "esperando");

  const { count: turnosComp } = await supabase
    .from("turnos").select("id", { count: "exact", head: true })
    .eq("medico_id", medicoId).eq("estado", "completado")
    .gte("fecha", fechaDesde).lte("fecha", hoy);
  const { count: consultasComp } = await supabase
    .from("consultas").select("id", { count: "exact", head: true })
    .eq("medico_id", medicoId).eq("estado", "completada")
    .gte("created_at", `${fechaDesde}T00:00:00`);

  const completadas = (turnosComp ?? 0) + (consultasComp ?? 0);
  const ingresos = completadas * (med.precio_consulta ?? 0);

  return {
    turnos: turnosCount ?? 0,
    enEspera: (turnosEspera ?? 0) + (consultasEspera ?? 0),
    completadas,
    ingresos,
  };
}

export async function actualizarOcultoClinica(oculto: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { error } = await supabase
    .from("medicos")
    .update({ oculto_clinica: oculto })
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { success: true };
}

export async function actualizarVisibleConsultorio(visible: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { error } = await supabase
    .from("medicos")
    .update({ visible_consultorio_particular: visible })
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { success: true };
}

export async function rechazarConsulta(consultaId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { data: medico } = await supabase
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!medico) return { error: "No sos médico." };

  const { error } = await supabase
    .from("consultas")
    .update({ estado: "rechazada" })
    .eq("id", consultaId)
    .eq("medico_id", medico.id)
    .eq("estado", "esperando");

  if (error) return { error: error.message };
  return { success: true };
}

export async function cancelarTurnosMedico(
  turnoIds: string[],
  motivo?: string
): Promise<{ success?: boolean; cancelados: number; errores: string[] }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { cancelados: 0, errores: ["No autenticado."] };

  const { data: medico } = await supabase
    .from("medicos").select("id").eq("user_id", user.id).maybeSingle();
  if (!medico) return { cancelados: 0, errores: ["Perfil médico no encontrado."] };
  if (turnoIds.length === 0 || turnoIds.length > 50) return { cancelados: 0, errores: ["Seleccioná entre 1 y 50 turnos."] };

  const { cancelarTurnoPorMedico } = await import("@/lib/cancelaciones");

  let cancelados = 0;
  const errores: string[] = [];

  for (const turnoId of turnoIds) {
    const resultado = await cancelarTurnoPorMedico(turnoId, medico.id, motivo);
    if (resultado.ok) {
      cancelados++;
    } else {
      errores.push(`${turnoId}: ${resultado.error}`);
    }
  }

  revalidatePath("/medico/agenda");
  return { success: cancelados > 0, cancelados, errores };
}

export async function cancelarTurnoPaciente(
  turnoId: string,
  motivo?: string
): Promise<{ success?: boolean; reembolso?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const { data: paciente } = await supabase
    .from("pacientes").select("id").eq("user_id", user.id).maybeSingle();
  if (!paciente) return { error: "Paciente no encontrado." };

  const { cancelarTurnoPorPaciente } = await import("@/lib/cancelaciones");
  const resultado = await cancelarTurnoPorPaciente(turnoId, paciente.id, motivo);

  if (!resultado.ok) return { error: resultado.error };
  return { success: true, reembolso: resultado.reembolso };
}
