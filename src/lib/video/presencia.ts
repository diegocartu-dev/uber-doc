// Presencia en la sala de video, leída de `video_presencia` (la escribe el
// webhook de LiveKit: una fila por joined/left, con el rol sacado de la
// identity "medico-<id>" / "paciente-<uid>").
//
// Nació del caso del 29/09/2026: una profesional entró por error a la sala de
// un turno de la mañana siguiente, salió a los segundos, y al cerrarse la sala
// el turno quedó `completado` — sin paciente, sin evolución, sin documentos —
// y los reportes lo contaron como atendido. Ella misma devolvió la plata desde
// su cuenta de Mercado Pago y Docto se enteró por el webhook, que solo anotó
// el estado. Doc: docs/sprints/2026-09-30-hallazgo-devolucion-externa-y-cierre-sin-paciente.md
//
// Regla: UNA SALA SIN PACIENTE NO ES UNA ATENCIÓN.

import { createAdminClient } from "@/lib/supabase/admin";
import { logError, logWarn } from "@/lib/logger";

export type TipoEncuentro = "consulta" | "turno";

/**
 * `sin_datos` no es `no_entro`. La tabla existe desde el 06/06/2026 y el
 * webhook que la escribe falla suave (log + 200): una atención anterior a esa
 * fecha, o una cuyo webhook no llegó, no tiene NINGUNA fila — ni del
 * profesional. Si no hay filas, no se sabe, y "no sé" nunca revierte ni anula.
 */
export type PresenciaPaciente = "entro" | "no_entro" | "sin_datos";

/**
 * `desde` acota la lectura a la sesión actual de la sala (el `iniciado_en` del
 * turno): sin eso, un `joined` del paciente de anoche —cuando el profesional
 * entró por error y el push lo trajo— haría pasar por atendido el turno de hoy.
 * Cualquier fila del paciente cuenta (`joined` o `left`): si el `joined` no
 * llegó a insertarse pero el `left` sí, el paciente estuvo.
 */
export async function presenciaDelPaciente(
  tipo: TipoEncuentro,
  recursoId: string,
  desde?: string | null
): Promise<PresenciaPaciente> {
  const admin = createAdminClient();
  let q = admin.from("video_presencia").select("rol, evento").eq("tipo", tipo).eq("recurso_id", recursoId);
  // Cinco segundos de margen: `ocurrido_at` lo pone Postgres y `iniciado_en` lo
  // pone la función de Vercel; el `joined` del profesional puede quedar unos
  // milisegundos antes del `iniciado_en` que su propia entrada escribió.
  if (desde) q = q.gte("ocurrido_at", new Date(Date.parse(desde) - 5_000).toISOString());
  const { data, error } = await q.order("ocurrido_at", { ascending: false }).limit(200);
  if (error) {
    logError("[PRESENCIA]", "No se pudo leer video_presencia", { tipo, recursoId, error: error.message });
    return "sin_datos";
  }
  if (!data || data.length === 0) return "sin_datos";
  return data.some((f) => f.rol === "paciente") ? "entro" : "no_entro";
}

export type CierreDeSala = { accion: "completar" } | { accion: "revertir" };

/**
 * Qué hacer cuando se cierra la sala de un encuentro `en_curso`.
 *
 * Solo el turno vuelve atrás. La consulta inmediata está `en_curso` desde que
 * Mercado Pago acredita, no desde que el profesional entra, y sus plazos los
 * resuelve `resolver-consultas-vencidas`; devolverla a un estado anterior es
 * meterse con ese cron. Deuda declarada en el hallazgo.
 *
 * Si el profesional tocó "Finalizar", se respeta: es su decisión de cierre,
 * haya entrado el paciente o no.
 */
export function decidirCierreDeSala(args: {
  tipo: TipoEncuentro;
  finalizacionDelMedico: boolean;
  presencia: PresenciaPaciente;
}): CierreDeSala {
  if (args.tipo !== "turno") return { accion: "completar" };
  if (args.finalizacionDelMedico) return { accion: "completar" };
  if (args.presencia !== "no_entro") return { accion: "completar" };
  return { accion: "revertir" };
}

export type ResultadoReversion =
  | { accion: "completar" }
  | { accion: "revertida" }
  | { accion: "ya_cerrada" }
  | { accion: "error"; detalle: string };

/**
 * Revierte un turno `en_curso` cuya sala se cerró sin que el paciente entrara.
 * Lo comparten el webhook de LiveKit (`room_finished`) y el barrido de
 * `cerrar-huerfanas`: la regla vive acá, no en cada cron.
 *
 * Vuelve SIEMPRE a `confirmado`, aunque el paciente hubiera hecho el check-in
 * en la sala de espera. Devolverlo a `en_espera` hacía que, si el profesional
 * cerraba la pestaña sin tocar "Finalizar", el cron lo resolviera como
 * "plantada" —reintegro, agenda despublicada, alertas— a alguien que estuvo en
 * la sala (tercera revisión, 30/09). Con `confirmado`, si el horario ya pasó
 * el cron lo resuelve como ausencia del paciente, sin reintegro: la misma plata
 * que hoy, pero bien contado. Si Diego decide que ese caso lleva reintegro sin
 * sanción, es un cambio en `resolverNoShowMedico`, no acá.
 *
 * `sala_video_url` se limpia a propósito: el recordatorio de 15 minutos al
 * profesional la usa como "ya entró" y sin limpiarla el turno rescatado se
 * quedaba sin aviso. La página de video la vuelve a escribir al reentrar y la
 * sala de LiveKit se recrea con el mismo nombre.
 */
export async function revertirTurnoSinPaciente(turnoId: string, finalizacionDelMedico: boolean): Promise<ResultadoReversion> {
  const admin = createAdminClient();
  const { data: turno, error: errTurno } = await admin.from("turnos").select("iniciado_en").eq("id", turnoId).maybeSingle();
  if (errTurno) return { accion: "error", detalle: errTurno.message };
  const iniciadoEn: string | null = turno?.iniciado_en ?? null;

  const presencia = await presenciaDelPaciente("turno", turnoId, iniciadoEn);
  const decision = decidirCierreDeSala({ tipo: "turno", finalizacionDelMedico, presencia });
  if (decision.accion === "completar") return { accion: "completar" };

  const { data, error } = await admin
    .from("turnos")
    .update({ estado: "confirmado", iniciado_en: null, desconectado_at: null, sala_video_url: null })
    .eq("id", turnoId)
    .eq("estado", "en_curso")
    .select("id")
    .maybeSingle();
  if (error) return { accion: "error", detalle: error.message };
  if (!data) return { accion: "ya_cerrada" };
  logWarn("[PRESENCIA]", "Sala cerrada sin paciente: el turno vuelve a confirmado, no cuenta como atención", { turnoId });
  return { accion: "revertida" };
}

/**
 * Estados en los que una devolución hecha fuera de Docto es noticia para el
 * equipo: la atención está viva o figura como hecha. En un estado terminal que
 * Docto mismo resolvió (ausencias, cancelaciones) no se avisa: los propios
 * caminos de Docto escriben el estado ANTES de llamar a Mercado Pago, y el
 * webhook puede llegar antes de que anoten el reintegro.
 */
const ESTADOS_VIVOS_O_HECHOS = new Set([
  "confirmado",
  "en_espera",
  "en_curso",
  "completado",
  "esperando",
  "aceptada",
  "pagada",
  "completada",
]);

export type ReaccionADevolucion =
  | { externa: false }
  | { externa: true; anularAtencion: boolean; avisar: boolean; dobleCobro: boolean };

/**
 * Qué hacer cuando Mercado Pago avisa `refunded` sobre un pago vigente.
 *
 * Si la devolución la disparó Docto, `reintegro_estado` ya está escrito:
 * `ejecutarRefund` marca `pendiente` ANTES de llamar a Mercado Pago, y el cron
 * de reintentos trabaja sobre filas ya marcadas. Null = alguien la hizo desde
 * Mercado Pago, fuera de Docto: el profesional, que es el cobrador y puede.
 *
 * Una devolución externa NUNCA cancela sola una atención viva: se avisa al
 * equipo y decide una persona. Lo que sí se anula es una atención cerrada
 * como hecha a la que el paciente nunca entró y que no dejó ni evolución ni
 * documentos: ahí la "atención" no existió. Con `sin_datos` no se anula nada.
 */
export function decidirReaccionADevolucion(args: {
  estado: string;
  reintegroEstado: string | null;
  presencia: PresenciaPaciente;
  hayEvidencia: boolean;
}): ReaccionADevolucion {
  // Docto ya le pagó al paciente por CVU y ahora el profesional devuelve desde
  // MP: el paciente cobró dos veces. No se toca nada; se avisa.
  if (args.reintegroEstado === "cubierto_docto") {
    return { externa: true, anularAtencion: false, avisar: true, dobleCobro: true };
  }
  if (args.reintegroEstado !== null) return { externa: false };
  const cerradaComoAtendida = args.estado === "completado" || args.estado === "completada";
  return {
    externa: true,
    anularAtencion: cerradaComoAtendida && args.presencia === "no_entro" && !args.hayEvidencia,
    avisar: ESTADOS_VIVOS_O_HECHOS.has(args.estado),
    dobleCobro: false,
  };
}
