import { createAdminClient } from "@/lib/supabase/admin";
import { enviarEmailTurnoCancelado } from "@/lib/email";
import { pushAlPaciente, pushAlMedico } from "@/lib/push";
import { cerrarEntradaSala } from "@/lib/sala-espera";
import { refundTotal } from "@/lib/mp-refund";
import { decrypt } from "@/lib/mp-crypto";
import { registrarRefundPendiente } from "@/lib/refunds-pendientes";
import { sendDoctoAlert } from "@/lib/alertas";
import { logInfo, logError } from "@/lib/logger";
import { articuloMedico, formatNombreMedico } from "@/lib/utils/texto";
import { esInstitucional } from "@/lib/instancia";

type ResultadoCancelacion = {
  ok: boolean;
  reembolso: boolean;
  error?: string;
};

function esMasDe48hAntes(fecha: string, horaInicio: string): boolean {
  const turnoDate = new Date(`${fecha}T${horaInicio}:00-03:00`);
  const ahora = new Date();
  const diffMs = turnoDate.getTime() - ahora.getTime();
  return diffMs > 48 * 60 * 60 * 1000;
}

type ReintegroEstado = "reembolsado" | "fee_pendiente" | "pendiente" | null;

export async function ejecutarRefund(
  recursoId: string,
  medicoId: string,
  pagoId: string,
  netoMedico: number,
  applicationFee: number,
  tipo: "turno" | "consulta" = "turno"
): Promise<ReintegroEstado> {
  const supabase = createAdminClient();

  const { data: mpAccount } = await supabase
    .from("medicos_mp_accounts")
    .select("access_token_encrypted")
    .eq("medico_id", medicoId)
    .eq("estado", "activo")
    .maybeSingle();

  if (!mpAccount?.access_token_encrypted) {
    logError("[REFUND]", "Sin token MP del médico", { recursoId, medicoId });
    return "pendiente";
  }

  let tokenMedico: string;
  try {
    tokenMedico = decrypt(mpAccount.access_token_encrypted);
  } catch (err) {
    logError("[REFUND]", "Error desencriptando token médico", { recursoId, medicoId, error: String(err) });
    return "pendiente";
  }

  // UN solo refund total con el token del MÉDICO. MP revierte automáticamente la
  // comisión de Docto (vive en la cuenta marketplace/GREBA) por el split — no hay
  // pata de fee separada (la vieja `refundConReversionDeFee` fallaba en prod con
  // "Payment not found" al intentar el fee con el token de GREBA).
  const result = await refundTotal(pagoId, tokenMedico, `refund:${tipo}:${recursoId}`);

  logInfo("[REFUND]", "Resultado refund total", {
    recursoId,
    ok: result.ok,
    status: result.status,
    insufficientFunds: !result.ok && result.insufficientFunds,
  });

  if (result.ok) return "reembolsado";

  // Falló → encolar para reintento diario (cron). El refund total ya incluye la
  // comisión de Docto, así que ya no hay estado `fee_pendiente`.
  await registrarRefundPendiente({
    tipo,
    recursoId,
    medicoId,
    pagoId,
    netoMedico,
    applicationFee,
    estado: "pendiente",
    error: result.error,
  });

  // Aviso al admin en el PRIMER fallo (día 1), no recién al escalar tras 10 reintentos.
  // Distingue la causa para poder priorizar: saldo (se resuelve solo) vs otro error
  // (no se arregla reintentando → requiere acción manual ya).
  const causa = result.insufficientFunds
    ? "Médico sin saldo en MP. Se reintenta cada 24h y a las 48h Docto cubre al paciente por CVU. Suele resolverse solo cuando el médico cobra otra consulta — no requiere acción inmediata."
    : `Error de Mercado Pago (NO es saldo): "${result.error}". NO se resuelve solo reintentando — requiere revisión manual ahora.`;
  await sendDoctoAlert(
    "[REFUND] Reembolso no procesó al primer intento",
    `Un reembolso falló en el PRIMER intento y quedó en cola.\n\n` +
      `Tipo: ${tipo}\nRecurso: ${recursoId}\nMédico: ${medicoId}\nPago: ${pagoId}\n` +
      `Monto: $${netoMedico + applicationFee}\nCausa: ${causa}\n\n` +
      `Acción: revisar en el admin de reembolsos / en Mercado Pago. (Este aviso ahora llega el día 1; antes recién llegaba tras 10 reintentos ≈ 10 días.)`
  ).catch((e) => logError("[REFUND]", "Error enviando alerta día-1", { recursoId, error: String(e) }));

  if (result.insufficientFunds) {
    logError("[REFUND]", "Médico sin saldo — reintento diario / escala a CVU a las 48h", { recursoId, medicoId });
    // Notificación inmediata: el médico necesita saldo para que el refund proceda.
    pushAlMedico(medicoId, {
      title: "Reembolso pendiente",
      body: "Un paciente canceló y su reembolso necesita saldo en tu cuenta de Mercado Pago. Lo reintentamos cada 24hs.",
      url: "/dashboard",
      tag: `refund-pendiente-${recursoId}`,
    }).catch(() => {});
  }

  return "pendiente";
}

// Re-ofrece el horario de un turno que dejó de retenerlo (cancelación del
// paciente o reprogramación del médico): inserta una fila `disponible` nueva con
// la misma clave. Requiere el índice PARCIAL (migraciones 20260713): la fila
// origen, ya en estado terminal, no choca. Copia modelo_id y canal_origen (gate
// Roberto #261: sin modelo_id, recalcularBloqueos mata el slot re-creado; sin
// canal, un turno de consultorio se re-ofrecería en el canal público).
// El flujo principal NO se aborta si esto falla (el turno ya transicionó): se
// loguea + alerta para reponer a mano. Backstop: generar-slots re-crea slots sin
// fila activa dentro del horizonte del modelo.
// OJO: la reprogramación CON CRÉDITO del paciente NO llama esto — su horario ya
// se re-ofreció cuando el turno se canceló.
async function reofrecerHorario(
  supabase: ReturnType<typeof createAdminClient>,
  turnoOrigenId: string,
  contexto: string
): Promise<void> {
  const { data: turno, error: errLectura } = await supabase
    .from("turnos")
    .select("medico_id, modelo_id, fecha, hora_inicio, hora_fin, monto, canal_origen")
    .eq("id", turnoOrigenId)
    .maybeSingle();
  if (!turno) {
    // Distinguir fallo de lectura de not-found real (gate Roberto #262 obs.1) y
    // alertar en ambos: un horario que no se re-ofrece es pérdida silenciosa.
    const motivo = errLectura
      ? `error leyendo el turno: ${errLectura.message}`
      : "turno origen no encontrado";
    logError("[CANCELACIONES]", `reofrecerHorario: ${motivo}`, {
      turnoOrigenId,
      contexto,
    });
    sendDoctoAlert(
      `⚠️ Horario no re-ofrecido tras ${contexto}`,
      `No se pudo re-ofrecer el horario del turno ${turnoOrigenId} (${motivo}). Queda sin ofrecer hasta que generar-slots lo reponga o se reponga a mano.`
    ).catch(() => {});
    return;
  }

  const { error: errSlot } = await supabase.from("turnos").insert({
    medico_id: turno.medico_id,
    modelo_id: turno.modelo_id,
    fecha: turno.fecha,
    hora_inicio: turno.hora_inicio,
    hora_fin: turno.hora_fin,
    estado: "disponible",
    monto: turno.monto,
    canal_origen: turno.canal_origen,
  });
  if (errSlot) {
    logError("[CANCELACIONES]", "No se pudo re-ofrecer el horario (queda sin ofrecer)", {
      turnoOrigenId,
      contexto,
      medicoId: turno.medico_id,
      fecha: turno.fecha,
      error: errSlot.message,
    });
    sendDoctoAlert(
      `⚠️ Horario no re-ofrecido tras ${contexto}`,
      `Tras ${contexto} del turno ${turnoOrigenId} no se pudo volver a ofrecer el horario ${turno.fecha} ${turno.hora_inicio} del médico ${turno.medico_id}:\n\n${errSlot.message}\n\nQueda sin ofrecer hasta que generar-slots lo reponga o se reponga a mano.`
    ).catch(() => {});
  }
}

export async function cancelarTurnoPorPaciente(
  turnoId: string,
  pacienteId: string,
  motivo?: string
): Promise<ResultadoCancelacion> {
  const supabase = createAdminClient();

  const { data: turno } = await supabase
    .from("turnos")
    .select("id, estado, paciente_id, fecha, hora_inicio, hora_fin, medico_id, monto, pago_id, mp_net_amount_medico, mp_application_fee, modelo_id, canal_origen")
    .eq("id", turnoId)
    .single();

  if (!turno) return { ok: false, reembolso: false, error: "Turno no encontrado." };
  if (turno.paciente_id !== pacienteId) return { ok: false, reembolso: false, error: "Este turno no te pertenece." };
  if (turno.estado !== "confirmado" && turno.estado !== "en_espera") {
    return { ok: false, reembolso: false, error: "Este turno no se puede cancelar." };
  }

  const reembolso = esMasDe48hAntes(turno.fecha, turno.hora_inicio);

  // Refund total: solo se necesita el pago_id (MP revierte la parte del médico y la
  // comisión de Docto por el split). Los montos van solo para la cola/escalada.
  let reintegroEstado: ReintegroEstado = null;
  if (reembolso && turno.pago_id) {
    reintegroEstado = await ejecutarRefund(
      turnoId,
      turno.medico_id,
      turno.pago_id,
      turno.mp_net_amount_medico ?? 0,
      turno.mp_application_fee ?? 0
    );
  }

  // Guard de estado en el UPDATE (gate Roberto #256): en carrera con el motor de
  // no-show, un update incondicional podía pisar `ausente_medico` recién escrito
  // (borrando su reintegro_estado) y encima duplicar el slot como disponible.
  const { data: actualizado, error } = await supabase
    .from("turnos")
    .update({
      estado: "cancelado_paciente",
      motivo_cancelacion: motivo || null,
      reintegro_estado: reintegroEstado,
    })
    .eq("id", turnoId)
    .in("estado", ["confirmado", "en_espera"])
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, reembolso: false, error: error.message };
  if (!actualizado) return { ok: false, reembolso: false, error: "El turno cambió de estado. Recargá la página." };

  cerrarEntradaSala({ turnoId, motivo: "cancelado_paciente" }).catch(() => {});

  await reofrecerHorario(supabase, turnoId, "cancelación de paciente");

  enviarEmailTurnoCancelado(turnoId, "paciente").catch(console.error);

  const reembolsoMsg = reembolso
    ? (reintegroEstado === "reembolsado"
        ? "Tu reembolso fue procesado."
        : "Tu reembolso está en proceso.")
    : "No aplica reembolso (menos de 48hs de anticipación).";

  await insertarMensajeSistema(
    turnoId,
    pacienteId,
    turno.medico_id,
    `Cancelaste el turno del ${formatearFechaCorta(turno.fecha)}. ${reembolsoMsg}`
  );

  const { data: pacNombre } = await supabase
    .from("pacientes").select("nombre_completo").eq("id", pacienteId).single();
  pushAlMedico(turno.medico_id, {
    title: "🔴 Docto",
    body: `${pacNombre?.nombre_completo ?? "Un paciente"} canceló su turno del ${formatearFechaCorta(turno.fecha)}`,
    url: "/medico/agenda",
    tag: `cancelado-pac-${turnoId}`,
    silent: true,
  }).catch(() => {});

  return { ok: true, reembolso };
}

export async function cancelarTurnoPorMedico(
  turnoId: string,
  medicoId: string,
  motivo?: string
): Promise<ResultadoCancelacion> {
  const supabase = createAdminClient();

  const { data: turno } = await supabase
    .from("turnos")
    .select("id, estado, paciente_id, medico_id, fecha, hora_inicio, monto, pago_id, mp_net_amount_medico, mp_application_fee")
    .eq("id", turnoId)
    .single();

  if (!turno) return { ok: false, reembolso: false, error: "Turno no encontrado." };
  if (turno.medico_id !== medicoId) return { ok: false, reembolso: false, error: "No es tu turno." };
  // `en_curso` incluido (08/07, decisión Diego): ante una falla técnica en plena consulta,
  // el médico necesita una salida que reembolse al paciente — sin esto, su única opción
  // era marcarla "completada" (paciente pagó y no recibió nada, sin camino de reembolso).
  const CANCELABLES = ["confirmado", "en_espera", "en_curso"];
  if (!CANCELABLES.includes(turno.estado)) {
    return { ok: false, reembolso: false, error: "Este turno no se puede cancelar." };
  }

  let reintegroEstado: ReintegroEstado = null;
  if (turno.pago_id) {
    reintegroEstado = await ejecutarRefund(
      turnoId,
      turno.medico_id,
      turno.pago_id,
      turno.mp_net_amount_medico ?? 0,
      turno.mp_application_fee ?? 0
    );
  }

  // Guard de estado en el UPDATE: si otra corrida/acción lo movió (ej. completado)
  // entre la lectura y acá, no lo pisamos.
  const { data: actualizado, error } = await supabase
    .from("turnos")
    .update({
      estado: "cancelado_medico",
      motivo_cancelacion: motivo || null,
      reintegro_estado: reintegroEstado,
    })
    .eq("id", turnoId)
    .in("estado", CANCELABLES)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, reembolso: false, error: error.message };
  if (!actualizado) return { ok: false, reembolso: false, error: "El turno cambió de estado. Recargá la página." };

  cerrarEntradaSala({ turnoId, motivo: "cancelado_medico" }).catch(() => {});

  enviarEmailTurnoCancelado(turnoId, "medico").catch(console.error);

  if (turno.paciente_id) {
    // `titulo` ("Dr."/"Dra.") entra al SELECT porque este mensaje NOMBRA al
    // médico frente al paciente, y decía "El Dr/a. Nombre" — una barra que no
    // dice nada, cuando el dato real existe desde el registro. Solo esa columna.
    const { data: medico } = await supabase
      .from("medicos")
      .select("nombre_completo, titulo, slug")
      .eq("id", medicoId)
      .single();

    const slug = medico?.slug ?? "";
    const reembolsoMsg = reintegroEstado === "reembolsado"
      ? " Tu reembolso fue procesado."
      : reintegroEstado === "fee_pendiente" || reintegroEstado === "pendiente"
        ? " Tu reembolso está en proceso."
        : "";

    // Sujeto de la frase con su artículo: "La Dra. García canceló…" / "El Dr.
    // López canceló…". Sin título conocido arranca por el nombre pelado y sin
    // artículo, que es correcto; si tampoco hay nombre, cae al genérico neutro.
    const nombreConTitulo = formatNombreMedico(medico?.nombre_completo ?? "", medico?.titulo);
    const articulo = articuloMedico(medico?.titulo);
    const sujetoMedico = nombreConTitulo
      ? `${articulo ? `${articulo[0].toUpperCase()}${articulo.slice(1)} ` : ""}${nombreConTitulo}`
      : "El profesional";

    await insertarMensajeSistema(
      turnoId,
      turno.paciente_id,
      medicoId,
      `${sujetoMedico} canceló el turno del ${formatearFechaCorta(turno.fecha)}.${reembolsoMsg} Podés reprogramar desde docto.com.ar/dr/${slug}`
    );

    pushAlPaciente(turno.paciente_id, {
      title: "🔴 Docto",
      body: `Tu turno del ${formatearFechaCorta(turno.fecha)} fue cancelado. Podés reprogramar.`,
      url: `/dr/${slug}`,
      tag: `cancelado-${turnoId}`,
    }).catch(() => {});
  }

  return { ok: true, reembolso: true };
}

// Resolución automática de un turno que quedó en `en_espera` y el médico NUNCA atendió
// (no-show): el paciente entró a la sala, el médico no (nunca pasó a en_curso). El cron
// `sala-espera-diaria` llama a esto pasado el horario del turno + gracia → marca
// `ausente_medico` y reembolsa con el MISMO motor que una cancelación de médico (ejecutarRefund
// + auto-retry). Idempotente: solo actúa si el turno SIGUE en `en_espera`.
export async function resolverNoShowMedico(
  turnoId: string
): Promise<{ ok: boolean; reembolso: ReintegroEstado }> {
  const supabase = createAdminClient();

  const { data: turno } = await supabase
    .from("turnos")
    .select("id, estado, paciente_id, medico_id, fecha, pago_id, mp_net_amount_medico, mp_application_fee")
    .eq("id", turnoId)
    .single();

  if (!turno || turno.estado !== "en_espera") return { ok: false, reembolso: null };

  let reintegroEstado: ReintegroEstado = null;
  // Modo institucional (spec institucional §6.3, gate #401): acá NO hay Mercado
  // Pago — el turno nació 'confirmado' sin pago y `pago_id` debería ser siempre
  // NULL. El gate por modo es cinturón y tirantes: si un dato sucio trajera un
  // pago_id, ejecutar la rama de refund encolaría refunds imposibles contra
  // `medicos_mp_accounts` que no existen. Se resuelve a `ausente_medico` igual,
  // SIN rama de refund. En B2C, esInstitucional() es false: idéntico.
  if (turno.pago_id && !esInstitucional()) {
    reintegroEstado = await ejecutarRefund(
      turnoId,
      turno.medico_id,
      turno.pago_id,
      turno.mp_net_amount_medico ?? 0,
      turno.mp_application_fee ?? 0
    );
  }

  // Idempotencia: el `.eq("estado","en_espera")` evita que dos corridas re-resuelvan.
  // `motivo_cancelacion` = texto que el dashboard de reembolsos muestra al lado del paciente.
  // Filas afectadas verificadas (gate Roberto): el perdedor de una carrera no debe
  // mandar mensaje + push duplicado al paciente.
  const { data: actualizado, error } = await supabase
    .from("turnos")
    .update({
      estado: "ausente_medico",
      resolucion_motivo: "medico_ausente",
      motivo_cancelacion: "Médico ausente — no atendió el turno",
      reintegro_estado: reintegroEstado,
    })
    .eq("id", turnoId)
    .eq("estado", "en_espera")
    .select("id")
    .maybeSingle();
  if (error || !actualizado) return { ok: false, reembolso: reintegroEstado };

  if (turno.paciente_id) {
    const reembolsoMsg =
      reintegroEstado === "reembolsado"
        ? " Te reembolsamos la consulta."
        : reintegroEstado
          ? " Tu reembolso está en proceso."
          : "";
    // Mismo framing que la pantalla de espera ("no pudo atender", no "no se presentó" —
    // innecesariamente incendiario contra el médico). Gate Sofía.
    await insertarMensajeSistema(
      turnoId,
      turno.paciente_id,
      turno.medico_id,
      `El médico no pudo atender tu turno del ${formatearFechaCorta(turno.fecha)}.${reembolsoMsg}`
    );
    pushAlPaciente(turno.paciente_id, {
      title: "🔴 Docto",
      body: `El médico no pudo atender tu turno del ${formatearFechaCorta(turno.fecha)}.${reembolsoMsg}`,
      url: "/mis-consultas",
      tag: `noshow-${turnoId}`,
    }).catch(() => {});
  }

  return { ok: true, reembolso: reintegroEstado };
}

// Turno `confirmado` que NADIE tomó: el paciente nunca entró a la sala (si hubiera
// entrado estaría en_espera) y pasó el fin del turno + gracia. Decisión Diego (08/07):
// es ausencia del PACIENTE → SIN reembolso, el médico conserva el cobro, y queda
// medible en reportes como consulta no realizada (estado ausente_paciente).
// Idempotente: solo actúa si el turno SIGUE en `confirmado`.
export async function resolverAusentePaciente(
  turnoId: string
): Promise<{ ok: boolean }> {
  const supabase = createAdminClient();

  const { data: turno } = await supabase
    .from("turnos")
    .select("id, estado, paciente_id, medico_id, fecha")
    .eq("id", turnoId)
    .single();
  if (!turno || turno.estado !== "confirmado") return { ok: false };

  const { data: actualizado, error } = await supabase
    .from("turnos")
    .update({
      estado: "ausente_paciente",
      resolucion_motivo: "paciente_ausente",
      motivo_cancelacion: "Paciente ausente — no se presentó al turno",
    })
    .eq("id", turnoId)
    .eq("estado", "confirmado")
    .select("id")
    .maybeSingle();
  if (error || !actualizado) return { ok: false };

  if (turno.paciente_id) {
    // Hecho verificable (no acusación) + regla + salida + recurso (gate Sofía): lo que el
    // sistema SABE es que no registró su ingreso — no que "no se presentó".
    await insertarMensajeSistema(
      turnoId,
      turno.paciente_id,
      turno.medico_id,
      `Tu turno del ${formatearFechaCorta(turno.fecha)} venció sin que registráramos tu ingreso a la consulta. Los turnos no utilizados no tienen reembolso. Podés reservar uno nuevo cuando quieras. Si creés que hubo un error, escribinos a soporte@docto.com.ar.`
    ).catch(() => {});
  }

  return { ok: true };
}

export async function reprogramarTurno(
  turnoOrigenId: string,
  nuevoTurnoId: string,
  pacienteId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("reprogramar_turno_atomico", {
    p_turno_origen_id: turnoOrigenId,
    p_nuevo_turno_id: nuevoTurnoId,
    p_paciente_id: pacienteId,
  });

  if (error) return { ok: false, error: error.message };

  const resultado = data as string;
  if (resultado !== "ok") return { ok: false, error: resultado };

  const { data: nuevoTurno } = await supabase
    .from("turnos")
    .select("fecha, hora_inicio, medico_id")
    .eq("id", nuevoTurnoId)
    .single();

  if (nuevoTurno) {
    await insertarMensajeSistema(
      nuevoTurnoId,
      pacienteId,
      nuevoTurno.medico_id,
      `Tu turno fue reprogramado al ${formatearFechaCorta(nuevoTurno.fecha)} a las ${nuevoTurno.hora_inicio.slice(0, 5)}.`
    );
  }

  return { ok: true };
}

// Reprogramación INICIADA POR EL MÉDICO: mueve un turno confirmado a otro slot
// disponible, preservando el pago. Usa el RPC dedicado reprogramar_turno_medico
// (NO el del paciente, que tiene reglas de crédito). Notifica al paciente.
export async function reprogramarTurnoMedico(
  turnoOrigenId: string,
  nuevoTurnoId: string,
  medicoId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("reprogramar_turno_medico", {
    p_turno_origen_id: turnoOrigenId,
    p_nuevo_turno_id: nuevoTurnoId,
    p_medico_id: medicoId,
  });

  if (error) return { ok: false, error: error.message };

  const resultado = data as string;
  if (resultado !== "ok") return { ok: false, error: resultado };

  // El turno origen era un confirmado VIVO que retenía su horario; al moverse, el
  // horario queda libre → re-ofrecerlo (decisión Diego 13/07). La reprogramación
  // con crédito (reprogramarTurno) NO hace esto: su horario ya se re-ofreció al
  // cancelar.
  await reofrecerHorario(supabase, turnoOrigenId, "reprogramación del médico");

  // Notificar al paciente del nuevo horario (paciente_id se deriva del turno movido)
  const { data: nuevoTurno } = await supabase
    .from("turnos")
    .select("fecha, hora_inicio, medico_id, paciente_id")
    .eq("id", nuevoTurnoId)
    .single();

  if (nuevoTurno?.paciente_id) {
    await insertarMensajeSistema(
      nuevoTurnoId,
      nuevoTurno.paciente_id,
      nuevoTurno.medico_id,
      `Tu turno fue reprogramado al ${formatearFechaCorta(nuevoTurno.fecha)} a las ${nuevoTurno.hora_inicio.slice(0, 5)}.`
    );
  }

  return { ok: true };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function insertarMensajeSistema(
  turnoId: string,
  pacienteId: string,
  medicoId: string,
  contenido: string
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("mensajes_sistema").insert({
    turno_id: turnoId,
    paciente_id: pacienteId,
    medico_id: medicoId,
    contenido,
  });
  if (error) console.error("Error insertando mensaje sistema:", error.message);
}

function formatearFechaCorta(fecha: string): string {
  const d = new Date(fecha + "T12:00:00");
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}
