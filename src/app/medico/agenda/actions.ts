"use server";

// Módulo de Agenda — Server Actions
// Extensiones pendientes:
// - editarModelo(): actualizar modelo existente + detectar turnos reservados afectados
// - bloquearHorario(): bloquear días/horarios puntuales sin modificar el modelo
// - reprogramarTurnos(): mover turnos reservados cuando se modifica un modelo activo
// - enviarRecordatorios(): cron job para email/WhatsApp antes del turno

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function guardarModelo(data: {
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  duracion_turno: number;
  precio: number;
  franjas: { dia_semana: number; hora_inicio: string; hora_fin: string }[];
  canal_origen?: "clinica_virtual" | "consultorio_privado";
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
      canal_origen: data.canal_origen ?? "clinica_virtual",
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
    canal_origen: string;
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
          canal_origen: data.canal_origen ?? "clinica_virtual",
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

  // Resolución de conflictos: usar el MISMO algoritmo canal+hora-aware que toggle/eliminar
  // (recalcularBloqueos), en vez de la lógica propia por-día que bloqueaba turnos de otro
  // canal/hora. Manual/toggle/eliminar convergen acá; Nova (crear-agenda.ts paso 7) mantiene
  // su propio bloqueo incremental, también canal-aware → coinciden en la convivencia de canales.
  await recalcularBloqueos(supabase, medico.id);

  redirect("/medico/agenda");
}

// TODO [edición]: agregar editarModelo() que actualice modelo + regenere turnos futuros no reservados

// Helper: recalcular bloqueos para un médico después de cambiar un modelo.
// Resolución CANAL + HORA aware: clínica virtual y consultorio particular conviven, y
// dos agendas del MISMO canal solo se pisan en su solape horario real (no todo el día).
async function recalcularBloqueos(supabase: Awaited<ReturnType<typeof createClient>>, medicoId: string) {
  // Modelos activos, más nuevo primero (más prioridad). canal_origen: cada modelo solo
  // compite con otros de SU canal.
  const { data: modelosActivos } = await supabase
    .from("agenda_modelos")
    .select("id, fecha_inicio, fecha_fin, created_at, canal_origen")
    .eq("medico_id", medicoId)
    .eq("activo", true)
    .order("created_at", { ascending: false });

  if (!modelosActivos || modelosActivos.length === 0) {
    // Sin modelos activos → ningún turno debe quedar reservable. Bloquear los
    // disponibles (los tomados/reservados NO se tocan: distinto estado).
    await supabase
      .from("turnos")
      .update({ estado: "bloqueado" })
      .eq("medico_id", medicoId)
      .eq("estado", "disponible");
    return;
  }

  // Franjas CON hora (no solo día): la resolución es también por hora.
  const modeloIds = modelosActivos.map((m) => m.id);
  const { data: franjas } = await supabase
    .from("agenda_franjas")
    .select("modelo_id, dia_semana, hora_inicio, hora_fin")
    .in("modelo_id", modeloIds);

  const franjasPorModelo = new Map<string, { dia: number; hIni: string; hFin: string }[]>();
  for (const f of franjas ?? []) {
    if (!franjasPorModelo.has(f.modelo_id)) franjasPorModelo.set(f.modelo_id, []);
    franjasPorModelo.get(f.modelo_id)!.push({ dia: f.dia_semana as number, hIni: f.hora_inicio as string, hFin: f.hora_fin as string });
  }
  // ¿El modelo cubre (día de semana + hora) de este turno? (hora en formato "HH:MM:SS",
  // comparación lexicográfica correcta; el turno pertenece a la franja [hIni, hFin)).
  const modeloCubre = (modeloId: string, diaSemana: number, hora: string) =>
    (franjasPorModelo.get(modeloId) ?? []).some((f) => f.dia === diaSemana && hora >= f.hIni && hora < f.hFin);

  // Traer todos los turnos bloqueados y disponibles del médico (con canal + hora)
  const { data: todosTurnos } = await supabase
    .from("turnos")
    .select("id, fecha, modelo_id, estado, canal_origen, hora_inicio")
    .eq("medico_id", medicoId)
    .in("estado", ["disponible", "bloqueado"]);

  if (!todosTurnos || todosTurnos.length === 0) return;

  const aBloquear: string[] = [];
  const aDesbloquear: string[] = [];

  for (const turno of todosTurnos) {
    const d = new Date(turno.fecha + "T12:00:00");
    const jsDay = d.getDay();
    const diaSemana = jsDay === 0 ? 7 : jsDay;

    // Ganador de ESTE slot: el modelo activo MÁS NUEVO, del MISMO canal, que cubre la
    // fecha + el día de semana + la HORA del turno. Un turno queda DISPONIBLE solo si su
    // propio modelo es el ganador de su slot. Así clínica y consultorio conviven (distinto
    // canal → distinto ganador) y dos agendas del mismo canal solo se pisan donde se solapan.
    const modeloGanador = modelosActivos.find(
      (m) =>
        m.canal_origen === turno.canal_origen &&
        turno.fecha >= m.fecha_inicio &&
        turno.fecha <= m.fecha_fin &&
        modeloCubre(m.id, diaSemana, turno.hora_inicio)
    );

    const debeEstarDisponible = !!modeloGanador && modeloGanador.id === turno.modelo_id;

    if (debeEstarDisponible) {
      if (turno.estado === "bloqueado") aDesbloquear.push(turno.id);
    } else {
      if (turno.estado === "disponible") aBloquear.push(turno.id);
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const { data: medico } = await supabase
    .from("medicos").select("id").eq("user_id", user.id).single();
  if (!medico) return { error: "No sos médico." };

  const { data: modelo } = await supabase
    .from("agenda_modelos").select("medico_id").eq("id", modeloId).single();
  if (!modelo) return { error: "Modelo no encontrado." };
  if (modelo.medico_id !== medico.id) return { error: "No autorizado." };

  const { error } = await supabase
    .from("agenda_modelos")
    .update({ activo })
    .eq("id", modeloId);
  if (error) return { error: error.message };

  await recalcularBloqueos(supabase, medico.id);

  revalidatePath("/medico/agenda");

  return { success: true };
}

export async function eliminarModelo(modeloId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const { data: medico } = await supabase
    .from("medicos").select("id").eq("user_id", user.id).single();
  if (!medico) return { error: "No sos médico." };

  const { data: modelo } = await supabase
    .from("agenda_modelos").select("medico_id").eq("id", modeloId).single();
  if (!modelo) return { error: "Modelo no encontrado." };
  if (modelo.medico_id !== medico.id) return { error: "No autorizado." };

  // La FK turnos.modelo_id es ON DELETE NO ACTION: hay que vaciar los turnos
  // del modelo antes de borrarlo. Solo se pueden borrar agendas cuyos turnos
  // sean libres (disponible/bloqueado). Si tiene turnos reservados o con
  // historial (confirmado, en espera/curso, pendiente de pago, cancelados) NO
  // se elimina —se perdería la reserva o el historial—; el médico puede
  // inhabilitarla con el toggle. `turnos` no tiene policy de DELETE para el
  // médico, así que la limpieza va por el cliente admin (propiedad ya validada).
  const admin = createAdminClient();

  // Solo se puede borrar una agenda cuyos turnos sean TODOS libres
  // (disponible/bloqueado). Comparamos total vs libres: así cualquier estado
  // distinto de disponible/bloqueado —incluido NULL o un estado futuro— cuenta
  // como ocupado y bloquea el borrado (no se pierde la reserva ni el historial).
  const { count: total, error: totalErr } = await admin
    .from("turnos")
    .select("id", { count: "exact", head: true })
    .eq("modelo_id", modeloId);
  if (totalErr) return { error: totalErr.message };

  const { count: libres, error: libresErr } = await admin
    .from("turnos")
    .select("id", { count: "exact", head: true })
    .eq("modelo_id", modeloId)
    .in("estado", ["disponible", "bloqueado"]);
  if (libresErr) return { error: libresErr.message };

  if ((total ?? 0) > (libres ?? 0)) {
    return {
      error:
        "Esta agenda tiene turnos reservados o cancelados en su historial, así que no se puede eliminar. Inhabilitala con el interruptor para que deje de ofrecer turnos.",
    };
  }

  const { error: turnosErr } = await admin
    .from("turnos")
    .delete()
    .eq("modelo_id", modeloId)
    .in("estado", ["disponible", "bloqueado"]);
  if (turnosErr) return { error: turnosErr.message };

  // agenda_franjas cae por ON DELETE CASCADE
  const { error } = await admin
    .from("agenda_modelos")
    .delete()
    .eq("id", modeloId);
  if (error) return { error: error.message };

  await recalcularBloqueos(supabase, medico.id);

  revalidatePath("/medico/agenda");

  return { success: true };
}
