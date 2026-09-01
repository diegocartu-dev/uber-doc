import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFlag } from "@/lib/feature-flags";
import { formatNombreMedico, articuloMedico } from "@/lib/utils/texto";

async function emailsActivos(): Promise<boolean> {
  try {
    return await getFlag("email_transaccional");
  } catch {
    return true; // si falla el flag check, mejor enviar que perder el email
  }
}

const FROM = "Docto <no-reply@docto.com.ar>";
const BASE_URL = "https://docto.com.ar";

let _resend: Resend | null = null;
function resend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function conRetry<T>(
  fn: () => Promise<T>,
  contexto: string,
  maxReintentos = 2
): Promise<T> {
  for (let intento = 1; intento <= maxReintentos; intento++) {
    try {
      return await fn();
    } catch (err) {
      const status = (err as any)?.statusCode ?? (err as any)?.status;
      if (status && status >= 400 && status < 500 && status !== 429) {
        console.error(`[email] error no-retryable (${status}) para ${contexto}:`, err);
        throw err;
      }
      if (intento < maxReintentos) {
        const delayMs = 500 * intento;
        console.log(`[email] reintento ${intento}/${maxReintentos} para ${contexto} (espera ${delayMs}ms)`);
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        console.error(`[email] FALLO DEFINITIVO para ${contexto} tras ${maxReintentos} intentos:`, err);
        throw err;
      }
    }
  }
  throw new Error("unreachable");
}

/**
 * Nombre del médico con su artículo, para el copy que lo pide
 * ("tu turno con **la Dra. García**").
 *
 * Sin título conocido no inventa ninguno ni pone artículo: devuelve "Ana García",
 * y la frase queda "tu turno con Ana García" — correcta, en vez de un "el"
 * equivocado. Hasta el 09/08/2026 estos mails decían "Dr/a." a mano, y el resto
 * del copy asumía masculino aunque la mayoría de quienes atienden son médicas.
 */
function medicoConArticulo(nombre: string, titulo?: string | null): string {
  const art = articuloMedico(titulo);
  const conTitulo = formatNombreMedico(nombre, titulo);
  return art ? `${art} ${conTitulo}` : conTitulo;
}

/** Para cuando `medicoConArticulo` arranca una oración: "La Dra. García te…". */
function capitalizarInicio(frase: string): string {
  return frase ? frase.charAt(0).toUpperCase() + frase.slice(1) : "";
}

function formatearFecha(fechaStr: string): string {
  const d = new Date(fechaStr + "T12:00:00");
  return d.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function formatearHora(horaStr: string): string {
  return horaStr.slice(0, 5);
}

function fechaHoraToISO(fecha: string, hora: string): string {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const [hh, mm] = hora.split(":").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia, hh + 3, mm, 0)).toISOString();
}

type DatosTurno = {
  id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  pacienteNombre: string;
  pacienteEmail: string;
  medicoNombre: string;
  /** `medicos.titulo` — "Dr." / "Dra.", elegido por el médico en su registro. */
  medicoTitulo: string | null;
  medicoEspecialidad: string;
  medicoSlug: string | null;
};

async function obtenerDatosTurno(turnoId: string): Promise<DatosTurno | null> {
  const supabase = createAdminClient();

  const { data: turno } = await supabase
    .from("turnos")
    .select("id, fecha, hora_inicio, hora_fin, paciente_id, medico_id")
    .eq("id", turnoId)
    .single();

  if (!turno) return null;

  const [{ data: paciente }, { data: medico }] = await Promise.all([
    supabase.from("pacientes").select("nombre_completo, user_id").eq("id", turno.paciente_id).single(),
    // Solo se suma `titulo` a este SELECT. Nada más: una columna sin GRANT tira
    // abajo la query ENTERA en PostgREST y el mail se perdería en silencio.
    supabase.from("medicos").select("nombre_completo, titulo, especialidad, slug").eq("id", turno.medico_id).single(),
  ]);

  if (!paciente || !medico) return null;

  const { data: { user } } = await supabase.auth.admin.getUserById(paciente.user_id);
  if (!user?.email) return null;

  return {
    id: turno.id,
    fecha: turno.fecha,
    hora_inicio: turno.hora_inicio,
    hora_fin: turno.hora_fin,
    pacienteNombre: paciente.nombre_completo,
    pacienteEmail: user.email,
    medicoNombre: medico.nombre_completo,
    medicoTitulo: medico.titulo ?? null,
    medicoEspecialidad: medico.especialidad ?? "",
    medicoSlug: medico.slug ?? null,
  };
}

// ─── ICS Calendar Files ─────────────────────────────────────────────────────

function formatICalDate(iso: string): string {
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "").slice(0, 15) + "Z";
}

function escapeICalText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function generarICS(datos: DatosTurno, method: "REQUEST" | "CANCEL"): string {
  const now = formatICalDate(new Date().toISOString());
  const start = formatICalDate(fechaHoraToISO(datos.fecha, datos.hora_inicio));
  const end = formatICalDate(fechaHoraToISO(datos.fecha, datos.hora_fin));
  const summary = escapeICalText(
    `Consulta con ${formatNombreMedico(datos.medicoNombre, datos.medicoTitulo)} - Docto`
  );
  const url = `${BASE_URL}/turno/${datos.id}/espera`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Docto//Telemedicina//ES",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:turno-${datos.id}@docto.com.ar`,
    `DTSTAMP:${now}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${escapeICalText(method === "CANCEL" ? "Turno cancelado." : `Ingresá a: ${url}`)}`,
    `LOCATION:${escapeICalText(url)}`,
    "ORGANIZER;CN=Docto:MAILTO:no-reply@docto.com.ar",
    `STATUS:${method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    `SEQUENCE:${method === "CANCEL" ? "1" : "0"}`,
  ];

  if (method === "REQUEST") {
    lines.push("BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY", "DESCRIPTION:Consulta en 1 hora", "END:VALARM");
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

// ─── HTML Templates ─────────────────────────────────────────────────────────

const AZUL = "#378ADD";
const NARANJA = "#D85A30";
const GRIS = "#374151";
const GRIS_CLARO = "#f3f4f6";
const BORDE = "#e5e7eb";

function fila(label: string, valor: string): string {
  return `<tr>
    <td style="padding:8px 0;font-size:13px;color:#6b7280;width:120px;vertical-align:top;">${label}</td>
    <td style="padding:8px 0;font-size:13px;color:${GRIS};font-weight:500;">${valor}</td>
  </tr>`;
}

function boton(texto: string, href: string, color: string): string {
  return `<a href="${href}" style="display:inline-block;margin-top:24px;padding:14px 28px;background:${color};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;">${texto}</a>`;
}

function chip(texto: string, color: string): string {
  return `<span style="display:inline-block;padding:4px 12px;background:${color}1a;color:${color};border:1px solid ${color}40;border-radius:20px;font-size:12px;font-weight:600;">${texto}</span>`;
}

function wrapHtml(titulo: string, contenido: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>${titulo}</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;border:1px solid ${BORDE};overflow:hidden;">
  <tr><td style="background:${AZUL};padding:24px 32px;">
    <p style="margin:0;font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px;">Docto</p>
    <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">Consultas m&eacute;dicas online</p>
  </td></tr>
  <tr><td style="padding:32px;">${contenido}</td></tr>
  <tr><td style="padding:20px 32px;background:${GRIS_CLARO};border-top:1px solid ${BORDE};">
    <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
      Este email fue enviado por Docto &middot; <a href="${BASE_URL}" style="color:#9ca3af;">docto.com.ar</a><br/>
      <a href="${BASE_URL}/notificaciones" style="color:#9ca3af;">Cancelar suscripci&oacute;n</a>
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function detalleTurno(datos: DatosTurno): string {
  return `<table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid ${BORDE};border-radius:10px;overflow:hidden;">
    <tr><td style="padding:16px 20px;background:${GRIS_CLARO};border-bottom:1px solid ${BORDE};">
      <p style="margin:0;font-size:11px;font-weight:700;color:#9ca3af;letter-spacing:0.8px;text-transform:uppercase;">Detalle del turno</p>
    </td></tr>
    <tr><td style="padding:16px 20px;">
      <table cellpadding="0" cellspacing="0" width="100%">
        ${fila("M&eacute;dico", formatNombreMedico(datos.medicoNombre, datos.medicoTitulo))}
        ${fila("Especialidad", datos.medicoEspecialidad)}
        ${fila("Fecha", formatearFecha(datos.fecha))}
        ${fila("Hora", formatearHora(datos.hora_inicio))}
        ${fila("Modalidad", "Videoconsulta online")}
      </table>
    </td></tr>
  </table>`;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function enviarEmailTurnoConfirmado(turnoId: string): Promise<void> {
  if (!(await emailsActivos())) { console.log("[email] skipped por flag:", "turno_confirmado"); return; }
  try {
    const datos = await obtenerDatosTurno(turnoId);
    if (!datos) return;

    const urlSala = `${BASE_URL}/turno/${turnoId}/espera`;
    const html = wrapHtml("Turno confirmado — Docto", `
      <div style="margin-bottom:20px;">${chip("Turno confirmado", AZUL)}</div>
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${GRIS};">Tu turno est&aacute; reservado</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">Hola ${datos.pacienteNombre}, tu consulta fue confirmada.</p>
      ${detalleTurno(datos)}
      <p style="margin:24px 0 0;font-size:14px;color:#6b7280;">
        Algunos minutos antes del turno, ingres&aacute; a la sala virtual desde el bot&oacute;n de abajo o desde tu panel en <a href="${BASE_URL}" style="color:${AZUL};">docto.com.ar</a>.
      </p>
      ${boton("Ir a la sala virtual", urlSala, AZUL)}
      <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;">
        El archivo .ics adjunto te permite agregar este turno a tu calendario.
      </p>
    `);

    const ics = generarICS(datos, "REQUEST");

    const idempotencyKey = `${turnoId}-confirmado`;

    await conRetry(
      () => resend().emails.send({
        from: FROM,
        to: datos.pacienteEmail,
        subject: `Turno confirmado con ${formatNombreMedico(datos.medicoNombre, datos.medicoTitulo)} — ${formatearFecha(datos.fecha)}`,
        html,
        headers: { "Idempotency-Key": idempotencyKey },
        attachments: [{ filename: "turno-docto.ics", content: Buffer.from(ics).toString("base64") }],
      }),
      turnoId
    );

    console.log("[email] turno confirmado enviado:", turnoId);
  } catch (err) {
    console.error("[email] enviarEmailTurnoConfirmado falló (agotados reintentos):", err);
  }
}

export async function enviarEmailTurnoCancelado(
  turnoId: string,
  canceladoPor: "medico" | "paciente"
): Promise<void> {
  if (!(await emailsActivos())) { console.log("[email] skipped por flag:", "turno_cancelado"); return; }
  try {
    const datos = await obtenerDatosTurno(turnoId);
    if (!datos) return;

    const porMedico = canceladoPor === "medico";
    const urlReprogramar = datos.medicoSlug ? `${BASE_URL}/dr/${datos.medicoSlug}` : BASE_URL;

    // Ni el chip ni el cuerpo dicen "el médico": quien canceló puede ser una
    // médica. El chip queda neutro y el cuerpo la nombra con su propio título.
    const medicoConArt = medicoConArticulo(datos.medicoNombre, datos.medicoTitulo);

    const html = wrapHtml("Turno cancelado — Docto", `
      <div style="margin-bottom:20px;">${chip(porMedico ? "Cancelado por el consultorio" : "Turno cancelado", NARANJA)}</div>
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${GRIS};">Turno cancelado</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">
        Hola ${datos.pacienteNombre}. ${porMedico
          ? `Lamentamos informarte que ${medicoConArt} cancel&oacute; tu turno del ${formatearFecha(datos.fecha)} a las ${formatearHora(datos.hora_inicio)}.`
          : `Tu turno con ${medicoConArt} del ${formatearFecha(datos.fecha)} a las ${formatearHora(datos.hora_inicio)} fue cancelado.`
        }
      </p>
      ${detalleTurno(datos)}
      <p style="margin:24px 0 0;font-size:14px;color:#6b7280;">Pod&eacute;s reservar un nuevo turno cuando quieras.</p>
      ${boton(porMedico ? "Elegir nueva fecha" : "Quiero el reembolso", urlReprogramar, AZUL)}
      <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;">
        El archivo .ics adjunto cancela el evento en tu calendario autom&aacute;ticamente.
      </p>
    `);

    const ics = generarICS(datos, "CANCEL");
    const asunto = porMedico
      ? `Turno cancelado — ${formatNombreMedico(datos.medicoNombre, datos.medicoTitulo)} (${formatearFecha(datos.fecha)})`
      : `Confirmaci\u00f3n de cancelaci\u00f3n — turno del ${formatearFecha(datos.fecha)}`;

    const idempotencyKey = `${turnoId}-cancelado`;

    await conRetry(
      () => resend().emails.send({
        from: FROM,
        to: datos.pacienteEmail,
        subject: asunto,
        html,
        headers: { "Idempotency-Key": idempotencyKey },
        attachments: [{ filename: "cancelacion-docto.ics", content: Buffer.from(ics).toString("base64") }],
      }),
      turnoId
    );

    console.log("[email] turno cancelado enviado:", turnoId, canceladoPor);
  } catch (err) {
    console.error("[email] enviarEmailTurnoCancelado falló (agotados reintentos):", err);
  }
}

/**
 * El profesional no atendió el turno (resolución automática `ausente_medico`,
 * cron resolver-turnos-vencidos). El paciente ya recibe push y mensaje interno,
 * pero el push exige haber activado notificaciones y el mensaje hay que ir a
 * buscarlo: la paciente del 30/08 tenía cero suscripciones y se enteró del
 * desenlace escribiendo a soporte. El mail no depende de nada.
 *
 * Mismo framing que el push y la pantalla de espera ("no pudo atender", no
 * "no se presentó" — gate Sofía): hecho verificable, sin incendiar al médico.
 */
export async function enviarEmailTurnoAusenteMedico(turnoId: string): Promise<void> {
  if (!(await emailsActivos())) { console.log("[email] skipped por flag:", "turno_ausente_medico"); return; }
  try {
    const datos = await obtenerDatosTurno(turnoId);
    if (!datos) return;

    const medicoConArt = capitalizarInicio(medicoConArticulo(datos.medicoNombre, datos.medicoTitulo));

    const html = wrapHtml("Tu turno no pudo realizarse — Docto", `
      <div style="margin-bottom:20px;">${chip("No se pudo realizar", NARANJA)}</div>
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${GRIS};">Tu turno no pudo realizarse</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">
        Hola ${datos.pacienteNombre}. ${medicoConArt} no pudo atender tu turno del
        ${formatearFecha(datos.fecha)} a las ${formatearHora(datos.hora_inicio)}.
        Ya iniciamos la devoluci&oacute;n del <strong>100%</strong> de lo que pagaste, al mismo
        medio de pago. Los tiempos de acreditaci&oacute;n dependen del medio.
      </p>
      ${detalleTurno(datos)}
      <p style="margin:24px 0 0;font-size:14px;color:#6b7280;">
        Si necesit&aacute;s atenderte, hay profesionales disponibles para consulta inmediata o con turnos pr&oacute;ximos.
      </p>
      ${boton("Ver profesionales disponibles", `${BASE_URL}/clinica`, AZUL)}
      <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;">
        El archivo .ics adjunto quita el turno de tu calendario autom&aacute;ticamente.
      </p>
    `);

    const ics = generarICS(datos, "CANCEL");
    const asunto = `Tu turno del ${formatearFecha(datos.fecha)} no pudo realizarse — devoluci\u00f3n del 100% en curso`;

    await conRetry(
      () => resend().emails.send({
        from: FROM,
        to: datos.pacienteEmail,
        subject: asunto,
        html,
        headers: { "Idempotency-Key": `${turnoId}-ausente-medico` },
        attachments: [{ filename: "cancelacion-docto.ics", content: Buffer.from(ics).toString("base64") }],
      }),
      turnoId
    );

    console.log("[email] turno ausente_medico enviado:", turnoId);
  } catch (err) {
    console.error("[email] enviarEmailTurnoAusenteMedico falló (agotados reintentos):", err);
  }
}

export async function enviarDocumentoMedico(params: {
  pacienteEmail: string;
  pacienteNombre: string;
  medicoNombre: string;
  /** `medicos.titulo` ("Dr." / "Dra."). Sin él, el mail nombra al médico sin
   *  título ni artículo en vez de asumir "El Dr." — que era lo que hacía. */
  medicoTitulo?: string | null;
  fecha: string;
  archivo: { filename: string; content: string };
}): Promise<void> {
  if (!(await emailsActivos())) { console.log("[email] skipped por flag:", "documento_medico"); return; }
  const { pacienteEmail, pacienteNombre, medicoNombre, medicoTitulo, fecha, archivo } = params;

  // "La Dra. Ana García te compartió…" / "El Dr. … te compartió…" / sin título
  // conocido, "Ana García te compartió…", que también es una oración correcta.
  const sujetoMedico = capitalizarInicio(medicoConArticulo(medicoNombre, medicoTitulo));

  const html = wrapHtml("Documento de tu consulta — Docto", `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${GRIS};">Documento de tu consulta</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">
      Hola ${pacienteNombre},
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">
      ${sujetoMedico} te comparti&oacute; un documento de tu consulta del ${fecha}.
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">
      Encontr&aacute;s el archivo adjunto a este email.
    </p>
    <p style="margin:24px 0 0;font-size:14px;color:#9ca3af;">&mdash; Docto</p>
  `);

  await resend().emails.send({
    from: FROM,
    to: pacienteEmail,
    subject: `${sujetoMedico} te envió un documento de tu consulta`,
    html,
    attachments: [{ filename: archivo.filename, content: archivo.content }],
  });

  console.log("[email] documento médico enviado a:", pacienteEmail);
}

/**
 * Documentación emitida DESPUÉS del cierre de la atención.
 *
 * Cuando el médico vuelve a una consulta ya terminada y emite lo que faltó, el
 * paciente no está mirando la pantalla: la consulta terminó hace horas o días.
 * El push puede no llegar (permiso denegado, teléfono apagado), así que el mail
 * es el canal que garantiza el aviso. No lleva adjuntos: los documentos se ven y
 * se descargan desde "Mis consultas", igual que los del cierre normal.
 */
export async function enviarEmailDocumentacionDisponible(params: {
  pacienteId: string;
  medicoId: string;
  tipos: string[];
}): Promise<void> {
  if (!(await emailsActivos())) { console.log("[email] skipped por flag:", "documentacion_disponible"); return; }
  try {
    const supabase = createAdminClient();

    const [{ data: paciente }, { data: medico }] = await Promise.all([
      supabase.from("pacientes").select("nombre_completo, user_id").eq("id", params.pacienteId).maybeSingle(),
      // `titulo` y nada más — ver la nota del SELECT de obtenerDatosTurno.
      supabase.from("medicos").select("nombre_completo, titulo").eq("id", params.medicoId).maybeSingle(),
    ]);

    if (!paciente || !medico) return;

    const { data: { user } } = await supabase.auth.admin.getUserById(paciente.user_id);
    if (!user?.email) return;

    const etiquetas: Record<string, string> = {
      receta: "Receta",
      indicaciones: "Indicaciones",
      certificado: "Certificado",
      orden: "Orden m&eacute;dica",
    };
    const lista = [...new Set(params.tipos)].map((t) => etiquetas[t] ?? t);
    const listaHtml = lista.length > 0
      ? `<ul style="margin:0 0 24px;padding-left:20px;font-size:15px;color:#6b7280;">${lista
          .map((l) => `<li style="margin-bottom:6px;">${l}</li>`)
          .join("")}</ul>`
      : "";

    const html = wrapHtml("Documentaci&oacute;n de tu consulta — Docto", `
      <div style="margin-bottom:20px;">${chip("Documentaci&oacute;n disponible", AZUL)}</div>
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${GRIS};">Ya ten&eacute;s la documentaci&oacute;n de tu consulta</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#6b7280;">
        Hola ${paciente.nombre_completo}, ${medicoConArticulo(medico.nombre_completo, medico.titulo)} complet&oacute; la documentaci&oacute;n de tu consulta y ya la pod&eacute;s ver y descargar.
      </p>
      ${listaHtml}
      ${boton("Ver mis documentos", `${BASE_URL}/mis-consultas`, AZUL)}
      <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;">
        Si ten&eacute;s alguna duda sobre lo que recibiste, escribinos a soporte@docto.com.ar.
      </p>
    `);

    await conRetry(
      () => resend().emails.send({
        from: FROM,
        to: user.email!,
        subject: "Ya está disponible la documentación de tu consulta",
        html,
      }),
      `documentacion_disponible:${params.pacienteId}`
    );

    console.log("[email] documentación disponible enviada a paciente:", params.pacienteId);
  } catch (err) {
    console.error("[email] enviarEmailDocumentacionDisponible falló:", err);
  }
}

export async function enviarEmailRecordatorio24h(turnoId: string): Promise<void> {
  if (!(await emailsActivos())) { console.log("[email] skipped por flag:", "recordatorio_24h"); return; }
  try {
    const datos = await obtenerDatosTurno(turnoId);
    if (!datos) return;

    const urlSala = `${BASE_URL}/turno/${turnoId}/espera`;
    const html = wrapHtml("Recordatorio: consulta mañana — Docto", `
      <div style="margin-bottom:20px;">${chip("Recordatorio 24 hs", AZUL)}</div>
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${GRIS};">Recordatorio: consulta ma&ntilde;ana</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">
        Hola ${datos.pacienteNombre}. Ma&ntilde;ana a las ${formatearHora(datos.hora_inicio)} ten&eacute;s turno con ${medicoConArticulo(datos.medicoNombre, datos.medicoTitulo)}. Asegurate de tener buena conexi&oacute;n y un lugar tranquilo.
      </p>
      ${detalleTurno(datos)}
      ${boton("Ver mi turno", urlSala, AZUL)}
    `);

    await resend().emails.send({
      from: FROM,
      to: datos.pacienteEmail,
      subject: `Recordatorio: consulta mañana con ${medicoConArticulo(datos.medicoNombre, datos.medicoTitulo)}`,
      html,
    });

    console.log("[email] recordatorio 24h enviado:", turnoId);
  } catch (err) {
    console.error("[email] enviarEmailRecordatorio24h falló:", err);
  }
}

export async function enviarEmailMedicoAprobado(medicoId: string): Promise<void> {
  if (!(await emailsActivos())) { console.log("[email] skipped por flag:", "medico_aprobado"); return; }
  try {
    const supabase = createAdminClient();
    const { data: medico } = await supabase
      .from("medicos")
      // `titulo` y nada más — ver la nota del SELECT de obtenerDatosTurno.
      .select("nombre_completo, titulo, slug, email, user_id, jurisdicciones")
      .eq("id", medicoId)
      .single();
    if (!medico) return;

    let email = (medico.email as string | null) ?? null;
    if (!email && medico.user_id) {
      const { data: { user } } = await supabase.auth.admin.getUserById(medico.user_id);
      email = user?.email ?? null;
    }
    if (!email) { console.warn("[email] médico sin email, no se envía bienvenida:", medicoId); return; }
    const destinatario = email;

    const linkConsultorio = medico.slug ? `docto.com.ar/dr/${medico.slug}` : "docto.com.ar/dr/tu-nombre";

    // Dónde está habilitado a atender (jurisdicciones REFEPS). Encuadre de alcance
    // maximizado (decisión Diego 05/07): cualquier persona dentro de esas provincias
    // puede atenderse con él. Si por excepción no hay jurisdicciones cargadas, el
    // bloque no se muestra — nunca un mail con un hueco.
    const juris = (medico.jurisdicciones as string[] | null) ?? [];
    const listaJuris = juris.length > 1
      ? `${juris.slice(0, -1).join(", ")} y ${juris[juris.length - 1]}`
      : (juris[0] ?? "");
    const bloqueJurisdicciones = juris.length
      ? `
      <div style="margin:0 0 24px;padding:14px 16px;border:1px solid #d3e5f7;border-radius:10px;background:#f4f9fe;">
        <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:${GRIS};">D&oacute;nde pod&eacute;s atender</p>
        <p style="margin:0;font-size:15px;color:#6b7280;line-height:1.55;">
          Tu matr&iacute;cula te habilita a atender en: <strong style="color:${GRIS};">${listaJuris}</strong>.
          Cualquier persona que se encuentre en ${juris.length > 1 ? "esas jurisdicciones" : listaJuris} puede atenderse con vos por Docto &mdash; tu consultorio digital llega a todo ese territorio, sin l&iacute;mite de distancia.
        </p>
      </div>`
      : "";

    // Este mail va DIRIGIDO a la médica: cada "bienvenido"/"habilitado" en
    // masculino era un error en la primera impresión de la plataforma. Se
    // reescribieron en neutro en vez de duplicar terminaciones ("bienvenido/a").
    const html = wrapHtml("Te damos la bienvenida a Docto — tu cuenta está activa", `
      <div style="margin-bottom:20px;">${chip("Cuenta verificada", AZUL)}</div>
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${GRIS};">&iexcl;Hola ${formatNombreMedico(medico.nombre_completo, medico.titulo)}! 🎉</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.55;">
        Tu cuenta ya est&aacute; <strong>aprobada y verificada</strong>. De ac&aacute; en m&aacute;s, Docto es tu consultorio digital: vos atend&eacute;s, del resto nos encargamos nosotros.
      </p>
      ${bloqueJurisdicciones}
      <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:${GRIS};">Para arrancar en 5 minutos:</p>
      <ul style="margin:0 0 24px;padding-left:20px;font-size:15px;color:#6b7280;line-height:1.6;">
        <li style="margin-bottom:10px;"><strong style="color:${GRIS};">Conect&aacute; tu Mercado Pago</strong> (Perfil &rarr; Cobros) &mdash; es donde vas a recibir tus honorarios, directo a tu cuenta.</li>
        <li style="margin-bottom:10px;"><strong style="color:${GRIS};">Arm&aacute; tu agenda con Nova</strong>, tu asistente &mdash; contale cu&aacute;ndo y a cu&aacute;nto quer&eacute;s atender, y ella crea los turnos por vos.</li>
        <li style="margin-bottom:10px;"><strong style="color:${GRIS};">Ponete disponible</strong> desde tu panel cuando tengas un rato libre &mdash; ah&iacute; los pacientes ya te encuentran.</li>
      </ul>
      <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:${GRIS};">Tus tres formas de atender:</p>
      <ul style="margin:0 0 24px;padding-left:20px;font-size:15px;color:#6b7280;line-height:1.6;">
        <li style="margin-bottom:10px;">⚡ <strong style="color:${GRIS};">Consulta Inmediata</strong> &mdash; te pon&eacute;s disponible y el paciente se conecta al instante. Ideal para los huecos libres.</li>
        <li style="margin-bottom:10px;">📅 <strong style="color:${GRIS};">Turnos Programados</strong> &mdash; abr&iacute;s tu agenda y reservan d&iacute;a y hora. Confirmaci&oacute;n y recordatorios, autom&aacute;ticos.</li>
        <li style="margin-bottom:10px;">🩺 <strong style="color:${GRIS};">Consultorio Particular</strong> &mdash; tu link propio (${linkConsultorio}) copialo para atender a tus pacientes en tu consultorio virtual privado.</li>
      </ul>
      <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.55;">
        Vas a ver que Docto es <strong>muy intuitivo</strong> &mdash; en un par de consultas ya va a ser tu plataforma de trabajo preferida. Cualquier cosa, estamos.
      </p>
      <p style="margin:0 0 4px;font-size:15px;color:#6b7280;">&iexcl;Gracias por sumarte al equipo!</p>
      <p style="margin:0;font-size:15px;color:#6b7280;">&mdash; El equipo de Docto</p>
      ${boton("Ir a mi panel", `${BASE_URL}/dashboard`, AZUL)}
      <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;">Adjuntamos una gu&iacute;a r&aacute;pida de Docto en PDF para que empieces con todo.</p>
    `);

    await conRetry(
      () => resend().emails.send({
        from: FROM,
        to: destinatario,
        subject: "¡Te damos la bienvenida a Docto! Tu cuenta ya está activa",
        html,
        attachments: [{ filename: "Bienvenida a Docto.pdf", path: `${BASE_URL}/guia-docto.pdf` }],
      }),
      `medico-aprobado-${medicoId}`
    );

    console.log("[email] bienvenida médico aprobado enviada:", medicoId);
  } catch (err) {
    console.error("[email] enviarEmailMedicoAprobado falló:", err);
  }
}

// ─── Recordatorio de verificación de identidad (gate identidad, 13/07/2026) ──
// Va al MÉDICO trabado (decisión Diego: el aviso al admin es el badge del panel,
// no un mail). Lo dispara el cron reconciliar-identidad con gate activo, para
// aprobados no exentos sin validar, con throttle vía identidad_recordatorio_at.
export async function enviarEmailRecordatorioIdentidad(medicoId: string): Promise<void> {
  if (!(await emailsActivos())) { console.log("[email] skipped por flag:", "recordatorio_identidad"); return; }
  try {
    const supabase = createAdminClient();
    const { data: medico } = await supabase
      .from("medicos")
      .select("nombre_completo, email, user_id")
      .eq("id", medicoId)
      .single();
    if (!medico) return;

    let email = (medico.email as string | null) ?? null;
    if (!email && medico.user_id) {
      const { data: { user } } = await supabase.auth.admin.getUserById(medico.user_id);
      email = user?.email ?? null;
    }
    if (!email) { console.warn("[email] médico sin email, no se envía recordatorio identidad:", medicoId); return; }

    // Faltantes REALES del médico (decisión Diego 13/07: no avisar "un paso" si
    // le faltan tres — misma fuente de verdad que el dashboard: MP = cuenta
    // activa en medicos_mp_accounts, firma = fila en medico_claves).
    const [mpRes, firmaRes] = await Promise.all([
      supabase.from("medicos_mp_accounts").select("estado").eq("medico_id", medicoId).eq("estado", "activo").maybeSingle(),
      supabase.from("medico_claves").select("id").eq("medico_id", medicoId).eq("activa", true).maybeSingle(),
    ]);
    const faltaMp = !mpRes.data;
    const faltaFirma = !firmaRes.data;
    const soloIdentidad = !faltaMp && !faltaFirma;

    const nombre = (medico.nombre_completo as string | null)?.trim().split(/\s+/)[0] ?? "Doctor/a";

    // Variante solo-identidad: párrafo completo (aprobado). Variante multi:
    // recortado — el "3 minutos + DNI y cámara" ya está en el bullet (gate Sofía).
    const bloqueIdentidadCompleto = `
      <p style="margin:0 0 16px;font-size:15px;color:#6b7280;line-height:1.55;">
        La <strong>verificaci&oacute;n de identidad</strong> es un requisito de seguridad que
        protege a tus pacientes y a tu matr&iacute;cula: confirma que quien atiende sos
        realmente vos. Lleva unos 3 minutos &mdash; solo necesit&aacute;s tu DNI y la
        c&aacute;mara de tu tel&eacute;fono o computadora. Hasta completarla, tu perfil no se
        muestra en la cl&iacute;nica virtual y los pacientes no pueden reservar consultas con vos.
      </p>`;
    const bloqueIdentidadBreve = `
      <p style="margin:0 0 16px;font-size:15px;color:#6b7280;line-height:1.55;">
        La <strong>verificaci&oacute;n de identidad</strong> es un requisito de seguridad que
        protege a tus pacientes y a tu matr&iacute;cula: confirma que quien atiende sos
        realmente vos. Hasta completarla, tu perfil no se muestra en la cl&iacute;nica
        virtual y los pacientes no pueden reservar consultas con vos.
      </p>`;

    const contenido = soloIdentidad
      ? `
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${GRIS};">Hola, ${nombre}</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#6b7280;line-height:1.55;">
        Tu cuenta en Docto est&aacute; activa, pero te falta un paso para que los pacientes puedan encontrarte:
        la <strong>verificaci&oacute;n de identidad</strong>.
      </p>
      ${bloqueIdentidadCompleto}
      ${boton("Verificar mi identidad", `${BASE_URL}/medico/identidad`, AZUL)}
      <p style="margin:24px 0 0;font-size:14px;color:#6b7280;line-height:1.55;">
        Si ten&eacute;s alg&uacute;n inconveniente con la verificaci&oacute;n, escribinos a
        <a href="mailto:soporte@docto.com.ar" style="color:${AZUL};">soporte@docto.com.ar</a> y te ayudamos.
      </p>
      <p style="margin:16px 0 0;font-size:14px;color:#6b7280;">&mdash; El equipo de Docto</p>`
      : `
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${GRIS};">Hola, ${nombre}</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#6b7280;line-height:1.55;">
        Tu cuenta en Docto est&aacute; activa, pero todav&iacute;a te faltan estos pasos para
        empezar a recibir pacientes:
      </p>
      <ul style="margin:0 0 16px;padding-left:20px;font-size:15px;color:#6b7280;line-height:1.6;">
        <li style="margin-bottom:8px;"><strong>Verificar tu identidad</strong> &mdash; unos 3 minutos, con tu DNI y la c&aacute;mara.</li>
        ${faltaMp ? '<li style="margin-bottom:8px;"><strong>Conectar Mercado Pago</strong> &mdash; para que recibas el cobro de tus consultas.</li>' : ""}
        ${faltaFirma ? '<li style="margin-bottom:8px;"><strong>Cargar tu firma</strong> &mdash; para recetas y documentos.</li>' : ""}
      </ul>
      ${bloqueIdentidadBreve}
      ${boton("Completar mi cuenta", `${BASE_URL}/medico/onboarding`, AZUL)}
      <p style="margin:24px 0 0;font-size:14px;color:#6b7280;line-height:1.55;">
        Todo se hace desde tu panel, paso a paso. Si ten&eacute;s alg&uacute;n inconveniente,
        escribinos a <a href="mailto:soporte@docto.com.ar" style="color:${AZUL};">soporte@docto.com.ar</a> y te ayudamos.
      </p>
      <p style="margin:16px 0 0;font-size:14px;color:#6b7280;">&mdash; El equipo de Docto</p>`;

    await resend().emails.send({
      from: FROM,
      to: email,
      subject: "Verificá tu identidad para empezar a recibir pacientes",
      html: wrapHtml("Verificación de identidad pendiente", contenido),
    });
  } catch (e) {
    console.error("[email] recordatorio identidad falló:", e instanceof Error ? e.message : e);
  }
}

// ─── Aviso de vencimiento de agenda ──────────────────────────────────────────
// Decisión Diego 17/07: el día en que vence su agenda, el médico SIN otras
// agendas activas a futuro recibe UNA invitación a renovarla — la contracara
// sana del límite de 60 días (sin esto, la agenda muere en silencio y el médico
// desaparece de Docto sin saberlo). Texto aprobado por Diego (17/07).
// `titulo` es opcional para no romper al cron que ya llama con dos argumentos:
// si no llega, el saludo va con el nombre pelado ("Hola Ana García") en vez de
// con un título adivinado.
export async function enviarAvisoAgendaVencida(
  email: string,
  nombre: string,
  titulo?: string | null
): Promise<void> {
  if (!(await emailsActivos())) { console.log("[email] skipped por flag:", "aviso_agenda_vencida"); return; }

  const html = wrapHtml("Tu agenda en Docto vence hoy", `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${GRIS};">Tu agenda vence hoy</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#6b7280;">Hola ${formatNombreMedico(nombre, titulo)},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#6b7280;">
      Tu agenda de turnos termina hoy. Cuando vence, tus horarios dejan de ofrecerse
      y los pacientes ya no pueden reservarte.
    </p>
    <p style="margin:0 0 8px;font-size:15px;color:#6b7280;">
      Renovarla lleva un minuto: entr&aacute; a tu panel, le ped&iacute;s a <strong>Nova</strong> que cree
      tu agenda o toc&aacute; <strong>Crear agenda</strong> y eleg&iacute; las fechas del pr&oacute;ximo
      per&iacute;odo (hasta 60 d&iacute;as).
    </p>
    ${boton("Renovar mi agenda", "https://www.docto.com.ar/medico/agenda?nuevo=1", AZUL)}
    <p style="margin:24px 0 0;font-size:14px;color:#9ca3af;">Gracias por atender en Docto,<br/>Diego &mdash; Docto</p>
  `);

  // El cliente de Resend NO lanza excepciones: devuelve { error } incluso ante
  // red caída (gate Roberto #283, verificado en resend@6.12.0). Sin este throw,
  // el cron marcaría el aviso como enviado sin haberse enviado — falla muda, y
  // la ventana de reintento del cron sería código muerto.
  const { error } = await resend().emails.send({
    from: FROM,
    to: email,
    subject: "Tu agenda en Docto vence hoy — renovala para seguir visible",
    html,
  });
  if (error) throw new Error(`Resend: ${error.message}`);
  console.log("[email] aviso agenda vencida enviado a:", email);
}
