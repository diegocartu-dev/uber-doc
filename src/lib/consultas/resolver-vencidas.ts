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
// CÓMO SE DECIDE QUIÉN FALTÓ, y por qué se inclina a favor del paciente
// Si la consulta sigue en `pagada`, el médico PROVABLEMENTE no entró: apenas
// abre el workspace pasa a `en_curso` y deja de ser candidata. Lo que hay que
// distinguir es si el paciente estuvo. La única evidencia dura de que NO estuvo
// es que no exista ni una entrada suya a la sala (`sala_espera_entradas`).
// Ante la duda se resuelve como médico ausente CON reintegro: equivocarse para
// ese lado cuesta plata, equivocarse para el otro le niega el reintegro a
// alguien que esperó media hora. El error caro es el segundo.

import { createAdminClient } from "@/lib/supabase/admin";
import { ejecutarRefund } from "@/lib/cancelaciones";
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
  pago_id: string | null;
  mp_net_amount_medico: number | null;
  mp_application_fee: number | null;
};

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

/** ¿El profesional está adentro de otra atención ahora mismo? */
export async function medicosOcupados(medicoIds: string[]): Promise<Set<string>> {
  if (medicoIds.length === 0) return new Set();
  const admin = createAdminClient();
  const [{ data: cis }, { data: turnos }] = await Promise.all([
    admin.from("consultas").select("medico_id").in("medico_id", medicoIds).eq("estado", "en_curso"),
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
      .eq("estado", "pagada")
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
  // El refund va ANTES del cambio de estado a propósito. Si se hiciera después y
  // el proceso muriera en el medio, la consulta quedaría cerrada y sin plata
  // devuelta — y nadie volvería a mirarla porque ya no sería candidata. Al
  // revés, un refund con el cierre fallado deja la fila candidata otra vez, y
  // `ejecutarRefund` es idempotente contra MP por su clave de idempotencia.
  let reintegro: string | null = null;
  if (consulta.pago_id) {
    reintegro = await ejecutarRefund(
      consulta.id,
      consulta.medico_id,
      consulta.pago_id,
      consulta.mp_net_amount_medico ?? 0,
      consulta.mp_application_fee ?? 0,
      "consulta"
    );
  }

  const { data: cerrada } = await admin
    .from("consultas")
    .update({
      estado: "medico_ausente",
      resolucion_motivo: "medico_ausente",
      reintegro_estado: reintegro,
      resuelta_at: new Date().toISOString(),
      resuelta_por: "plazo_30min",
    })
    .eq("id", consulta.id)
    .eq("estado", "pagada")
    .select("id")
    .maybeSingle();

  if (!cerrada) return { resuelta: false, motivo: "carrera_perdida" };

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
