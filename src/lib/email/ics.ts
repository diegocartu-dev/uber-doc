// Generador de archivos .ics para adjuntar a emails
// RFC 5545 — iCalendar

export type DatosICS = {
  uid: string;            // identificador único del evento (ej: turno-uuid)
  dtstart: string;        // ISO 8601 en UTC: "2026-04-20T14:00:00Z"
  dtend: string;          // ISO 8601 en UTC: "2026-04-20T14:30:00Z"
  summary: string;        // "Consulta con Dr. García - Docto"
  description: string;   // "Consulta médica virtual. Ingresá a: https://..."
  location: string;       // URL de la sala
  organizerEmail: string; // "no-reply@docto.com.ar"
  organizerName: string;  // "Docto"
};

// Formatea fecha ISO a formato iCal: YYYYMMDDTHHMMSSZ
function formatICalDate(iso: string): string {
  return iso
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "")
    .slice(0, 15) + "Z";
}

// Escapa caracteres especiales en valores iCal
function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export function generarICSConfirmacion(datos: DatosICS): string {
  const now = formatICalDate(new Date().toISOString());
  const start = formatICalDate(datos.dtstart);
  const end = formatICalDate(datos.dtend);

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Docto//Telemedicina//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${datos.uid}@docto.com.ar`,
    `DTSTAMP:${now}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeICalText(datos.summary)}`,
    `DESCRIPTION:${escapeICalText(datos.description)}`,
    `LOCATION:${escapeICalText(datos.location)}`,
    `ORGANIZER;CN=${escapeICalText(datos.organizerName)}:MAILTO:${datos.organizerEmail}`,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Recordatorio: consulta en 1 hora",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function generarICSCancelacion(datos: DatosICS): string {
  const now = formatICalDate(new Date().toISOString());
  const start = formatICalDate(datos.dtstart);
  const end = formatICalDate(datos.dtend);

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Docto//Telemedicina//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:CANCEL",
    "BEGIN:VEVENT",
    `UID:${datos.uid}@docto.com.ar`,
    `DTSTAMP:${now}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeICalText(datos.summary)}`,
    `DESCRIPTION:${escapeICalText(datos.description)}`,
    `LOCATION:${escapeICalText(datos.location)}`,
    `ORGANIZER;CN=${escapeICalText(datos.organizerName)}:MAILTO:${datos.organizerEmail}`,
    "STATUS:CANCELLED",
    "SEQUENCE:1",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
