// La consulta inmediata ACEPTADA y todavía sin pagar (decisiones Diego, 10/09/2026).
//
// ── EL AGUJERO QUE CIERRA ────────────────────────────────────────────────────
// Entre "el profesional aceptó" y "el paciente pagó" no había NADA: ningún plazo
// (resolver-vencidas mira `pagada`/`en_curso`, sin-respuesta mira `esperando`) y
// ningún aviso que llegara a tiempo. El profesional esperaba hasta cansarse y
// cancelaba a mano.
//
// Medido sobre las 12 CI aceptadas desde el 19/08, que es cuando el hito
// `aceptada_at` empezó a escribirse: 6 se pagaron y 6 no. De esas 6, CINCO las
// canceló el profesional. Dos murieron a los 24 y 30 segundos de aceptadas,
// menos que el pago más rápido de la historia.
//
// ── LOS DOS RELOJES ──────────────────────────────────────────────────────────
//
// 1. AVISO al paciente (ESPERA_AVISO_SEG). El WhatsApp NO sale en el instante de
//    la aceptación. Si el paciente está mirando la pantalla, el aviso es ruido —
//    y si está adentro del checkout de Mercado Pago, es peor que ruido: le suena
//    el teléfono mientras carga la tarjeta. Sale solo cuando el paciente NO da
//    señales de estar mirando.
//
// 2. PLAZO (PLAZO_PAGO_MIN). Si no pagó, el sistema cierra la consulta y libera
//    al profesional. Es la contracara del bloqueo de 3 minutos en el botón de
//    cancelar: si le sacamos el botón, le debemos la garantía de que no queda
//    atrapado. Al paciente su pantalla ya le muestra el menú de alternativas
//    cuando la consulta pasa a `cancelada`; no hace falta código extra para eso.
//
// ── POR QUÉ LA SEÑAL MANDA SOBRE EL RELOJ ────────────────────────────────────
// Los seis pagos reales tardaron entre 23 y 137 segundos desde la aceptación
// hasta la acreditación. Un reloj pelado de 90 s le habría mandado el WhatsApp
// al del 22/08 mientras pagaba. Por eso el toque del botón VETA el aviso para
// siempre: ese paciente está en Mercado Pago y no hay que tocarlo.

import { createAdminClient } from "@/lib/supabase/admin";
import { avisarPacienteAceptadaWhatsApp } from "@/lib/whatsapp";
import { cerrarEntradaSala } from "@/lib/sala-espera";
import { registrarEvidenciaCierre } from "@/lib/consultas/evidencia-cierre";
import { MOTIVO } from "@/lib/consultas/clasificar";
import { logError, logInfo } from "@/lib/logger";

/** Minutos que tiene el paciente para pagar una consulta ya aceptada. */
export const PLAZO_PAGO_MIN = 10;

/** Segundos desde la aceptación antes de considerar mandar el aviso. */
export const ESPERA_AVISO_SEG = 90;

/**
 * Cuán reciente tiene que ser el último latido para creer que el paciente sigue
 * mirando. El latido llega como mucho cada 20 s (MS_ENTRE_LATIDOS en la sala),
 * así que 60 s tolera dos perdidos sin dar por ausente a alguien que está ahí.
 */
export const LATIDO_FRESCO_SEG = 60;

export type DecisionAviso =
  /** Mandar el WhatsApp: el paciente no da señales de estar mirando. */
  | "mandar"
  /** Todavía no pasaron ESPERA_AVISO_SEG desde la aceptación. */
  | "temprano"
  /** Está mirando la pantalla ahora: el aviso sería ruido. */
  | "esta_mirando"
  /** Tocó pagar o ya hay pago en curso: NO interrumpir el checkout. */
  | "esta_pagando"
  /** Ya se le mandó para esta consulta. Uno por consulta, nunca dos. */
  | "ya_avisado";

/**
 * Decide si corresponde avisarle al paciente. Pura a propósito: es la regla que
 * Diego fijó y la que hay que poder discutir sin levantar la base.
 */
export function decidirAviso(params: {
  segundosDesdeAceptacion: number;
  /** ¿Tocó "Pagar consulta" o ya hay preferencia/pago en curso? */
  estaPagando: boolean;
  /** Segundos desde el último latido de presencia; null si nunca hubo. */
  segundosDesdeLatido: number | null;
  yaAvisado: boolean;
}): DecisionAviso {
  // El veto más fuerte primero: al que está pagando no se lo toca ni aunque el
  // reloj diga que sí. Es el caso de los 137 segundos.
  if (params.estaPagando) return "esta_pagando";
  if (params.yaAvisado) return "ya_avisado";
  if (params.segundosDesdeAceptacion < ESPERA_AVISO_SEG) return "temprano";
  if (params.segundosDesdeLatido !== null && params.segundosDesdeLatido < LATIDO_FRESCO_SEG) {
    return "esta_mirando";
  }
  return "mandar";
}

/** ¿Venció el plazo para pagar? */
export function vencioPlazo(segundosDesdeAceptacion: number): boolean {
  return segundosDesdeAceptacion >= PLAZO_PAGO_MIN * 60;
}

export type DecisionCierre =
  /** Cerrar la consulta y liberar al profesional. */
  | "cerrar"
  /** Venció, pero el paciente está adentro del checkout: no se le cierra encima. */
  | "esperar_checkout"
  /** Todavía en plazo. */
  | "en_plazo";

/**
 * Qué hacer con una consulta aceptada e impaga. Pura, para poder discutir la
 * regla sin levantar la base.
 *
 * El caso que importa es `esperar_checkout`: `crear-v2` no escribe una sola
 * columna en la consulta, así que mientras el paciente está en Mercado Pago la
 * fila sigue `aceptada` sin `mp_status`. Cerrarla ahí es lo más caro que puede
 * pasar: el pago se acredita después, sobre una consulta ya cancelada.
 * La gracia tiene techo, porque un checkout abandonado no puede dejar la
 * consulta viva para siempre.
 */
export function decidirCierre(params: {
  segundosDesdeAceptacion: number;
  estaPagando: boolean;
}): DecisionCierre {
  if (!vencioPlazo(params.segundosDesdeAceptacion)) return "en_plazo";
  if (params.estaPagando && params.segundosDesdeAceptacion < (PLAZO_PAGO_MIN + 5) * 60) {
    return "esperar_checkout";
  }
  return "cerrar";
}

type Fila = {
  id: string;
  medico_id: string;
  paciente_id: string;
  aceptada_at: string;
};

export type ResultadoAceptadasSinPago = {
  revisadas: number;
  avisadas: number;
  cerradas: number;
  omitidas: Record<string, number>;
  carrerasPerdidas: number;
};

export async function procesarAceptadasSinPago(): Promise<ResultadoAceptadasSinPago> {
  const admin = createAdminClient();
  const vacio: ResultadoAceptadasSinPago = {
    revisadas: 0,
    avisadas: 0,
    cerradas: 0,
    omitidas: {},
    carrerasPerdidas: 0,
  };

  // Solo las aceptadas sin pago acreditado. Ojo con el estado: un pago real de CI
  // salta de `aceptada` a `en_curso` (lo escribe el webhook de MP), así que una
  // consulta que sigue en `aceptada` no tiene un pago aprobado detrás.
  const { data: filas, error } = await admin
    .from("consultas")
    .select("id, medico_id, paciente_id, aceptada_at")
    .eq("estado", "aceptada")
    // "Sin pago ACREDITADO", no "sin pago_id". `handleRejected` y
    // `handleStatusOnly` del webhook escriben `pago_id` SIN tocar el estado: una
    // tarjeta rechazada, o un pago que queda `pending`, dejaban la fila en
    // `aceptada` con pago_id no nulo y fuera de este cron PARA SIEMPRE — sin
    // aviso y sin cierre, mientras la pantalla del profesional le promete que
    // lo liberamos solos. (PostgREST: `neq` excluye los NULL, de ahí el `or`.)
    .or("mp_status.is.null,mp_status.neq.approved")
    .not("aceptada_at", "is", null)
    .order("aceptada_at", { ascending: true })
    .limit(100);

  if (error) {
    logError("[aceptada-sin-pago]", "No se pudieron leer las consultas", { error: error.message });
    return vacio;
  }

  const candidatas = (filas ?? []) as Fila[];
  if (candidatas.length === 0) return vacio;

  const ids = candidatas.map((c) => c.id);
  const ahora = Date.now();

  // ── Señales, en dos consultas y no una por candidata ──────────────────────
  // 1) ¿Tocó pagar? Los eventos del checkout guardan la consulta en la metadata
  //    con dos nombres distintos según quién los emite: el cliente escribe
  //    `consultaId` y el servidor `recursoId`. Se miran los dos.
  const desdeISO = new Date(ahora - (PLAZO_PAGO_MIN + 5) * 60_000).toISOString();
  const { data: eventos } = await admin
    .from("eventos_funnel")
    .select("evento, metadata")
    .in("evento", ["pago_toque", "pago_intento", "pago_creado"])
    .gte("created_at", desdeISO);

  const pagando = new Set<string>();
  for (const e of eventos ?? []) {
    const m = (e.metadata ?? {}) as Record<string, unknown>;
    for (const clave of ["consultaId", "recursoId"]) {
      const v = m[clave];
      if (typeof v === "string" && ids.includes(v)) pagando.add(v);
    }
  }

  // 2) ¿Sigue mirando? El latido lo escribe el poll de la sala SOLO con la
  //    pantalla a la vista.
  const { data: entradas } = await admin
    .from("sala_espera_entradas")
    .select("consulta_id, ultimo_latido_at")
    .in("consulta_id", ids);

  const latido = new Map<string, number>();
  for (const e of entradas ?? []) {
    if (!e.consulta_id || !e.ultimo_latido_at) continue;
    const t = new Date(e.ultimo_latido_at).getTime();
    if (!isNaN(t)) latido.set(e.consulta_id, Math.max(latido.get(e.consulta_id) ?? 0, t));
  }

  // 3) ¿Ya le avisamos? Un aviso por consulta, cualquiera haya sido su resultado:
  //    si no tenía celular o Twilio lo rechazó, insistir no lo arregla.
  const { data: avisos } = await admin
    .from("whatsapp_envios")
    .select("consulta_id")
    .eq("plantilla", "paciente_aceptada")
    .in("consulta_id", ids);
  const yaAvisadas = new Set((avisos ?? []).map((a) => a.consulta_id).filter(Boolean) as string[]);

  const res: ResultadoAceptadasSinPago = { ...vacio, revisadas: candidatas.length, omitidas: {} };
  const cuenta = (k: string) => { res.omitidas[k] = (res.omitidas[k] ?? 0) + 1; };

  for (const c of candidatas) {
    const seg = Math.floor((ahora - new Date(c.aceptada_at).getTime()) / 1000);
    if (!Number.isFinite(seg) || seg < 0) continue;

    // ── Plazo vencido: se cierra y el profesional queda libre ───────────────
    const cierre = decidirCierre({ segundosDesdeAceptacion: seg, estaPagando: pagando.has(c.id) });
    if (cierre === "esperar_checkout") {
      cuenta("cierre_pospuesto_pagando");
      continue;
    }
    if (cierre === "cerrar") {
      // UPDATE condicionado: si entre el SELECT y el UPDATE llegó el pago (el
      // webhook la pasa a `en_curso`), no se toca. `mp_status` es NULL en las
      // impagas y en PostgREST `neq` excluye los NULL: por eso el OR explícito.
      const { data: cerrada, error: errUpd } = await admin
        .from("consultas")
        .update({
          estado: "cancelada",
          resuelta_por: "sistema",
          resuelta_at: new Date().toISOString(),
          resolucion_motivo: MOTIVO.SIN_PAGO_PLAZO,
        })
        .eq("id", c.id)
        .eq("estado", "aceptada")
        .is("pago_id", null)
        .or("mp_status.is.null,mp_status.neq.approved")
        .select("id")
        .maybeSingle();

      if (errUpd) {
        logError("[aceptada-sin-pago]", "No se pudo cerrar", { consultaId: c.id, error: errUpd.message });
        continue;
      }
      if (!cerrada) {
        // Pagó entre medio. Mejor noticia imposible.
        res.carrerasPerdidas++;
        continue;
      }

      res.cerradas++;
      // La evidencia ANTES que nada: es lo único que sobrevive a los registros
      // del servidor, que duran 8 días.
      await registrarEvidenciaCierre(c.id);
      cerrarEntradaSala({ consultaId: c.id, motivo: "sin_pago_plazo" }).catch(() => {});
      continue;
    }

    // ── Todavía en plazo: ¿le avisamos? ────────────────────────────────────
    const ms = latido.get(c.id);
    const decision = decidirAviso({
      segundosDesdeAceptacion: seg,
      estaPagando: pagando.has(c.id),
      segundosDesdeLatido: ms ? Math.floor((ahora - ms) / 1000) : null,
      yaAvisado: yaAvisadas.has(c.id),
    });

    if (decision !== "mandar") {
      cuenta(decision);
      continue;
    }

    const ok = await avisarPacienteAceptadaWhatsApp(c.id, { disparador: "aceptada_sin_pago" }).catch(
      () => false
    );
    if (ok) res.avisadas++;
    else cuenta("envio_fallido");
  }

  logInfo("[aceptada-sin-pago]", "Corrida", { ...res });
  return res;
}
