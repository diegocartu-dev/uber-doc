"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarEmailTurnoConfirmado } from "@/lib/email";
import { pushAlMedico } from "@/lib/push";
import { getFlag } from "@/lib/feature-flags";

export async function limpiarReservasExpiradas() {
  const supabase = await createClient();
  await supabase
    .from("turnos")
    .update({ estado: "disponible", paciente_id: null, reservado_hasta: null })
    .eq("estado", "reservado_pendiente")
    .lt("reservado_hasta", new Date().toISOString());
}

export async function reservarTurno(turnoId: string, recordatorios: { cuando: string; canal: string }, canalOrigen: "clinica_virtual" | "consultorio_privado" = "clinica_virtual") {
  // Feature flag: turnos programados
  if (!(await getFlag("turnos_global"))) {
    return { error: "Estamos actualizando la agenda. La reserva de turnos vuelve en breve." };
  }

  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (!user) return { error: `No autenticado: ${authErr?.message ?? "sin sesión"}` };

  const { data: paciente, error: pacErr } = await supabase
    .from("pacientes").select("id").eq("user_id", user.id).limit(1).maybeSingle();
  if (!paciente) return { error: `Perfil de paciente no encontrado. ${pacErr?.message ?? ""}` };

  const { data: turno } = await supabase
    .from("turnos").select("id, estado, medico_id").eq("id", turnoId).single();
  if (!turno) return { error: "Turno no encontrado." };
  if (turno.estado !== "disponible") return { error: "Este turno ya no está disponible." };

  // C2 (backstop por link directo): con el flag activo, no se puede reservar un
  // turno de un médico sin identidad validada. La vía principal es el filtro de
  // visibilidad (el médico no aparece); esto cubre el caso del link directo.
  if (await getFlag("identidad_gate_activa")) {
    const { data: medicoTurno } = await supabase
      .from("medicos").select("identidad_validada").eq("id", turno.medico_id).maybeSingle();
    if (!medicoTurno?.identidad_validada) {
      return { error: "Este profesional no está disponible en este momento." };
    }
  }

  // Reservar con hold de 15 minutos. El turno queda bloqueado para este paciente
  // (estado reservado_pendiente + reservado_hasta) y nadie más puede tomarlo
  // mientras el hold esté vigente. 15 min cubre el tiempo de un pago real en
  // Checkout Pro (transferencia, OTP del banco, Rapipago), no solo el click
  // instantáneo de la simulación. Si el hold vence, el turno vuelve a disponible.
  const reservadoHasta = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from("turnos")
    .update({
      estado: "reservado_pendiente",
      paciente_id: paciente.id,
      reservado_hasta: reservadoHasta,
      recordatorios,
      canal_origen: canalOrigen,
    })
    .eq("id", turnoId)
    .eq("estado", "disponible");

  if (error) return { error: `Error al reservar: ${error.message}` };
  return { success: true, turnoId };
}

export async function confirmarPagoTurno(turnoId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const { data: paciente } = await supabase
    .from("pacientes").select("id").eq("user_id", user.id).limit(1).maybeSingle();
  if (!paciente) return { error: "Paciente no encontrado." };

  const { data: turno } = await supabase
    .from("turnos")
    .select("id, estado, paciente_id, reservado_hasta, medico_id, fecha")
    .eq("id", turnoId)
    .single();

  if (!turno) return { error: "Turno no encontrado." };
  if (turno.paciente_id !== paciente.id) return { error: "Este turno no te pertenece." };
  if (turno.estado !== "reservado_pendiente") return { error: "Este turno ya no está en estado pendiente." };

  // Verificar que no expiró
  if (turno.reservado_hasta && new Date(turno.reservado_hasta) < new Date()) {
    return { error: "Tu reserva expiró. Volvé al calendario para elegir otro turno." };
  }

  const { error } = await supabase
    .from("turnos")
    .update({ estado: "confirmado", reservado_hasta: null })
    .eq("id", turnoId)
    .eq("estado", "reservado_pendiente");

  if (error) return { error: `Error al confirmar: ${error.message}` };

  enviarEmailTurnoConfirmado(turnoId).catch(console.error);

  const { data: pacNombre } = await supabase
    .from("pacientes").select("nombre_completo").eq("id", paciente.id).single();
  pushAlMedico(turno.medico_id, {
    title: "🟢 Docto",
    body: `${pacNombre?.nombre_completo ?? "Un paciente"} reservó un turno para el ${turno.fecha}`,
    url: "/medico/agenda",
    tag: `reserva-${turnoId}`,
    silent: true,
  }).catch(() => {});

  return { success: true };
}

export async function entrarSalaEspera(turnoId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const { data: paciente } = await supabase
    .from("pacientes").select("id").eq("user_id", user.id).limit(1).maybeSingle();
  if (!paciente) return { error: "Paciente no encontrado." };

  const { data: turno } = await supabase
    .from("turnos").select("id, paciente_id, estado, medico_id").eq("id", turnoId).single();
  if (!turno) return { error: "Turno no encontrado." };
  if (turno.paciente_id !== paciente.id) return { error: "Este turno no te pertenece." };
  if (turno.estado !== "confirmado") return { error: "Este turno no está confirmado." };

  const supabaseAdmin = createAdminClient();
  const { error } = await supabaseAdmin
    .from("turnos")
    .update({ estado: "en_espera" })
    .eq("id", turnoId)
    .eq("paciente_id", paciente.id)
    .eq("estado", "confirmado");

  if (error) return { error: error.message };

  const { data: pacNombre } = await supabase
    .from("pacientes").select("nombre_completo").eq("id", paciente.id).single();
  pushAlMedico(turno.medico_id, {
    title: "🟢 Docto",
    body: `${pacNombre?.nombre_completo ?? "Un paciente"} está esperando tu consulta`,
    url: "/dashboard",
    tag: `espera-${turnoId}`,
  }, true).catch(() => {});

  return { success: true };
}

export async function expirarTurno(turnoId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const { data: paciente } = await supabase
    .from("pacientes").select("id").eq("user_id", user.id).limit(1).maybeSingle();
  if (!paciente) return { error: "Paciente no encontrado." };

  const { data: turno } = await supabase
    .from("turnos").select("id, paciente_id").eq("id", turnoId).single();
  if (!turno) return { error: "Turno no encontrado." };
  if (turno.paciente_id !== paciente.id) return { error: "Este turno no te pertenece." };

  const { error } = await supabase.rpc("expirar_turno", { turno_id: turnoId });
  if (error) return { error: error.message };
  return { success: true };
}
