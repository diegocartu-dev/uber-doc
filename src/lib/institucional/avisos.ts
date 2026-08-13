// src/lib/institucional/avisos.ts
// Avisos de asignación (spec institucional §8): WhatsApp con plantillas por
// SID desde el CONFIG (migración 009 — los SIDs son por instancia, marca
// blanca) con FALLBACK A MAIL mientras Meta no apruebe las plantillas o el
// canal esté apagado. SOLO instancia institucional.
//
// Política anti fallas silenciosas: fire-and-forget CON REGISTRO — el
// resultado de cada envío queda en asignaciones.detalle (quién, por qué
// canal, si salió) Y viaja en la respuesta de la API (el éxito de la pantalla
// del otorgador lo muestra textual: "Le enviamos el acceso por WhatsApp
// al …"). Un aviso que falla NUNCA voltea la asignación ya hecha.
//
// Gates del canal WhatsApp (en orden): flag `whatsapp_institucional` de
// feature_flags + credenciales Twilio + plantilla en config + celular del
// destinatario. Cualquiera que falte → fallback a mail; sin mail → aviso
// no enviado (ok:false), visible en la pantalla y en la auditoría.
//
// Avisos de REPROGRAMACIÓN: `avisarReprogramacionTurno` (Etapa 3, T18) — usa
// las plantillas `reprogramacion` y `reprogramacion_medico` del config.

import { createAdminClient } from "@/lib/supabase/admin";
import { getFlag } from "@/lib/feature-flags";
import { getConfigInstitucion, dominioLimpio } from "@/lib/institucional/config";
import { enviarTwilio, twilioConfigurado, normalizarTelefonoAR } from "@/lib/whatsapp";
import { crearAccesoLink } from "@/lib/institucional/accesos";
import {
  mailTurnoAsignadoPaciente,
  mailCIAsignadaPaciente,
  mailTurnoAsignadoMedico,
  mailCIAsignadaMedico,
  mailTurnoReprogramadoPaciente,
  mailTurnoReprogramadoMedicoRecibe,
  mailTurnoReprogramadoMedicoLibera,
} from "@/lib/institucional/emails";

export interface ResultadoAviso {
  canal: "whatsapp" | "mail";
  destino: string;
  ok: boolean;
}

export interface AvisosAsignacion {
  paciente: ResultadoAviso | null; // null = sin canal posible
  medico: ResultadoAviso | null;
  /**
   * URL del acceso-link del paciente (token PELADO adentro). Se emite SIEMPRE
   * que la asignación se concreta, aunque no haya canal automático (hallazgo
   * revisión Etapa 2: sin esto, "sin canal" dejaba la asignación hecha SIN
   * token — nada que dictarle al paciente por teléfono). Viaja SOLO en la
   * respuesta de la API para el operador; JAMÁS se persiste (en DB va el
   * sha256 — `registrarAvisosEnAsignacion` lo excluye a propósito).
   */
  acceso_url: string | null;
}

/**
 * Un aviso al paciente SIN enlace no se manda.
 *
 * El código hacía `acceso?.url ?? base`: si la emisión del token fallaba, el
 * mensaje salía igual con el dominio pelado adentro. Para un paciente de alta
 * provisionada, la raíz del sitio es un login sin contraseña — un callejón. Y
 * como el proveedor entregaba el mensaje, el resultado quedaba en `ok: true` y
 * la auditoría decía "avisado OK": el fallo era invisible por los dos lados.
 *
 * Ahora no sale nada y se reporta `ok: false`, que es lo que la Etapa 2 ya
 * había aprendido con el caso del paciente sin canal: el otorgador tiene que
 * VER que ese aviso no salió, en la pantalla y en la auditoría.
 */
function avisoSinEnlace(
  canal: "whatsapp" | "mail",
  destino: string,
  contexto: string
): ResultadoAviso {
  console.error(`[avisos] ${contexto}: no se emitió el acceso-link, no se manda nada al paciente.`);
  return { canal, destino, ok: false };
}

const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** "martes 20/10" — el formato de las plantillas aprobadas. */
export function fechaLabelAR(fecha: string): string {
  const d = new Date(fecha + "T12:00:00");
  return `${DIAS_LARGOS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

const primerNombre = (n: string | null | undefined): string =>
  (n ?? "").trim().split(/\s+/)[0] || "";

async function whatsappHabilitado(): Promise<boolean> {
  try {
    return (await getFlag("whatsapp_institucional")) && twilioConfigurado();
  } catch {
    return false;
  }
}

async function celularMedico(medicoId: string): Promise<{ celular: string | null; email: string | null; nombre: string }> {
  // celular_personal / email_personal: columnas SIN grant — SIEMPRE service role.
  const admin = createAdminClient();
  const { data } = await admin
    .from("medicos")
    .select("nombre_completo, celular_personal, email_personal")
    .eq("id", medicoId)
    .maybeSingle();
  return {
    celular: normalizarTelefonoAR(data?.celular_personal),
    email: data?.email_personal ?? null,
    nombre: data?.nombre_completo ?? "",
  };
}

interface DatosComunes {
  paciente: { id: string; nombre: string; celular: string | null; email: string | null };
  medico: { id: string; nombre: string; especialidad: string };
  operadorId: string;
}

/**
 * Avisos de un TURNO asignado: paciente (plantilla `turno_asignado` /
 * mail) + profesional (`turno_acordado_asignado` / mail). Nunca lanza.
 */
export async function avisarAsignacionTurno(
  params: DatosComunes & { turno: { id: string; fecha: string; hora_inicio: string } }
): Promise<AvisosAsignacion> {
  const resultado: AvisosAsignacion = { paciente: null, medico: null, acceso_url: null };
  try {
    const config = await getConfigInstitucion();
    const waOn = await whatsappHabilitado();
    const fechaLabel = fechaLabelAR(params.turno.fecha);
    const hora = params.turno.hora_inicio.slice(0, 5);
    const base = `https://${dominioLimpio(config.dominio)}`;

    // ── Paciente: link-sesión + WhatsApp → mail ──
    const celPaciente = normalizarTelefonoAR(params.paciente.celular);
    const canalPaciente: "whatsapp" | "mail" | null =
      waOn && celPaciente ? "whatsapp" : params.paciente.email ? "mail" : null;

    // El acceso se emite SIEMPRE (con o sin canal automático — ver el comentario
    // de AvisosAsignacion): la asignación ya ocurrió y el token es del paciente.
    const hora8 =
      params.turno.hora_inicio.length === 5
        ? `${params.turno.hora_inicio}:00`
        : params.turno.hora_inicio.slice(0, 8);
    const acceso = await crearAccesoLink({
      pacienteId: params.paciente.id,
      turnoId: params.turno.id,
      // Etapa 3: el link aterriza en LA pantalla del paciente institucional
      // (los seis estados del mock), no en la sala de espera del B2C — esa
      // tiene barra de navegación y "Inicio", que acá no van.
      destino: `/turno/${params.turno.id}/acceso`,
      operadorId: params.operadorId,
      canal: canalPaciente,
      enviadoA:
        canalPaciente === "whatsapp"
          ? (celPaciente as string)
          : canalPaciente === "mail"
            ? (params.paciente.email as string)
            : null,
      encuentroMs: new Date(`${params.turno.fecha}T${hora8}-03:00`).getTime(),
    });
    const link = acceso?.url ?? null;
    resultado.acceso_url = link;
    const destinoPaciente =
      canalPaciente === "whatsapp"
        ? (celPaciente as string)
        : canalPaciente === "mail"
          ? (params.paciente.email as string)
          : null;

    if (canalPaciente) {
      if (!link) {
        resultado.paciente = avisoSinEnlace(canalPaciente, destinoPaciente as string, "Turno asignado");
      } else if (canalPaciente === "whatsapp") {
        const sid = config.wa_plantillas?.turno_asignado;
        const ok = sid
          ? await enviarTwilio(celPaciente as string, sid, {
              "1": config.nombre,
              "2": primerNombre(params.paciente.nombre),
              "3": fechaLabel,
              "4": hora,
              "5": params.medico.nombre,
              "6": params.medico.especialidad,
              "7": link,
              "8": config.telefono_ayuda ?? "a tu centro de salud",
            })
          : false;
        resultado.paciente = { canal: "whatsapp", destino: celPaciente as string, ok };
        // WhatsApp falló y hay mail → fallback.
        if (!ok && params.paciente.email) {
          const okMail = await mailTurnoAsignadoPaciente({
            to: params.paciente.email,
            nombrePaciente: primerNombre(params.paciente.nombre),
            fechaLabel,
            hora,
            medicoNombre: params.medico.nombre,
            especialidad: params.medico.especialidad,
            link,
          });
          resultado.paciente = { canal: "mail", destino: params.paciente.email, ok: okMail };
        }
      } else {
        const ok = await mailTurnoAsignadoPaciente({
          to: params.paciente.email as string,
          nombrePaciente: primerNombre(params.paciente.nombre),
          fechaLabel,
          hora,
          medicoNombre: params.medico.nombre,
          especialidad: params.medico.especialidad,
          link,
        });
        resultado.paciente = { canal: "mail", destino: params.paciente.email as string, ok };
      }
    }

    // ── Profesional: aviso constitutivo del motor acordado (spec §8.2) ──
    const medico = await celularMedico(params.medico.id);
    const linkAgenda = `${base}/medico/agenda`;
    if (waOn && medico.celular) {
      const sid = config.wa_plantillas?.turno_acordado_asignado;
      const ok = sid
        ? await enviarTwilio(medico.celular, sid, {
            "1": primerNombre(medico.nombre),
            "2": config.nombre,
            "3": fechaLabel,
            "4": hora,
            "5": linkAgenda,
          })
        : false;
      resultado.medico = { canal: "whatsapp", destino: medico.celular, ok };
      if (!ok && medico.email) {
        const okMail = await mailTurnoAsignadoMedico({
          to: medico.email,
          nombreMedico: primerNombre(medico.nombre),
          fechaLabel,
          hora,
          linkAgenda,
        });
        resultado.medico = { canal: "mail", destino: medico.email, ok: okMail };
      }
    } else if (medico.email) {
      const ok = await mailTurnoAsignadoMedico({
        to: medico.email,
        nombreMedico: primerNombre(medico.nombre),
        fechaLabel,
        hora,
        linkAgenda,
      });
      resultado.medico = { canal: "mail", destino: medico.email, ok };
    }
  } catch (err) {
    console.error("[avisos] avisarAsignacionTurno falló:", err);
  }
  return resultado;
}

/**
 * Avisos de una CI asignada: paciente (`ci_asignada` / mail — "Podés entrar
 * ahora") + profesional (`ci_asignada_medico` / mail). Nunca lanza.
 */
export async function avisarAsignacionCI(
  params: DatosComunes & { consultaId: string }
): Promise<AvisosAsignacion> {
  const resultado: AvisosAsignacion = { paciente: null, medico: null, acceso_url: null };
  try {
    const config = await getConfigInstitucion();
    const waOn = await whatsappHabilitado();
    const base = `https://${dominioLimpio(config.dominio)}`;

    const celPaciente = normalizarTelefonoAR(params.paciente.celular);
    const canalPaciente: "whatsapp" | "mail" | null =
      waOn && celPaciente ? "whatsapp" : params.paciente.email ? "mail" : null;

    // El acceso se emite SIEMPRE (con o sin canal automático — ver el comentario
    // de AvisosAsignacion): la asignación ya ocurrió y el token es del paciente.
    const acceso = await crearAccesoLink({
      pacienteId: params.paciente.id,
      consultaId: params.consultaId,
      // La pantalla institucional de la CI, no el clon del B2C: ese tiene la
      // marca de Docto, copy de pagos que acá no existen y links que el propio
      // modo bloquea con 404 (pendiente §11.19, cerrado en la Etapa 4).
      destino: `/consulta/${params.consultaId}/acceso`,
      operadorId: params.operadorId,
      canal: canalPaciente,
      enviadoA:
        canalPaciente === "whatsapp"
          ? (celPaciente as string)
          : canalPaciente === "mail"
            ? (params.paciente.email as string)
            : null,
    });
    const link = acceso?.url ?? null;
    resultado.acceso_url = link;
    const destinoPaciente =
      canalPaciente === "whatsapp"
        ? (celPaciente as string)
        : canalPaciente === "mail"
          ? (params.paciente.email as string)
          : null;

    if (canalPaciente) {
      if (!link) {
        resultado.paciente = avisoSinEnlace(canalPaciente, destinoPaciente as string, "CI asignada");
      } else if (canalPaciente === "whatsapp") {
        const sid = config.wa_plantillas?.ci_asignada;
        const ok = sid
          ? await enviarTwilio(celPaciente as string, sid, {
              "1": config.nombre,
              "2": primerNombre(params.paciente.nombre),
              "3": params.medico.nombre,
              "4": params.medico.especialidad,
              "5": link,
              "6": config.telefono_ayuda ?? "a tu centro de salud",
            })
          : false;
        resultado.paciente = { canal: "whatsapp", destino: celPaciente as string, ok };
        if (!ok && params.paciente.email) {
          const okMail = await mailCIAsignadaPaciente({
            to: params.paciente.email,
            nombrePaciente: primerNombre(params.paciente.nombre),
            medicoNombre: params.medico.nombre,
            especialidad: params.medico.especialidad,
            link,
          });
          resultado.paciente = { canal: "mail", destino: params.paciente.email, ok: okMail };
        }
      } else {
        const ok = await mailCIAsignadaPaciente({
          to: params.paciente.email as string,
          nombrePaciente: primerNombre(params.paciente.nombre),
          medicoNombre: params.medico.nombre,
          especialidad: params.medico.especialidad,
          link,
        });
        resultado.paciente = { canal: "mail", destino: params.paciente.email as string, ok };
      }
    }

    const medico = await celularMedico(params.medico.id);
    const linkConsulta = `${base}/dashboard`;
    if (waOn && medico.celular) {
      const sid = config.wa_plantillas?.ci_asignada_medico;
      const ok = sid
        ? await enviarTwilio(medico.celular, sid, {
            "1": primerNombre(medico.nombre),
            "2": config.nombre,
            "3": linkConsulta,
          })
        : false;
      resultado.medico = { canal: "whatsapp", destino: medico.celular, ok };
      if (!ok && medico.email) {
        const okMail = await mailCIAsignadaMedico({
          to: medico.email,
          nombreMedico: primerNombre(medico.nombre),
          linkConsulta,
        });
        resultado.medico = { canal: "mail", destino: medico.email, ok: okMail };
      }
    } else if (medico.email) {
      const ok = await mailCIAsignadaMedico({
        to: medico.email,
        nombreMedico: primerNombre(medico.nombre),
        linkConsulta,
      });
      resultado.medico = { canal: "mail", destino: medico.email, ok };
    }
  } catch (err) {
    console.error("[avisos] avisarAsignacionCI falló:", err);
  }
  return resultado;
}

/**
 * Registro del resultado en asignaciones.detalle (merge, no pisada) — la
 * mitad "CON registro" del fire-and-forget. Nunca lanza.
 */
export async function registrarAvisosEnAsignacion(
  asignacionId: string | null,
  avisos: AvisosAsignacion
): Promise<void> {
  if (!asignacionId) return;
  try {
    // El token pelado JAMÁS se persiste (en accesos_link ya está su sha256):
    // acceso_url viaja solo en la respuesta de la API — acá se excluye.
    const { acceso_url: _soloRespuesta, ...avisosSinToken } = avisos;
    void _soloRespuesta;
    const admin = createAdminClient();
    const { data } = await admin
      .from("asignaciones")
      .select("detalle")
      .eq("id", asignacionId)
      .maybeSingle();
    const detalle = { ...((data?.detalle as Record<string, unknown>) ?? {}), avisos: avisosSinToken };
    const { error } = await admin.from("asignaciones").update({ detalle }).eq("id", asignacionId);
    if (error) console.error("[avisos] No se pudo registrar el resultado:", error.message);
  } catch (err) {
    console.error("[avisos] registrarAvisosEnAsignacion falló:", err);
  }
}

/**
 * Avisos de una REPROGRAMACIÓN (spec §4.6 + §8): al paciente con el turno
 * nuevo y un LINK NUEVO, y a los dos profesionales — el que recibe el turno y
 * el que lo pierde.
 *
 * El link nuevo se acuña acá adentro (`crearAccesoLink` sobre el turno nuevo).
 * La revocación del viejo NO es trabajo de este módulo: la hace quien
 * reprograma, ANTES de avisar, para que no exista ni un segundo en el que los
 * dos links funcionen a la vez.
 *
 * Nunca lanza: un aviso que falla no revierte una reprogramación ya hecha.
 */
/**
 * UN aviso al profesional que RECIBE turnos, con el total real adentro.
 *
 * ── POR QUÉ EXISTE COMO FUNCIÓN APARTE ───────────────────────────────────────
 * La plantilla aprobada por Meta está redactada en plural ("Se agregaron N
 * turnos") justamente para esto. Antes el "1" iba hardcodeado, con un comentario
 * que decía "acá N siempre es 1 porque este camino reprograma de a uno; el motor
 * masivo va a agrupar por profesional". El motor masivo llegó y no agrupaba: la
 * pantalla dispara un POST por ítem, así que la profesional que recibe tres
 * pacientes recibía TRES WhatsApps diciendo "se agregó 1 turno".
 *
 * Nunca lanza: devuelve `null` si no hay canal posible.
 */
export async function avisarReprogramacionAgrupadaMedico(params: {
  medicoId: string;
  turnos: { fecha: string; hora_inicio: string }[];
}): Promise<ResultadoAviso | null> {
  if (params.turnos.length === 0) return null;
  try {
    const config = await getConfigInstitucion();
    const waOn = await whatsappHabilitado();
    const base = `https://${dominioLimpio(config.dominio)}`;
    const linkAgenda = `${base}/medico/agenda`;
    const medico = await celularMedico(params.medicoId);
    // Orden cronológico: la plantilla solo tiene lugar para UNA fecha y hora, y
    // la que corresponde mostrar es la del primer turno que le llega.
    const ordenados = [...params.turnos].sort((a, b) =>
      a.fecha === b.fecha
        ? (a.hora_inicio ?? "").localeCompare(b.hora_inicio ?? "")
        : a.fecha.localeCompare(b.fecha)
    );
    const paraMail = ordenados.map((t) => ({
      fechaLabel: fechaLabelAR(t.fecha),
      hora: (t.hora_inicio ?? "").slice(0, 5),
    }));

    if (waOn && medico.celular) {
      const sid = config.wa_plantillas?.reprogramacion_medico;
      const ok = sid
        ? await enviarTwilio(medico.celular, sid, {
            "1": String(ordenados.length),
            "2": paraMail[0].fechaLabel,
            "3": paraMail[0].hora,
            "4": linkAgenda,
          })
        : false;
      if (ok) return { canal: "whatsapp", destino: medico.celular, ok };
      if (medico.email) {
        const okMail = await mailTurnoReprogramadoMedicoRecibe({
          to: medico.email,
          nombreMedico: primerNombre(medico.nombre),
          turnos: paraMail,
          linkAgenda,
        });
        return { canal: "mail", destino: medico.email, ok: okMail };
      }
      return { canal: "whatsapp", destino: medico.celular, ok };
    }
    if (medico.email) {
      const ok = await mailTurnoReprogramadoMedicoRecibe({
        to: medico.email,
        nombreMedico: primerNombre(medico.nombre),
        turnos: paraMail,
        linkAgenda,
      });
      return { canal: "mail", destino: medico.email, ok };
    }
    return null;
  } catch (err) {
    console.error("[avisos] avisarReprogramacionAgrupadaMedico falló:", err);
    return null;
  }
}

export async function avisarReprogramacionTurno(
  params: DatosComunes & {
    turnoNuevo: { id: string; fecha: string; hora_inicio: string };
    turnoAnterior: { fecha: string; hora_inicio: string };
    /** El profesional que pierde el turno (null si es el mismo que lo recibe). */
    medicoAnterior: { id: string; nombre: string } | null;
    /**
     * true = NO avisar acá al profesional que recibe. Lo usa el motor masivo,
     * que junta todos sus turnos y manda UN solo mensaje al final con el total.
     */
    agruparAvisoMedico?: boolean;
  }
): Promise<AvisosAsignacion> {
  const resultado: AvisosAsignacion = { paciente: null, medico: null, acceso_url: null };
  try {
    const config = await getConfigInstitucion();
    const waOn = await whatsappHabilitado();
    const base = `https://${dominioLimpio(config.dominio)}`;
    const fechaLabel = fechaLabelAR(params.turnoNuevo.fecha);
    const hora = params.turnoNuevo.hora_inicio.slice(0, 5);
    const fechaAnterior = fechaLabelAR(params.turnoAnterior.fecha);
    const horaAnterior = params.turnoAnterior.hora_inicio.slice(0, 5);

    const celPaciente = normalizarTelefonoAR(params.paciente.celular);
    const canalPaciente: "whatsapp" | "mail" | null =
      waOn && celPaciente ? "whatsapp" : params.paciente.email ? "mail" : null;

    // Token NUEVO — siempre, haya o no canal por donde mandarlo (misma lección
    // de la Etapa 2: sin esto, un paciente sin canal quedaba reprogramado y sin
    // ninguna llave que el operador pudiera dictarle por teléfono).
    const hora8 =
      params.turnoNuevo.hora_inicio.length === 5
        ? `${params.turnoNuevo.hora_inicio}:00`
        : params.turnoNuevo.hora_inicio.slice(0, 8);
    const acceso = await crearAccesoLink({
      pacienteId: params.paciente.id,
      turnoId: params.turnoNuevo.id,
      destino: `/turno/${params.turnoNuevo.id}/acceso`,
      operadorId: params.operadorId,
      origen: "reprogramacion",
      canal: canalPaciente,
      enviadoA:
        canalPaciente === "whatsapp"
          ? (celPaciente as string)
          : canalPaciente === "mail"
            ? (params.paciente.email as string)
            : null,
      encuentroMs: new Date(`${params.turnoNuevo.fecha}T${hora8}-03:00`).getTime(),
    });
    const link = acceso?.url ?? null;
    resultado.acceso_url = link;
    const destinoPaciente =
      canalPaciente === "whatsapp"
        ? (celPaciente as string)
        : canalPaciente === "mail"
          ? (params.paciente.email as string)
          : null;

    // Ojo con el encadenado: `reprogramarTurnoInstitucional` ya revocó el del
    // turno viejo. Si acá se mandara un mensaje sin token nuevo, el paciente
    // quedaría sin el enlace de antes Y con un aviso que no lleva a ningún lado.
    if (canalPaciente && !link) {
      resultado.paciente = avisoSinEnlace(
        canalPaciente,
        destinoPaciente as string,
        "Turno reprogramado"
      );
    } else if (canalPaciente === "whatsapp" && link) {
      const sid = config.wa_plantillas?.reprogramacion;
      const ok = sid
        ? await enviarTwilio(celPaciente as string, sid, {
            "1": primerNombre(params.paciente.nombre),
            "2": fechaAnterior,
            "3": horaAnterior,
            "4": fechaLabel,
            "5": hora,
            "6": params.medico.nombre,
            "7": params.medico.especialidad,
            "8": link,
            "9": config.telefono_ayuda ?? "a tu centro de salud",
          })
        : false;
      resultado.paciente = { canal: "whatsapp", destino: celPaciente as string, ok };
      if (!ok && params.paciente.email) {
        const okMail = await mailTurnoReprogramadoPaciente({
          to: params.paciente.email,
          nombrePaciente: primerNombre(params.paciente.nombre),
          fechaAnterior,
          horaAnterior,
          fechaLabel,
          hora,
          medicoNombre: params.medico.nombre,
          especialidad: params.medico.especialidad,
          link,
        });
        resultado.paciente = { canal: "mail", destino: params.paciente.email, ok: okMail };
      }
    } else if (canalPaciente === "mail" && link) {
      const ok = await mailTurnoReprogramadoPaciente({
        to: params.paciente.email as string,
        nombrePaciente: primerNombre(params.paciente.nombre),
        fechaAnterior,
        horaAnterior,
        fechaLabel,
        hora,
        medicoNombre: params.medico.nombre,
        especialidad: params.medico.especialidad,
        link,
      });
      resultado.paciente = { canal: "mail", destino: params.paciente.email as string, ok };
    }

    // ── El profesional que RECIBE el turno ──
    // En la masiva NO se avisa acá: el caller pide `agrupado` y manda UN solo
    // mensaje al final con el total real (ver `avisarReprogramacionAgrupadaMedico`).
    if (!params.agruparAvisoMedico) {
      resultado.medico = await avisarReprogramacionAgrupadaMedico({
        medicoId: params.medico.id,
        turnos: [{ fecha: params.turnoNuevo.fecha, hora_inicio: params.turnoNuevo.hora_inicio }],
      });
    }

    // ── El profesional que PIERDE el turno ──
    // Solo por mail: no hay plantilla aprobada por Meta para este caso (las 7
    // de etapa0 no lo cubren) y no se manda texto libre por WhatsApp. Si el
    // caso se vuelve frecuente, se somete una plantilla nueva.
    if (params.medicoAnterior && params.medicoAnterior.id !== params.medico.id) {
      const medicoLibera = await celularMedico(params.medicoAnterior.id);
      if (medicoLibera.email) {
        await mailTurnoReprogramadoMedicoLibera({
          to: medicoLibera.email,
          nombreMedico: primerNombre(medicoLibera.nombre),
          fechaLabel: fechaAnterior,
          hora: horaAnterior,
          linkAgenda: `${base}/medico/agenda`,
        });
      }
    }
  } catch (err) {
    console.error("[avisos] avisarReprogramacionTurno falló:", err);
  }
  return resultado;
}
