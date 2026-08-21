// Plazo de la solicitud que nadie acepta: 10 minutos (Diego, 21/08/2026 — bajado
// de los 15 originales del 20/08 al revisar un caso real: "el paciente no espera
// toda la madrugada, se avisó una vez a los 10 minutos y listo").
//
// EL AGUJERO QUE TAPA ESTO
//
// La CI ya tenía un plazo (`resolver-vencidas.ts`, 30 min) pero cuenta DESDE EL
// PAGO y su cron filtra `mp_status='approved'`. Como el paciente no puede pagar
// hasta que el profesional acepte, la solicitud que NADIE acepta quedaba fuera
// del único reloj que había. `cerrar-huerfanas` tampoco la toca: solo mira
// `en_curso`. O sea que no la cerraba nadie: se quedaba viva hasta que el propio
// paciente la cancelaba.
//
// El efecto sobre el paciente: un spinner indefinido, sin que el producto le
// dijera nunca "no hay nadie disponible, probá con otro". El que se cansa y se
// va no vuelve — y desde afuera parecía una cancelación cualquiera.
//
// EFECTO SECUNDARIO BUSCADO: al cerrar la entrada de sala se corta también el
// recordatorio del cron `repush-esperando`, que reinsiste cada 30 min mientras
// la entrada siga abierta. Antes, una solicitud que quedaba viva toda la noche
// podía golpear el teléfono del profesional hasta la mañana siguiente.
//
// EL RELOJ NO CORRE SI EL PROFESIONAL ESTÁ ATENDIENDO A OTRO — mismo criterio
// que el plazo de 30 min y que el cron de turnos. Alguien adentro de otra
// consulta no está ignorando la solicitud: está trabajando.
//
// NO HAY PLATA EN JUEGO: por definición nunca se pagó (no se puede pagar sin
// aceptación previa), así que no hay reembolso que hacer. El UPDATE igual se
// blinda contra pagos en vuelo, porque la pantalla del paciente permite pagar
// apenas el profesional acepta y no queremos cerrarle una consulta a alguien
// cuyo pago está acreditándose.

import { createAdminClient } from "@/lib/supabase/admin";
import { cerrarEntradaSala } from "@/lib/sala-espera";
import { pushAlMedico, pushAlPaciente } from "@/lib/push";
import { logError, logInfo } from "@/lib/logger";
import { MOTIVO } from "@/lib/consultas/clasificar";
import { medicosOcupados } from "@/lib/consultas/resolver-vencidas";

/** Minutos que esperamos a que un profesional acepte antes de liberar al paciente. */
export const PLAZO_SIN_ACEPTAR_MIN = 10;

/**
 * Aviso al paciente. Solo llega si tiene push habilitado; el respaldo real es la
 * pantalla, que hace polling cada 5s y al ver `cancelada` muestra "Esta consulta
 * no pudo concretarse" con el botón para buscar otro profesional.
 */
const AVISO_TITULO = "No encontramos quien te atienda";
const AVISO_CUERPO =
  `Nadie tomó tu consulta en ${PLAZO_SIN_ACEPTAR_MIN} minutos. No se te cobró nada — mirá qué otros profesionales están disponibles.`;

export type ResultadoSinRespuesta = {
  liberadas: number;
  omitidasPorProfesionalOcupado: number;
  carrerasPerdidas: number;
  /** Profesionales a los que se les apagó la Consulta Inmediata al no responder. */
  desactivados: number;
};

type SolicitudColgada = {
  id: string;
  medico_id: string;
  paciente_id: string;
  created_at: string;
};

/**
 * `consultas.paciente_id` es `auth.users.id`, pero `pushAlPaciente` espera
 * `pacientes.id`. Confundirlos manda el aviso a la nada — o a otra persona.
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

export async function resolverSolicitudesSinRespuesta(): Promise<ResultadoSinRespuesta> {
  const admin = createAdminClient();
  const corte = new Date(Date.now() - PLAZO_SIN_ACEPTAR_MIN * 60_000).toISOString();

  // `esperando` = pedida y todavía sin aceptar. Si el profesional aceptó, el
  // estado ya cambió y esta consulta no es asunto de este módulo: el plazo de
  // los 30 minutos post-pago se encarga.
  const { data: colgadas, error } = await admin
    .from("consultas")
    .select("id, medico_id, paciente_id, created_at")
    .eq("estado", "esperando")
    .is("aceptada_at", null)
    .is("sala_video_url", null)
    .is("pago_id", null)
    .lt("created_at", corte)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    logError("[sin-respuesta]", "No se pudieron leer las solicitudes colgadas", {
      error: error.message,
    });
    return { liberadas: 0, omitidasPorProfesionalOcupado: 0, carrerasPerdidas: 0, desactivados: 0 };
  }

  const solicitudes = (colgadas ?? []) as SolicitudColgada[];
  if (solicitudes.length === 0) {
    return { liberadas: 0, omitidasPorProfesionalOcupado: 0, carrerasPerdidas: 0, desactivados: 0 };
  }

  const ocupados = await medicosOcupados([
    ...new Set(solicitudes.map((s) => s.medico_id).filter(Boolean)),
  ]);

  let liberadas = 0;
  let omitidasPorProfesionalOcupado = 0;
  let carrerasPerdidas = 0;
  let desactivados = 0;

  for (const s of solicitudes) {
    if (ocupados.has(s.medico_id)) {
      omitidasPorProfesionalOcupado++;
      continue;
    }

    // UPDATE condicionado: si en el medio el profesional la aceptó o apareció un
    // pago, no la tocamos. `mp_status` es NULL en las impagas, y en PostgREST
    // `neq` excluye los NULL — por eso el filtro es explícito.
    const { data: cerrada, error: errUpd } = await admin
      .from("consultas")
      .update({
        estado: "cancelada",
        resuelta_por: "sistema",
        resuelta_at: new Date().toISOString(),
        resolucion_motivo: MOTIVO.SIN_RESPUESTA,
      })
      .eq("id", s.id)
      .eq("estado", "esperando")
      .is("aceptada_at", null)
      .or("mp_status.is.null,mp_status.neq.approved")
      .select("id")
      .maybeSingle();

    if (errUpd) {
      logError("[sin-respuesta]", "No se pudo liberar la solicitud", {
        consultaId: s.id,
        error: errUpd.message,
      });
      continue;
    }
    if (!cerrada) {
      // La aceptaron o se pagó entre el SELECT y el UPDATE. Perfecto: sigue viva.
      carrerasPerdidas++;
      continue;
    }

    liberadas++;

    // Cerrar la entrada de sala corta el recordatorio de `repush-esperando`: sin
    // esto el profesional seguiría recibiendo avisos de un paciente que ya no
    // está esperando.
    void cerrarEntradaSala({ consultaId: s.id, motivo: "cancelado_paciente" }).catch(() => {});

    // Best-effort a propósito: que falle el aviso no puede impedir liberar al
    // paciente. La pantalla es el respaldo — hace polling cada 5s.
    void (async () => {
      const pacienteId = await filaPaciente(s.paciente_id);
      if (!pacienteId) return;
      await pushAlPaciente(pacienteId, {
        title: AVISO_TITULO,
        body: AVISO_CUERPO,
        url: "/clinica",
        tag: `sin-respuesta-${s.id}`,
      });
    })().catch(() => {});

    // Y se le apaga la Consulta Inmediata al profesional (Diego, 21/08/2026).
    // Todo el que llega hasta acá pasó el filtro de `ocupados`: no estaba
    // atendiendo a nadie más, simplemente no respondió. Si queda publicado, el
    // próximo paciente lo elige y repite la espera — y muchas veces es el único
    // de su provincia, así que la espera repetida no tiene alternativa.
    //
    // A diferencia de los avisos de arriba, esto SÍ se espera: si fallara en
    // silencio, el profesional seguiría figurando disponible sin estarlo, que es
    // el problema que se está arreglando.
    if (await apagarConsultaInmediata(s.medico_id)) desactivados++;
  }

  if (liberadas > 0 || carrerasPerdidas > 0) {
    logInfo("[sin-respuesta]", "Solicitudes sin aceptar liberadas", {
      liberadas,
      omitidasPorProfesionalOcupado,
      carrerasPerdidas,
      desactivados,
    });
  }

  return { liberadas, omitidasPorProfesionalOcupado, carrerasPerdidas, desactivados };
}

/**
 * Apaga la disponibilidad de Consulta Inmediata y le explica al profesional qué
 * pasó. Mismo procedimiento que el auto-apagado por tiempo: limpiar el flag y su
 * ancla, registrar la transición en `disponibilidad_log` (así el historial no
 * miente sobre cuánto estuvo publicado) y avisar por mensaje interno —
 * persistente, lo ve aunque no tenga push— más push best-effort.
 *
 * Devuelve false si ya estaba apagado: el UPDATE va condicionado a
 * `disponible = true`, así que dos corridas solapadas no duplican el mensaje.
 */
async function apagarConsultaInmediata(medicoId: string): Promise<boolean> {
  if (!medicoId) return false;
  const admin = createAdminClient();

  const { data: apagado, error } = await admin
    .from("medicos")
    .update({ disponible: false, disponible_desde_at: null })
    .eq("id", medicoId)
    .eq("disponible", true)
    .select("id, nombre_completo");

  if (error) {
    logError("[sin-respuesta]", "No se pudo apagar la CI del profesional", {
      medicoId,
      error: error.message,
    });
    return false;
  }
  if (!apagado || apagado.length === 0) return false;

  await admin.from("disponibilidad_log").insert({ medico_id: medicoId, online: false });

  const primerNombre = (apagado[0].nombre_completo ?? "").split(" ")[0] || "Doctor/a";
  await admin.from("mensajes_internos_medicos").insert({
    medico_id: medicoId,
    titulo: "Liberamos a un paciente que te estaba esperando",
    cuerpo: `Hola ${primerNombre}. Un paciente pidió una consulta inmediata y, al no recibir respuesta en ${PLAZO_SIN_ACEPTAR_MIN} minutos, lo liberamos para que pueda elegir otro profesional. También te desactivamos de Consulta Inmediata: mientras figurás disponible te siguen eligiendo, y no queremos que a otro paciente le pase lo mismo. Cuando estés frente a la pantalla, activate de nuevo desde tu panel.`,
    severidad: "media",
  });

  void pushAlMedico(medicoId, {
    title: "Docto — te desactivamos de Consulta Inmediata",
    body: `Un paciente te esperó ${PLAZO_SIN_ACEPTAR_MIN} min y lo liberamos. Reactivate cuando estés frente a la pantalla.`,
    url: "/dashboard",
    tag: `sin-respuesta-apagado-${medicoId}`,
  }).catch(() => {});

  return true;
}
