// Plazo de la consulta inmediata: 30 minutos (decisión Diego, 09/08/2026).
//
// El turno tenía plazo desde el 08/07 (cron cada 10 min, 20 de gracia). La CI no
// tenía NINGUNO: una consulta pagada que nadie tomaba se quedaba ahí hasta el
// cron de las 3 AM. Con la regla del Uber —que retiene al paciente mientras
// tiene una atención paga— eso pasó de ser feo a ser una trampa: el paciente
// quedaba sin poder consultar con otro hasta la madrugada.
//
// LAS DOS SALIDAS, a los 30 minutos del pago:
//
//   · MÉDICO AUSENTE  → reintegro del 100% INMEDIATO y el paciente queda libre
//                       para elegir otro profesional. La pantalla se lo dice.
//   · PACIENTE AUSENTE→ sin reintegro. La consulta se cierra.
//
// EL RELOJ NO CORRE SI EL MÉDICO ESTÁ ATENDIENDO A OTRO (condición de Diego).
// Un profesional que está adentro de otra consulta no está ausente: está
// trabajando. Mientras siga ocupado no se resuelve nada y el paciente sigue
// esperando — es exactamente el mismo criterio que ya usa el cron de turnos.
//
// CÓMO SE SABE QUE EL PROFESIONAL NO ENTRÓ — leer esto antes de tocar el filtro
//
// NO se puede usar el estado. Un pago REAL de CI salta de `aceptada` directo a
// `en_curso`: lo escribe el webhook de MP en el instante en que acredita, mucho
// antes de que el profesional abra nada. `pagada` solo la escribe la simulación
// de cuentas de test. La primera versión de este módulo filtraba por `pagada` y
// por eso NUNCA se ejecutó sobre plata real: el plazo de 30 minutos no existía
// para ningún paciente de verdad, mientras la regla del Uber sí lo retenía.
// (Ya estaba documentado en `src/lib/estado-pago-consulta.ts`.)
//
// La señal correcta es `sala_video_url`. Se escribe en exactamente dos lugares
// —el workspace del profesional y `/api/livekit/crear-sala`— y las dos exigen
// que EL PROFESIONAL actúe. `sala_video_url IS NULL` significa que nunca se
// creó la sala, o sea que nunca entró.
//
// CÓMO SE DECIDE QUIÉN FALTÓ, y por qué se inclina a favor del paciente
// Lo que hay que distinguir es si el paciente estuvo. La única evidencia dura de
// que NO estuvo es que no exista ni una entrada suya a la sala
// (`sala_espera_entradas`). Ante la duda se resuelve como médico ausente CON
// reintegro: equivocarse para ese lado cuesta plata, equivocarse para el otro le
// niega el reintegro a alguien que esperó media hora. El error caro es el segundo.

import { createAdminClient } from "@/lib/supabase/admin";
import { ejecutarRefund } from "@/lib/cancelaciones";
import { registrarRefundPendiente } from "@/lib/refunds-pendientes";
import { pushAlPaciente } from "@/lib/push";
import { logError, logInfo } from "@/lib/logger";

/** Minutos desde el pago antes de resolver. */
export const PLAZO_CI_MIN = 30;

export type ResultadoResolucion =
  | { resuelta: false; motivo: "no_candidata" | "medico_ocupado" | "carrera_perdida" }
  | { resuelta: true; desenlace: "medico_ausente"; reintegro: string | null }
  | { resuelta: true; desenlace: "paciente_ausente" };

type ConsultaVencida = {
  id: string;
  medico_id: string;
  paciente_id: string;
  estado: string;
  pago_id: string | null;
  mp_net_amount_medico: number | null;
  mp_application_fee: number | null;
};

/**
 * Estados desde los que se puede resolver. `en_curso` es el de la plata real;
 * `pagada` queda para las cuentas de test, que sí pasan por ahí.
 *
 * El UPDATE se condiciona al estado EXACTO que se leyó (`.eq("estado", ...)`),
 * no a la lista: es el candado de idempotencia contra dos corridas solapadas.
 */
export const ESTADOS_RESOLUBLES = ["pagada", "en_curso"];

/**
 * Momento desde el que se cuentan los 30 minutos.
 *
 * `mp_payment_created_at` es el ancla correcta: la consulta se crea cuando el
 * paciente la SOLICITA, y entre eso y el pago puede pasar un rato largo
 * esperando que el profesional acepte. Anclar en `created_at` haría vencer
 * consultas recién pagadas.
 */
export function momentoDePago(c: {
  mp_payment_created_at?: string | null;
  aceptada_at?: string | null;
  created_at?: string | null;
}): number {
  for (const valor of [c.mp_payment_created_at, c.aceptada_at, c.created_at]) {
    if (!valor) continue;
    const ms = new Date(valor).getTime();
    if (!Number.isNaN(ms)) return ms;
  }
  return NaN;
}

/**
 * ¿El profesional está adentro de otra atención ahora mismo?
 *
 * Se exige `sala_video_url` NO nulo, no solo `estado = 'en_curso'`. Sin eso, la
 * propia consulta colgada —que está en `en_curso` desde que MP acreditó— hacía
 * ver ocupado a su propio profesional y congelaba el plazo para siempre: el
 * paciente no se liberaba nunca.
 */
export async function medicosOcupados(medicoIds: string[]): Promise<Set<string>> {
  if (medicoIds.length === 0) return new Set();
  const admin = createAdminClient();
  const [{ data: cis }, { data: turnos }] = await Promise.all([
    admin
      .from("consultas")
      .select("medico_id")
      .in("medico_id", medicoIds)
      .eq("estado", "en_curso")
      .not("sala_video_url", "is", null),
    // TURNOS: sin el refinamiento de `sala_video_url`. Acá `en_curso` SÍ
    // significa que el profesional está adentro (lo escribe su propia pantalla
    // de video), y la sala se guarda en un update aparte que puede fallar. Pedir
    // la sala haría que un profesional que está atendiendo un turno dejara de
    // contar como ocupado, y se le marcaría ausencia en una CI que espera.
    admin.from("turnos").select("medico_id").in("medico_id", medicoIds).eq("estado", "en_curso"),
  ]);
  return new Set([...(cis ?? []), ...(turnos ?? [])].map((r) => r.medico_id).filter(Boolean));
}

/**
 * `consultas.paciente_id` es `auth.users.id`, pero `pushAlPaciente` espera
 * `pacientes.id` (asimetría de schema por canal). Confundirlos manda el aviso a
 * la nada — o peor, a otra persona.
 */
async function filaPaciente(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("pacientes")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.id ?? null;
}

/** ¿Quedó rastro de que el paciente entró alguna vez a la sala de esta consulta? */
async function elPacienteEstuvoEnLaSala(consultaId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sala_espera_entradas")
    .select("id")
    .eq("consulta_id", consultaId)
    .limit(1);

  // Si no se pudo leer, NO se asume ausencia: se trata como si hubiera estado.
  // Una query fallada no puede costarle el reintegro a nadie.
  if (error) {
    logError("[plazo-ci]", "No se pudo leer la entrada a sala; se asume que el paciente estuvo", {
      consultaId,
      error: error.message,
    });
    return true;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Resuelve UNA consulta vencida. Nunca lanza.
 *
 * Idempotente por el `.eq("estado","pagada")` del UPDATE: si dos corridas se
 * pisan, una sola gana y la otra devuelve `carrera_perdida` sin reembolsar dos
 * veces.
 */
export async function resolverConsultaVencida(
  consulta: ConsultaVencida,
  ocupados: Set<string>
): Promise<ResultadoResolucion> {
  if (ocupados.has(consulta.medico_id)) {
    return { resuelta: false, motivo: "medico_ocupado" };
  }

  const admin = createAdminClient();
  const pacienteEstuvo = await elPacienteEstuvoEnLaSala(consulta.id);

  // ── El paciente nunca apareció: sin reintegro ──────────────────────────────
  if (!pacienteEstuvo) {
    const { data: cerrada } = await admin
      .from("consultas")
      .update({
        estado: "no_show_paciente",
        resolucion_motivo: "paciente_ausente",
        resuelta_at: new Date().toISOString(),
        resuelta_por: "plazo_30min",
      })
      .eq("id", consulta.id)
      .eq("estado", consulta.estado)
      .is("sala_video_url", null)
      .select("id")
      .maybeSingle();

    if (!cerrada) return { resuelta: false, motivo: "carrera_perdida" };

    // Hecho verificable, no acusación (mismo criterio que el aviso de turnos):
    // lo que el sistema SABE es que no registró su ingreso.
    const filaPac = await filaPaciente(consulta.paciente_id);
    if (filaPac) {
      await pushAlPaciente(filaPac, {
      title: "Tu consulta venció",
      body: "No registramos tu ingreso a la consulta. Las consultas no utilizadas no tienen reintegro.",
      url: "/mis-consultas",
      tag: `vencida-${consulta.id}`,
      }).catch(() => {});
    }

    logInfo("[plazo-ci]", "Consulta cerrada por ausencia del paciente", { consultaId: consulta.id });
    return { resuelta: true, desenlace: "paciente_ausente" };
  }

  // ── El profesional no entró: reintegro del 100% ────────────────────────────
  //
  // ORDEN: PRIMERO se toma la fila, DESPUÉS se devuelve la plata.
  //
  // El UPDATE condicionado (`estado` exacto + `sala_video_url` nulo) es lo único
  // que garantiza que una sola corrida resuelva esta consulta. Si se refundeara
  // antes, dos corridas solapadas podrían mandar dos refunds a MP, y peor: con
  // el guard nuevo de `sala_video_url`, un profesional que abre la sala entre el
  // refund y el UPDATE dejaba la plata devuelta y la consulta viva.
  //
  // El hueco que abre este orden —tomada y todavía sin devolver— es acotado y
  // VISIBLE: queda como `medico_ausente` con `reintegro_estado` en NULL, y el
  // paciente ya está liberado (el estado es terminal, sale de la retención).
  // Es un estado consultable y reparable; lo contrario —plata devuelta sin
  // rastro en la base— no lo es.
  const { data: tomada } = await admin
    .from("consultas")
    .update({
      estado: "medico_ausente",
      resolucion_motivo: "medico_ausente",
      resuelta_at: new Date().toISOString(),
      resuelta_por: "plazo_30min",
    })
    .eq("id", consulta.id)
    .eq("estado", consulta.estado)
    // Si entre el SELECT y este UPDATE el profesional abrió la sala, NO se
    // resuelve: llegó tarde pero llegó. La condición viaja en el propio UPDATE
    // para que no haya ventana entre el chequeo y la escritura.
    .is("sala_video_url", null)
    .select("id")
    .maybeSingle();

  if (!tomada) return { resuelta: false, motivo: "carrera_perdida" };

  let reintegro: string | null = null;
  if (consulta.pago_id) {
    // RESERVA EN LA COLA ANTES DE LLAMAR A MP.
    //
    // Entre "tomar la fila" y "anotar el reintegro" hay una llamada a Mercado
    // Pago. Si el proceso muere ahí —deploy en el medio, reciclado de instancia,
    // una llamada que cuelga— la consulta queda `medico_ausente` con
    // `reintegro_estado` en NULL y NADIE la vuelve a mirar: ya no es candidata
    // del cron, y `ejecutarRefund` solo encola cuando MP RESPONDE mal, no cuando
    // no llega a responder. El paciente vería la pantalla que le promete la
    // devolución, sobre plata que nunca salió.
    //
    // Dejando la fila en la cola ANTES, ese huérfano cae solo en
    // `cron/reintentar-refunds`, que ya existe. La cola es idempotente por
    // (tipo, recurso_id), así que si `ejecutarRefund` después la vuelve a
    // escribir por un fallo real, la pisa sin duplicar.
    await registrarRefundPendiente({
      tipo: "consulta",
      recursoId: consulta.id,
      medicoId: consulta.medico_id,
      pagoId: consulta.pago_id,
      netoMedico: consulta.mp_net_amount_medico ?? 0,
      applicationFee: consulta.mp_application_fee ?? 0,
      estado: "pendiente",
      error: "reservado antes de llamar a MP (plazo 30 min)",
    });

    reintegro = await ejecutarRefund(
      consulta.id,
      consulta.medico_id,
      consulta.pago_id,
      consulta.mp_net_amount_medico ?? 0,
      consulta.mp_application_fee ?? 0,
      "consulta"
    );

    // Salió bien: se saca la reserva de la cola para que el cron de reintentos
    // no la levante. Si NO salió bien, la fila queda —con el estado real que le
    // haya puesto `ejecutarRefund`— y el reintento diario se encarga.
    if (reintegro === "reembolsado") {
      const { error: errCola } = await admin
        .from("refunds_pendientes")
        .update({ estado: "resuelto", resuelto_at: new Date().toISOString(), ultimo_error: null })
        .eq("tipo", "consulta")
        .eq("recurso_id", consulta.id);
      if (errCola) {
        logError("[plazo-ci]", "Reintegro OK pero la reserva quedó en la cola", {
          consultaId: consulta.id,
          error: errCola.message,
        });
      }
    }

    const { error: errReintegro } = await admin
      .from("consultas")
      .update({ reintegro_estado: reintegro })
      .eq("id", consulta.id);

    // Que no se pueda anotar el reintegro NO revierte nada: la plata ya salió.
    // Se grita fuerte para que quede en los logs y se pueda reconciliar.
    if (errReintegro) {
      logError("[plazo-ci]", "Reintegro ejecutado pero NO anotado en la consulta", {
        consultaId: consulta.id,
        reintegro,
        error: errReintegro.message,
      });
    }
  } else {
    // Sin `pago_id` no hay nada que devolver. Pasa con las cuentas de test, que
    // simulan el pago sin registrar uno real.
    logInfo("[plazo-ci]", "Sin pago registrado: no hay reintegro que ejecutar", {
      consultaId: consulta.id,
    });
  }

  const filaPac = await filaPaciente(consulta.paciente_id);
  if (filaPac) {
    await pushAlPaciente(filaPac, {
      title: "Te devolvemos el 100%",
      body: "El profesional no pudo tomar tu consulta. Ya iniciamos la devolución total y podés elegir otro.",
      url: "/clinica",
      tag: `ausente-${consulta.id}`,
    }).catch(() => {});
  }

  logInfo("[plazo-ci]", "Consulta cerrada por ausencia del profesional", {
    consultaId: consulta.id,
    reintegro,
  });
  return { resuelta: true, desenlace: "medico_ausente", reintegro };
}
