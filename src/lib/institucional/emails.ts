// src/lib/institucional/emails.ts
// Mails transaccionales de la INSTANCIA INSTITUCIONAL (spec §8.1) — plantillas
// nuevas con la marca de la institución (remitente = config.mail_from).
//
// DESVÍO deliberado respecto de la letra de la spec ("sobre email.ts
// parametrizado"): NO se parametriza src/lib/email.ts. Ese archivo es el canal
// transaccional VIVO del B2C (FROM Docto, wrapHtml Docto, copys con
// reembolsos) y meterle branding condicional multiplicaría el riesgo de
// regresión sobre plata real por cero beneficio: las plantillas
// institucionales son NUEVAS de todos modos (spec §8.1: "No existen:
// enviarEmailTurnoAsignadoPaciente…"). Este módulo usa el mismo transporte
// (Resend) con la marca por config; con el flag apagado nada lo importa.

import { Resend } from "resend";
import { getConfigInstitucion } from "@/lib/institucional/config";

let _resend: Resend | null = null;
function resend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const AZUL = "#378ADD";

function wrapInstitucional(nombreInstitucion: string, titulo: string, contenido: string): string {
  return `
  <div style="margin:0;padding:24px;background:#F8F9FA;font-family:Inter,-apple-system,'Segoe UI',sans-serif">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #E9EBEF;border-radius:12px;overflow:hidden">
      <div style="padding:16px 24px;border-bottom:1px solid #E9EBEF">
        <span style="font-size:15px;font-weight:600;color:#111827">${nombreInstitucion}</span>
      </div>
      <div style="padding:24px">
        <h1 style="margin:0 0 12px;font-size:18px;font-weight:600;color:#111827">${titulo}</h1>
        ${contenido}
      </div>
      <div style="padding:12px 24px;border-top:1px solid #F1F3F4;font-size:11px;color:#9CA3AF">
        Emitido a través de Docto — plataforma de telemedicina.
      </div>
    </div>
  </div>`;
}

function boton(texto: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:${AZUL};color:#fff;border-radius:8px;font-size:14px;font-weight:500;text-decoration:none">${texto}</a>`;
}

const P = (txt: string) => `<p style="margin:0 0 8px;font-size:14px;color:#4B5563;line-height:1.5">${txt}</p>`;

async function enviar(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const config = await getConfigInstitucion();
    const { error } = await resend().emails.send({ from: config.mail_from, to, subject, html });
    if (error) {
      console.error("[emails-inst] Resend error:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[emails-inst] fallo de envío:", err);
    return false;
  }
}

export async function mailTurnoAsignadoPaciente(params: {
  to: string;
  nombrePaciente: string;
  fechaLabel: string; // "martes 20/10"
  hora: string; // "16:30"
  medicoNombre: string;
  especialidad: string;
  link: string;
}): Promise<boolean> {
  const config = await getConfigInstitucion();
  const html = wrapInstitucional(
    config.nombre,
    "Te asignamos un turno médico por videollamada",
    P(`Hola, ${params.nombrePaciente}.`) +
      P(`<b>${params.fechaLabel} — ${params.hora} hs</b><br/><b>${params.medicoNombre} — ${params.especialidad}</b>`) +
      P("Para atenderte ese día, entrá desde tu celular con este botón:") +
      boton("Entrar a tu consulta", params.link) +
      P(config.telefono_ayuda ? `Si no podés asistir, llamanos al ${config.telefono_ayuda}.` : "") +
      P("No necesitás usuario ni contraseña. Cinco minutos antes, buscá un lugar tranquilo con buena señal.")
  );
  return enviar(params.to, `Tu turno médico — ${config.nombre}`, html);
}

export async function mailCIAsignadaPaciente(params: {
  to: string;
  nombrePaciente: string;
  medicoNombre: string;
  especialidad: string;
  link: string;
}): Promise<boolean> {
  const config = await getConfigInstitucion();
  const html = wrapInstitucional(
    config.nombre,
    "Te asignamos una consulta médica por videollamada",
    P(`Hola, ${params.nombrePaciente}.`) +
      P(`<b>${params.medicoNombre} — ${params.especialidad}</b><br/><b>Podés entrar ahora.</b>`) +
      boton("Entrar a tu consulta", params.link) +
      P(config.telefono_ayuda ? `Si no podés atenderte, llamanos al ${config.telefono_ayuda}.` : "") +
      P("No necesitás usuario ni contraseña. Buscá un lugar tranquilo con buena señal.")
  );
  return enviar(params.to, `Tu consulta médica — ${config.nombre}`, html);
}

export async function mailTurnoAsignadoMedico(params: {
  to: string;
  nombreMedico: string;
  fechaLabel: string;
  hora: string;
  linkAgenda: string;
}): Promise<boolean> {
  const config = await getConfigInstitucion();
  const html = wrapInstitucional(
    config.nombre,
    "Te asignaron un turno",
    P(`Hola, ${params.nombreMedico}. ${config.nombre} te asignó un turno por videollamada:`) +
      P(`<b>${params.fechaLabel} — ${params.hora} hs</b>`) +
      boton("Ver tu agenda", params.linkAgenda) +
      P("El turno ya figura como confirmado.")
  );
  return enviar(params.to, `Turno asignado — ${config.nombre}`, html);
}

export async function mailCIAsignadaMedico(params: {
  to: string;
  nombreMedico: string;
  linkConsulta: string;
}): Promise<boolean> {
  const config = await getConfigInstitucion();
  const html = wrapInstitucional(
    config.nombre,
    "Paciente esperando ahora",
    P(`Hola, ${params.nombreMedico}. ${config.nombre} te asignó una consulta inmediata: hay un paciente esperando para atenderse ahora.`) +
      boton("Entrar a atenderlo", params.linkConsulta) +
      P("El enlace te lleva directo a la consulta.")
  );
  return enviar(params.to, `Paciente esperando — ${config.nombre}`, html);
}

export async function mailTurnoReprogramadoPaciente(params: {
  to: string;
  nombrePaciente: string;
  fechaAnterior: string;
  horaAnterior: string;
  fechaLabel: string;
  hora: string;
  medicoNombre: string;
  especialidad: string;
  link: string;
}): Promise<boolean> {
  const config = await getConfigInstitucion();
  const html = wrapInstitucional(
    config.nombre,
    "Reprogramamos tu turno",
    P(`Hola, ${params.nombrePaciente}.`) +
      P(`Tu turno del ${params.fechaAnterior} a las ${params.horaAnterior} fue reprogramado.`) +
      P(
        `<b>Nuevo turno: ${params.fechaLabel} — ${params.hora} hs</b><br/><b>${params.medicoNombre} — ${params.especialidad}</b>`
      ) +
      // El enlace es NUEVO: el anterior ya no sirve. Decirlo evita que el
      // paciente insista con el mensaje viejo y crea que el sistema falla.
      P("Entrá con este enlace — el anterior ya no funciona:") +
      boton("Entrar a tu consulta", params.link) +
      P(
        config.telefono_ayuda
          ? `Si el nuevo horario no te sirve, llamanos al ${config.telefono_ayuda}.`
          : ""
      ) +
      P("No necesitás usuario ni contraseña.")
  );
  return enviar(params.to, `Tu turno cambió de horario — ${config.nombre}`, html);
}

/**
 * El profesional que RECIBE turnos.
 *
 * `turnos` viene en plural porque el motor masivo mueve el día entero de otro
 * profesional y a este le pueden caer tres de una vez. Antes salía un mail por
 * turno diciendo "se agregó un turno": tres mails casi idénticos por algo que
 * pasó una sola vez.
 */
export async function mailTurnoReprogramadoMedicoRecibe(params: {
  to: string;
  nombreMedico: string;
  turnos: { fechaLabel: string; hora: string }[];
  linkAgenda: string;
}): Promise<boolean> {
  const config = await getConfigInstitucion();
  const n = params.turnos.length;
  const titulo = n === 1 ? "Se agregó un turno a tu agenda" : `Se agregaron ${n} turnos a tu agenda`;
  const lista = params.turnos
    .map((t) => P(`<b>${t.fechaLabel} — ${t.hora} hs</b>`))
    .join("");
  const html = wrapInstitucional(
    config.nombre,
    titulo,
    P(
      `Hola, ${params.nombreMedico}. ${config.nombre} reasignó ${n === 1 ? "un turno" : `${n} turnos`} a tu agenda:`
    ) +
      lista +
      boton("Ver tu agenda", params.linkAgenda) +
      P(n === 1 ? "El turno ya figura como confirmado." : "Ya figuran como confirmados.")
  );
  return enviar(
    params.to,
    `${n === 1 ? "Turno reasignado" : `${n} turnos reasignados`} — ${config.nombre}`,
    html
  );
}

export async function mailTurnoReprogramadoMedicoLibera(params: {
  to: string;
  nombreMedico: string;
  fechaLabel: string;
  hora: string;
  linkAgenda: string;
}): Promise<boolean> {
  const config = await getConfigInstitucion();
  const html = wrapInstitucional(
    config.nombre,
    "Un turno salió de tu agenda",
    P(`Hola, ${params.nombreMedico}. ${config.nombre} reprogramó este turno con otro profesional:`) +
      P(`<b>${params.fechaLabel} — ${params.hora} hs</b>`) +
      // Hecho, no reproche: el profesional se entera de lo que pasó con SU
      // agenda sin que se le insinúe que hizo algo mal.
      P("Ya no tenés que atenderlo. Te avisamos para que no lo esperes.") +
      boton("Ver tu agenda", params.linkAgenda)
  );
  return enviar(params.to, `Turno reprogramado — ${config.nombre}`, html);
}
