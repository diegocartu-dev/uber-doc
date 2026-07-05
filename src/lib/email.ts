import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFlag } from "@/lib/feature-flags";
import { formatNombreMedico } from "@/lib/utils/texto";

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
    supabase.from("medicos").select("nombre_completo, especialidad, slug").eq("id", turno.medico_id).single(),
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
  const summary = escapeICalText(`Consulta con Dr/a. ${datos.medicoNombre} - Docto`);
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
        ${fila("M&eacute;dico", `Dr/a. ${datos.medicoNombre}`)}
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
        subject: `Turno confirmado con Dr/a. ${datos.medicoNombre} — ${formatearFecha(datos.fecha)}`,
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

    const html = wrapHtml("Turno cancelado — Docto", `
      <div style="margin-bottom:20px;">${chip(porMedico ? "Cancelado por el m\u00e9dico" : "Turno cancelado", NARANJA)}</div>
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${GRIS};">Turno cancelado</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">
        Hola ${datos.pacienteNombre}. ${porMedico
          ? `Lamentamos informarte que el turno con Dr/a. ${datos.medicoNombre} del ${formatearFecha(datos.fecha)} a las ${formatearHora(datos.hora_inicio)} fue cancelado por el m&eacute;dico.`
          : `Tu turno con Dr/a. ${datos.medicoNombre} del ${formatearFecha(datos.fecha)} a las ${formatearHora(datos.hora_inicio)} fue cancelado.`
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
      ? `Turno cancelado — Dr/a. ${datos.medicoNombre} (${formatearFecha(datos.fecha)})`
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

export async function enviarDocumentoMedico(params: {
  pacienteEmail: string;
  pacienteNombre: string;
  medicoNombre: string;
  fecha: string;
  archivo: { filename: string; content: string };
}): Promise<void> {
  if (!(await emailsActivos())) { console.log("[email] skipped por flag:", "documento_medico"); return; }
  const { pacienteEmail, pacienteNombre, medicoNombre, fecha, archivo } = params;

  const html = wrapHtml("Documento de tu consulta — Docto", `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${GRIS};">Documento de tu consulta</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">
      Hola ${pacienteNombre},
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">
      El ${formatNombreMedico(medicoNombre)} te comparti&oacute; un documento de tu consulta del ${fecha}.
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">
      Encontr&aacute;s el archivo adjunto a este email.
    </p>
    <p style="margin:24px 0 0;font-size:14px;color:#9ca3af;">&mdash; Docto</p>
  `);

  await resend().emails.send({
    from: FROM,
    to: pacienteEmail,
    subject: `El ${formatNombreMedico(medicoNombre)} te envió un documento de tu consulta`,
    html,
    attachments: [{ filename: archivo.filename, content: archivo.content }],
  });

  console.log("[email] documento médico enviado a:", pacienteEmail);
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
        Hola ${datos.pacienteNombre}. Ma&ntilde;ana a las ${formatearHora(datos.hora_inicio)} ten&eacute;s turno con Dr/a. ${datos.medicoNombre}. Asegurate de tener buena conexi&oacute;n y un lugar tranquilo.
      </p>
      ${detalleTurno(datos)}
      ${boton("Ver mi turno", urlSala, AZUL)}
    `);

    await resend().emails.send({
      from: FROM,
      to: datos.pacienteEmail,
      subject: `Recordatorio: consulta mañana con Dr/a. ${datos.medicoNombre}`,
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
      .select("nombre_completo, slug, email, user_id, jurisdicciones")
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
        <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:${GRIS};">D&oacute;nde est&aacute;s habilitado a atender</p>
        <p style="margin:0;font-size:15px;color:#6b7280;line-height:1.55;">
          Tu matr&iacute;cula te habilita a atender en: <strong style="color:${GRIS};">${listaJuris}</strong>.
          Cualquier persona que se encuentre en ${juris.length > 1 ? "esas jurisdicciones" : listaJuris} puede atenderse con vos por Docto &mdash; tu consultorio digital llega a todo ese territorio, sin l&iacute;mite de distancia.
        </p>
      </div>`
      : "";

    const html = wrapHtml("¡Bienvenido a Docto! — tu cuenta está activa", `
      <div style="margin-bottom:20px;">${chip("Cuenta verificada", AZUL)}</div>
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${GRIS};">&iexcl;Hola ${formatNombreMedico(medico.nombre_completo)}! 🎉</h1>
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
      <p style="margin:0 0 4px;font-size:15px;color:#6b7280;">&iexcl;Bienvenido/a al equipo!</p>
      <p style="margin:0;font-size:15px;color:#6b7280;">&mdash; El equipo de Docto</p>
      ${boton("Ir a mi panel", `${BASE_URL}/dashboard`, AZUL)}
      <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;">Adjuntamos una gu&iacute;a r&aacute;pida de Docto en PDF para que empieces con todo.</p>
    `);

    await conRetry(
      () => resend().emails.send({
        from: FROM,
        to: destinatario,
        subject: "¡Bienvenido a Docto! Tu cuenta ya está activa",
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
