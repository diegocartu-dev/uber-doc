"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarEmailTurnoConfirmado } from "@/lib/email";
import { pushAlMedico } from "@/lib/push";
import { getFlag } from "@/lib/feature-flags";
import { transaccionEsDeTest } from "@/lib/pago-test";
import { identidadHabilitada } from "@/lib/perfil-medico";

/**
 * @deprecated No hace nada y NUNCA hizo nada: corre con el cliente RLS del
 * paciente y la policy "Pacientes actualizan sus turnos" exige
 * `paciente_id = paciente_id_for_current_user()` en el with_check, así que
 * poner `paciente_id = null` (que es LO QUE ES liberar) siempre fue rechazado.
 * El error nunca se miraba → falla silenciosa: 4 turnos quedaron bloqueados,
 * el más viejo 3 semanas (hallazgo 06/08).
 *
 * La liberación real la hace ahora /api/cron/liberar-reservas cada 10 minutos
 * con service role. Esta función queda como no-op para no romper el import del
 * calendario; se borra cuando se limpie el componente.
 */
export async function limpiarReservasExpiradas() {
  return;
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
    .from("pacientes").select("id, es_cuenta_test").eq("user_id", user.id).limit(1).maybeSingle();
  if (!paciente) return { error: `Perfil de paciente no encontrado. ${pacErr?.message ?? ""}` };

  const { data: turno } = await supabase
    .from("turnos").select("id, estado, medico_id, fecha, hora_inicio, canal_origen").eq("id", turnoId).single();
  if (!turno) return { error: "Turno no encontrado." };
  if (turno.estado !== "disponible") return { error: "Este turno ya no está disponible." };

  // Guard de canal (sprint cómo-atendés 15/07): el slot pertenece a UN canal —
  // un turno del consultorio privado no se reserva desde la clínica pública ni
  // al revés. Antes el filtro vivía solo en el SELECT de la página y la reserva
  // PISABA canal_origen con el canal pedido. Mensaje genérico: no filtra info.
  if (turno.canal_origen && turno.canal_origen !== canalOrigen) {
    return { error: "Este turno ya no está disponible." };
  }

  // Enforcement del toggle del consultorio (Roberto, gate 15/07): con el canal
  // privado apagado por el médico, sus slots privados tampoco se reservan por
  // URL directa. La página ya lo corta; esto es la autoridad server-side.
  if (turno.canal_origen === "consultorio_privado") {
    const { data: medicoCanal } = await supabase
      .from("medicos").select("visible_consultorio_particular").eq("id", turno.medico_id).maybeSingle();
    if (medicoCanal?.visible_consultorio_particular === false) {
      return { error: "Este turno ya no está disponible." };
    }
  }

  // Guard de hora (incidente 08/07: un slot de HOY 11:40 se compró a las 11:38, durante
  // una CI en curso para esa misma hora). Server-side con hora AR — el filtro del
  // cliente no alcanza (TZ del browser + datos stale). Margen 15 min (decisión Diego):
  // el médico necesita enterarse antes de que el turno empiece.
  const MARGEN_MIN = 15;
  const ahoraAR = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const hoyAR = `${ahoraAR.getFullYear()}-${(ahoraAR.getMonth() + 1).toString().padStart(2, "0")}-${ahoraAR.getDate().toString().padStart(2, "0")}`;
  if (turno.fecha < hoyAR) return { error: "Este turno ya no está disponible." };
  if (turno.fecha === hoyAR && turno.hora_inicio) {
    const [h, m] = turno.hora_inicio.split(":").map(Number);
    if (h * 60 + m <= ahoraAR.getHours() * 60 + ahoraAR.getMinutes() + MARGEN_MIN) {
      return { error: "Este turno está por comenzar y ya no se puede reservar. Elegí un horario más adelante." };
    }
  }

  // Guard de atención activa con el MISMO médico (incidente 08/07: reservó un turno con
  // el médico mientras estaba EN LA VIDEOLLAMADA con él). Solo bloquea atención ACTIVA
  // con ese médico — agendar un control futuro con OTRO profesional sigue permitido
  // (decisión Diego). OJO: consultas.paciente_id = user_id; turnos.paciente_id = pacientes.id.
  {
    // Solo CI de las últimas 24 h: no existe cron que expire "esperando"/"aceptada"
    // stale (Roberto, gate #253) — sin esta cota, una CI abandonada bloquearía las
    // reservas con ese médico para siempre. Falla permisiva: mejor dejar reservar de
    // más que bloquear por dato viejo.
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: ciActivas } = await supabase
      .from("consultas")
      .select("id", { count: "exact", head: true })
      .eq("paciente_id", user.id)
      .eq("medico_id", turno.medico_id)
      .in("estado", ["esperando", "aceptada", "pagada", "en_curso"])
      .gte("created_at", hace24h);
    if (ciActivas && ciActivas > 0) {
      return { error: "Ya tenés una consulta activa con este profesional. Cuando termine, vas a poder reservar un nuevo turno." };
    }
    const { count: turnosActivos } = await supabase
      .from("turnos")
      .select("id", { count: "exact", head: true })
      .eq("paciente_id", paciente.id)
      .eq("medico_id", turno.medico_id)
      .in("estado", ["en_espera", "en_curso"]);
    if (turnosActivos && turnosActivos > 0) {
      return { error: "Ya tenés una consulta activa con este profesional. Cuando termine, vas a poder reservar un nuevo turno." };
    }
  }

  // Carril de prueba (universos paralelos): un paciente test solo reserva turnos de
  // médicos test, y un paciente real solo de médicos reales. Cubre el link directo.
  {
    const { data: medicoTurno } = await supabase
      .from("medicos").select("es_cuenta_test").eq("id", turno.medico_id).maybeSingle();
    if ((medicoTurno?.es_cuenta_test === true) !== (paciente.es_cuenta_test === true)) {
      return { error: "Este turno ya no está disponible." };
    }
  }

  // C2 (backstop por link directo): con el flag activo, no se puede reservar un
  // turno de un médico sin identidad validada. La vía principal es el filtro de
  // visibilidad (el médico no aparece); esto cubre el caso del link directo.
  if (await getFlag("identidad_gate_activa")) {
    const { data: medicoTurno } = await supabase
      .from("medicos").select("identidad_validada, biometria_exenta, es_cuenta_test").eq("id", turno.medico_id).maybeSingle();
    if (!medicoTurno || !identidadHabilitada(medicoTurno)) {
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
      // El canal del slot es la verdad (validado arriba) — ya no se pisa con el
      // canal pedido, que permitía "mover" un turno privado a la clínica.
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

  // Esta acción es el fallback SIMULADO (confirma sin cobrar). Con el cobro real
  // general ON, solo se permite para cuentas de test; un turno real debe pagarse
  // de verdad por crear-v2 → si llegó acá (ej: médico sin MP), no lo confirmamos
  // gratis. Sin este guard, un turno real podría confirmarse sin pago.
  if (await getFlag("pago_marketplace")) {
    const esTest = await transaccionEsDeTest({
      pacienteUserId: user.id,
      medicoId: turno.medico_id,
    });
    if (!esTest) {
      return { error: "No se pudo procesar el pago de este turno. Reintentá o contactá soporte." };
    }
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
  // CON sonido (decisión Diego 11/06): el médico se entera sin estar mirando la app.
  pushAlMedico(turno.medico_id, {
    title: "🟢 Docto",
    body: `${pacNombre?.nombre_completo ?? "Un paciente"} reservó un turno para el ${turno.fecha}`,
    url: "/medico/agenda",
    tag: `reserva-${turnoId}`,
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
  // SIN skip por en_curso (decisión Diego 11/06): el médico debe enterarse de un
  // paciente esperando AUNQUE esté en otra llamada — antes se salteaba y el
  // siguiente paciente quedaba invisible hasta que el médico volviera al dashboard.
  pushAlMedico(turno.medico_id, {
    title: "🟢 Docto",
    body: `${pacNombre?.nombre_completo ?? "Un paciente"} está esperando tu consulta`,
    url: "/dashboard",
    tag: `espera-${turnoId}`,
  }).catch(() => {});

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
