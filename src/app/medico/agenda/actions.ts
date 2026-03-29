"use server";

// Módulo de Agenda — Server Actions
// Extensiones pendientes:
// - editarModelo(): actualizar modelo existente + detectar turnos reservados afectados
// - bloquearHorario(): bloquear días/horarios puntuales sin modificar el modelo
// - reprogramarTurnos(): mover turnos reservados cuando se modifica un modelo activo
// - enviarRecordatorios(): cron job para email/WhatsApp antes del turno

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function guardarModelo(data: {
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
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

  // TODO [bloqueos]: antes de generar turnos, consultar tabla de bloqueos y excluir esos slots
  // TODO [reprogramación]: si es edición de modelo existente, detectar turnos reservados afectados

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

  // TODO [recordatorios]: después del INSERT, programar recordatorios para turnos reservados

  // INSERT masivo en lotes de 500
  for (let i = 0; i < turnos.length; i += 500) {
    const lote = turnos.slice(i, i + 500);
    const { error: turnosErr } = await supabase.from("turnos").insert(lote);
    if (turnosErr) return { error: `Error al generar turnos: ${turnosErr.message}` };
  }

  // Resolución automática de conflictos — el modelo más nuevo tiene prioridad
  // Bloquear turnos disponibles de modelos anteriores en fechas/días que se pisan
  const diasDelModelo = [...new Set(data.franjas.map((f) => f.dia_semana))];

  const { data: turnosAnteriores } = await supabase
    .from("turnos")
    .select("id, fecha")
    .eq("medico_id", medico.id)
    .eq("estado", "disponible")
    .neq("modelo_id", modelo.id)
    .gte("fecha", data.fecha_inicio)
    .lte("fecha", data.fecha_fin);

  if (turnosAnteriores && turnosAnteriores.length > 0) {
    const idsABloquear = turnosAnteriores.filter((t) => {
      const d = new Date(t.fecha + "T12:00:00");
      const jsDay = d.getDay();
      const diaSemana = jsDay === 0 ? 7 : jsDay;
      return diasDelModelo.includes(diaSemana);
    }).map((t) => t.id);

    for (let i = 0; i < idsABloquear.length; i += 500) {
      const lote = idsABloquear.slice(i, i + 500);
      await supabase.from("turnos").update({ estado: "bloqueado" }).in("id", lote);
    }
  }

  redirect("/medico/agenda");
}

// TODO [edición]: agregar editarModelo() que actualice modelo + regenere turnos futuros no reservados

// Helper: recalcular bloqueos para un médico después de cambiar un modelo
async function recalcularBloqueos(supabase: Awaited<ReturnType<typeof createClient>>, medicoId: string) {
  // Traer todos los modelos activos ordenados por created_at desc (más nuevo = más prioridad)
  const { data: modelosActivos } = await supabase
    .from("agenda_modelos")
    .select("id, fecha_inicio, fecha_fin, created_at")
    .eq("medico_id", medicoId)
    .eq("activo", true)
    .order("created_at", { ascending: false });

  if (!modelosActivos || modelosActivos.length === 0) {
    // Sin modelos activos → desbloquear todos los turnos bloqueados del médico
    await supabase
      .from("turnos")
      .update({ estado: "disponible" })
      .eq("medico_id", medicoId)
      .eq("estado", "bloqueado");
    return;
  }

  // Traer franjas de todos los modelos activos
  const modeloIds = modelosActivos.map((m) => m.id);
  const { data: franjas } = await supabase
    .from("agenda_franjas")
    .select("modelo_id, dia_semana")
    .in("modelo_id", modeloIds);

  const diasPorModelo = new Map<string, Set<number>>();
  for (const f of franjas ?? []) {
    if (!diasPorModelo.has(f.modelo_id)) diasPorModelo.set(f.modelo_id, new Set());
    diasPorModelo.get(f.modelo_id)!.add(f.dia_semana);
  }

  // Traer todos los turnos bloqueados y disponibles del médico
  const { data: todosTurnos } = await supabase
    .from("turnos")
    .select("id, fecha, modelo_id, estado")
    .eq("medico_id", medicoId)
    .in("estado", ["disponible", "bloqueado"]);

  if (!todosTurnos || todosTurnos.length === 0) return;

  const aBloquear: string[] = [];
  const aDesbloquear: string[] = [];

  for (const turno of todosTurnos) {
    const d = new Date(turno.fecha + "T12:00:00");
    const jsDay = d.getDay();
    const diaSemana = jsDay === 0 ? 7 : jsDay;

    // Encontrar el modelo activo más nuevo que cubre esta fecha/día
    const modeloGanador = modelosActivos.find((m) => {
      const dias = diasPorModelo.get(m.id);
      return dias?.has(diaSemana) && turno.fecha >= m.fecha_inicio && turno.fecha <= m.fecha_fin;
    });

    if (modeloGanador && modeloGanador.id !== turno.modelo_id) {
      // Otro modelo más nuevo cubre este slot → debe estar bloqueado
      if (turno.estado === "disponible") aBloquear.push(turno.id);
    } else {
      // Este turno pertenece al modelo ganador (o no hay conflicto) → debe estar disponible
      if (turno.estado === "bloqueado") aDesbloquear.push(turno.id);
    }
  }

  // Aplicar cambios en lotes
  for (let i = 0; i < aBloquear.length; i += 500) {
    await supabase.from("turnos").update({ estado: "bloqueado" }).in("id", aBloquear.slice(i, i + 500));
  }
  for (let i = 0; i < aDesbloquear.length; i += 500) {
    await supabase.from("turnos").update({ estado: "disponible" }).in("id", aDesbloquear.slice(i, i + 500));
  }
}

export async function toggleModelo(modeloId: string, activo: boolean) {
  const supabase = await createClient();

  // Obtener medico_id antes de actualizar
  const { data: modelo } = await supabase
    .from("agenda_modelos").select("medico_id").eq("id", modeloId).single();
  if (!modelo) return { error: "Modelo no encontrado." };

  const { error } = await supabase
    .from("agenda_modelos")
    .update({ activo })
    .eq("id", modeloId);
  if (error) return { error: error.message };

  // Recalcular bloqueos después de toggle
  await recalcularBloqueos(supabase, modelo.medico_id);

  return { success: true };
}

export async function eliminarModelo(modeloId: string) {
  const supabase = await createClient();

  // Obtener medico_id antes de eliminar
  const { data: modelo } = await supabase
    .from("agenda_modelos").select("medico_id").eq("id", modeloId).single();
  if (!modelo) return { error: "Modelo no encontrado." };

  const { error } = await supabase
    .from("agenda_modelos")
    .delete()
    .eq("id", modeloId);
  if (error) return { error: error.message };

  // Recalcular bloqueos después de eliminar (los turnos del modelo eliminado se borran por CASCADE)
  await recalcularBloqueos(supabase, modelo.medico_id);

  return { success: true };
}
