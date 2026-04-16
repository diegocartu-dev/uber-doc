// Templates HTML para emails transaccionales de Docto
// HTML inline, mobile-first, máx 600px
// Sin datos clínicos — solo información logística

const VERDE = "#1D9E75";
const AZUL = "#378ADD";
const NARANJA = "#D85A30";
const GRIS_TEXTO = "#374151";
const GRIS_CLARO = "#f3f4f6";
const BORDE = "#e5e7eb";

function wrapBase(titulo: string, contenido: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${titulo}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;border:1px solid ${BORDE};overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:${VERDE};padding:24px 32px;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Docto</p>
              <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">Consultas médicas online</p>
            </td>
          </tr>
          <!-- Contenido -->
          <tr>
            <td style="padding:32px;">
              ${contenido}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background:${GRIS_CLARO};border-top:1px solid ${BORDE};">
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                Este email fue enviado por Docto · <a href="https://docto.com.ar" style="color:#9ca3af;">docto.com.ar</a><br/>
                Si no realizaste esta acción, podés ignorar este mensaje.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function boton(texto: string, href: string, color: string = VERDE): string {
  return `<a href="${href}" style="display:inline-block;margin-top:24px;padding:14px 28px;background:${color};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;">${texto}</a>`;
}

function chipEstado(texto: string, color: string): string {
  return `<span style="display:inline-block;padding:4px 12px;background:${color}1a;color:${color};border:1px solid ${color}40;border-radius:20px;font-size:12px;font-weight:600;">${texto}</span>`;
}

function filaDetalle(etiqueta: string, valor: string): string {
  return `<tr>
    <td style="padding:8px 0;font-size:13px;color:#6b7280;width:120px;vertical-align:top;">${etiqueta}</td>
    <td style="padding:8px 0;font-size:13px;color:${GRIS_TEXTO};font-weight:500;">${valor}</td>
  </tr>`;
}

// ─── Tipos de datos ─────────────────────────────────────────────────────────

export type DatosTurnoConfirmado = {
  pacienteNombre: string;
  medicoNombre: string;
  medicoEspecialidad: string;
  fecha: string;    // "lunes 20 de abril de 2026"
  hora: string;     // "14:00"
  urlSala: string;
};

export type DatosConsultaConfirmada = {
  pacienteNombre: string;
  medicoNombre: string;
  medicoEspecialidad: string;
  urlSala: string;
};

export type DatosTurnoCancelado = {
  pacienteNombre: string;
  medicoNombre: string;
  medicoEspecialidad: string;
  fecha: string;
  hora: string;
  quienCancelo: "medico" | "paciente";
  urlReprogramar: string;  // link para elegir nueva fecha o reprogramar con crédito
};

export type DatosDocumentosDisponibles = {
  pacienteNombre: string;
  medicoNombre: string;
  urlDocumentos: string;
};

export type DatosRecordatorio = {
  pacienteNombre: string;
  medicoNombre: string;
  medicoEspecialidad: string;
  fecha: string;
  hora: string;
  tipo: "24h" | "10min";
  urlSala: string;
};

// ─── Templates ──────────────────────────────────────────────────────────────

export function turnoConfirmado(data: DatosTurnoConfirmado): string {
  const contenido = `
    <div style="margin-bottom:20px;">${chipEstado("Turno confirmado", VERDE)}</div>
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${GRIS_TEXTO};">Tu turno está reservado</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">Hola ${data.pacienteNombre}, tu consulta fue confirmada.</p>

    <table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid ${BORDE};border-radius:10px;overflow:hidden;">
      <tr><td style="padding:16px 20px;background:${GRIS_CLARO};border-bottom:1px solid ${BORDE};">
        <p style="margin:0;font-size:11px;font-weight:700;color:#9ca3af;letter-spacing:0.8px;text-transform:uppercase;">Detalle del turno</p>
      </td></tr>
      <tr><td style="padding:16px 20px;">
        <table cellpadding="0" cellspacing="0" width="100%">
          ${filaDetalle("Médico", `Dr/a. ${data.medicoNombre}`)}
          ${filaDetalle("Especialidad", data.medicoEspecialidad)}
          ${filaDetalle("Fecha", data.fecha)}
          ${filaDetalle("Hora", data.hora)}
          ${filaDetalle("Modalidad", "Videoconsulta online")}
        </table>
      </td></tr>
    </table>

    <p style="margin:24px 0 0;font-size:14px;color:#6b7280;">
      Algunos minutos antes del turno, ingresá a la sala virtual desde el botón de abajo o desde tu panel en <a href="https://docto.com.ar" style="color:${AZUL};">docto.com.ar</a>.
    </p>
    ${boton("Ir a la sala virtual", data.urlSala, AZUL)}

    <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;">
      El archivo .ics adjunto te permite agregar este turno a tu calendario (Google Calendar, Outlook, Apple Calendar).
    </p>
  `;
  return wrapBase("Turno confirmado — Docto", contenido);
}

export function consultaConfirmada(data: DatosConsultaConfirmada): string {
  const contenido = `
    <div style="margin-bottom:20px;">${chipEstado("Consulta inmediata confirmada", VERDE)}</div>
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${GRIS_TEXTO};">Tu consulta está lista</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">Hola ${data.pacienteNombre}, tu pago fue procesado y el médico ya fue notificado.</p>

    <table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid ${BORDE};border-radius:10px;overflow:hidden;">
      <tr><td style="padding:16px 20px;background:${GRIS_CLARO};border-bottom:1px solid ${BORDE};">
        <p style="margin:0;font-size:11px;font-weight:700;color:#9ca3af;letter-spacing:0.8px;text-transform:uppercase;">Detalle de la consulta</p>
      </td></tr>
      <tr><td style="padding:16px 20px;">
        <table cellpadding="0" cellspacing="0" width="100%">
          ${filaDetalle("Médico", `Dr/a. ${data.medicoNombre}`)}
          ${filaDetalle("Especialidad", data.medicoEspecialidad)}
          ${filaDetalle("Modalidad", "Videoconsulta online")}
          ${filaDetalle("Cuándo", "Ahora — sala disponible")}
        </table>
      </td></tr>
    </table>

    <p style="margin:24px 0 0;font-size:14px;color:#6b7280;">
      Ingresá a la sala virtual haciendo click en el botón de abajo. El médico se conectará en breve.
    </p>
    ${boton("Ingresar a la consulta ahora", data.urlSala, VERDE)}
  `;
  return wrapBase("Consulta confirmada — Docto", contenido);
}

export function turnoCancelado(data: DatosTurnoCancelado): string {
  const canceladoPorMedico = data.quienCancelo === "medico";
  const chipTexto = canceladoPorMedico ? "Turno cancelado por el médico" : "Turno cancelado";
  const textoBoton = canceladoPorMedico ? "Elegir nueva fecha" : "Reprogramar con crédito";
  const textoCuerpo = canceladoPorMedico
    ? `Lamentamos informarte que el turno con Dr/a. ${data.medicoNombre} del ${data.fecha} a las ${data.hora} fue cancelado por el médico.`
    : `Tu turno con Dr/a. ${data.medicoNombre} del ${data.fecha} a las ${data.hora} fue cancelado.`;

  const contenido = `
    <div style="margin-bottom:20px;">${chipEstado(chipTexto, NARANJA)}</div>
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${GRIS_TEXTO};">Turno cancelado</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">Hola ${data.pacienteNombre}. ${textoCuerpo}</p>

    <table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid ${BORDE};border-radius:10px;overflow:hidden;">
      <tr><td style="padding:16px 20px;background:${GRIS_CLARO};border-bottom:1px solid ${BORDE};">
        <p style="margin:0;font-size:11px;font-weight:700;color:#9ca3af;letter-spacing:0.8px;text-transform:uppercase;">Turno cancelado</p>
      </td></tr>
      <tr><td style="padding:16px 20px;">
        <table cellpadding="0" cellspacing="0" width="100%">
          ${filaDetalle("Médico", `Dr/a. ${data.medicoNombre}`)}
          ${filaDetalle("Especialidad", data.medicoEspecialidad)}
          ${filaDetalle("Fecha", data.fecha)}
          ${filaDetalle("Hora", data.hora)}
        </table>
      </td></tr>
    </table>

    <p style="margin:24px 0 0;font-size:14px;color:#6b7280;">
      Podés reservar un nuevo turno cuando quieras.
    </p>
    ${boton(textoBoton, data.urlReprogramar, AZUL)}

    <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;">
      El archivo .ics adjunto cancela el evento en tu calendario automáticamente.
    </p>
  `;
  return wrapBase("Turno cancelado — Docto", contenido);
}

export function documentosDisponibles(data: DatosDocumentosDisponibles): string {
  const contenido = `
    <div style="margin-bottom:20px;">${chipEstado("Documentos disponibles", VERDE)}</div>
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${GRIS_TEXTO};">Tu consulta fue completada</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">
      Hola ${data.pacienteNombre}, Dr/a. ${data.medicoNombre} finalizó tu consulta y tus documentos médicos están disponibles.
    </p>

    <table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid ${BORDE};border-radius:10px;">
      <tr><td style="padding:20px;">
        <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:${GRIS_TEXTO};">Podés encontrar:</p>
        <ul style="margin:0;padding-left:20px;font-size:14px;color:#6b7280;line-height:1.8;">
          <li>Diagnóstico</li>
          <li>Receta médica (si corresponde)</li>
          <li>Indicaciones y recomendaciones</li>
          <li>Certificado médico (si corresponde)</li>
        </ul>
      </td></tr>
    </table>

    ${boton("Ver mis documentos", data.urlDocumentos, VERDE)}

    <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;">
      Tus documentos están disponibles en cualquier momento desde tu perfil en Docto.
    </p>
  `;
  return wrapBase("Documentos disponibles — Docto", contenido);
}

export function recordatorio(data: DatosRecordatorio): string {
  const es10min = data.tipo === "10min";
  const titulo = es10min ? "Tu consulta empieza en 10 minutos" : "Recordatorio: consulta mañana";
  const chipTexto = es10min ? "Ingresá ahora" : "Recordatorio 24 hs";
  const chipColor = es10min ? NARANJA : AZUL;
  const cuerpo = es10min
    ? `Tu consulta con Dr/a. ${data.medicoNombre} empieza en <strong>10 minutos</strong>. La sala virtual ya está disponible.`
    : `Mañana a las ${data.hora} tenés turno con Dr/a. ${data.medicoNombre}. Asegurate de tener buena conexión y un lugar tranquilo.`;

  const contenido = `
    <div style="margin-bottom:20px;">${chipEstado(chipTexto, chipColor)}</div>
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${GRIS_TEXTO};">${titulo}</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">Hola ${data.pacienteNombre}. ${cuerpo}</p>

    <table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid ${BORDE};border-radius:10px;overflow:hidden;">
      <tr><td style="padding:16px 20px;background:${GRIS_CLARO};border-bottom:1px solid ${BORDE};">
        <p style="margin:0;font-size:11px;font-weight:700;color:#9ca3af;letter-spacing:0.8px;text-transform:uppercase;">Detalle del turno</p>
      </td></tr>
      <tr><td style="padding:16px 20px;">
        <table cellpadding="0" cellspacing="0" width="100%">
          ${filaDetalle("Médico", `Dr/a. ${data.medicoNombre}`)}
          ${filaDetalle("Especialidad", data.medicoEspecialidad)}
          ${filaDetalle("Fecha", data.fecha)}
          ${filaDetalle("Hora", data.hora)}
        </table>
      </td></tr>
    </table>

    ${boton(es10min ? "Ingresar a la sala ahora" : "Ver mi turno", data.urlSala, es10min ? NARANJA : AZUL)}
  `;
  return wrapBase(`${titulo} — Docto`, contenido);
}
