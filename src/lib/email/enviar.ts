// Sistema de emails transaccionales de Docto
// Solo pacientes reciben emails. Médicos nunca.
// Regla de error: nunca lanzar excepciones. Si falla, loguear y seguir.
// Uso: enviarEmailXxx(id).catch(console.error)  — fire and forget

import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "./client";
import { generarICSConfirmacion, generarICSCancelacion } from "./ics";
import {
  turnoConfirmado,
  consultaConfirmada,
  turnoCancelado,
  documentosDisponibles,
  recordatorio,
} from "./templates";

const FROM = "no-reply@docto.com.ar";
const NOMBRE_REMITENTE = "Docto";

// ─── Helpers ────────────────────────────────────────────────────────────────

// Formatea fecha "2026-04-20" → "lunes 20 de abril de 2026"
function formatearFecha(fechaStr: string): string {
  // Agregar T12:00:00 para evitar desfases de timezone al parsear YYYY-MM-DD
  const d = new Date(fechaStr + "T12:00:00");
  return d.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

// Formatea "14:30:00" → "14:30"
function formatearHora(horaStr: string): string {
  return horaStr.slice(0, 5);
}

// Convierte fecha "2026-04-20" + hora "14:30:00" a ISO UTC
// Argentina = UTC-3 (sin horario de verano desde 2009)
function fechaHoraToISO(fecha: string, hora: string): string {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const [hh, mm] = hora.split(":").map(Number);
  // UTC-3: sumar 3 horas
  const utcHora = hh + 3;
  return new Date(Date.UTC(anio, mes - 1, dia, utcHora, mm, 0)).toISOString();
}

type DatosTurnoCompleto = {
  id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  monto: number;
  paciente_id: string;         // pacientes.id (UUID interno)
  paciente_user_id: string;    // auth.users.id
  paciente_nombre: string;
  paciente_apellido: string;
  medico_nombre: string;
  medico_apellido: string;
  medico_especialidad: string;
  medico_slug: string | null;
};

async function obtenerDatosTurno(turnoId: string): Promise<DatosTurnoCompleto | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("turnos")
    .select(`
      id,
      fecha,
      hora_inicio,
      hora_fin,
      monto,
      paciente_id,
      medicos!medico_id (
        nombre,
        apellido,
        especialidad,
        slug
      ),
      pacientes!paciente_id (
        id,
        user_id,
        nombre,
        apellido
      )
    `)
    .eq("id", turnoId)
    .single();

  if (error || !data) return null;

  const medico = Array.isArray(data.medicos) ? data.medicos[0] : data.medicos;
  const paciente = Array.isArray(data.pacientes) ? data.pacientes[0] : data.pacientes;

  if (!medico || !paciente) return null;

  return {
    id: data.id,
    fecha: data.fecha,
    hora_inicio: data.hora_inicio,
    hora_fin: data.hora_fin,
    monto: data.monto,
    paciente_id: paciente.id,
    paciente_user_id: paciente.user_id,
    paciente_nombre: paciente.nombre,
    paciente_apellido: paciente.apellido,
    medico_nombre: medico.nombre,
    medico_apellido: medico.apellido,
    medico_especialidad: medico.especialidad ?? "",
    medico_slug: medico.slug ?? null,
  };
}

async function obtenerEmailUsuario(userId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data: { user }, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !user?.email) return null;
  return user.email;
}

// ─── Enviar email con turno confirmado (CP) ──────────────────────────────────

export async function enviarEmailTurnoConfirmado(turnoId: string): Promise<void> {
  try {
    const datos = await obtenerDatosTurno(turnoId);
    if (!datos) return;

    const email = await obtenerEmailUsuario(datos.paciente_user_id);
    if (!email) return;

    const urlSala = `https://docto.com.ar/turno/${turnoId}/espera`;
    const medicoNombreCompleto = `${datos.medico_nombre} ${datos.medico_apellido}`;
    const pacienteNombreCompleto = `${datos.paciente_nombre} ${datos.paciente_apellido}`;
    const fechaLegible = formatearFecha(datos.fecha);
    const horaLegible = formatearHora(datos.hora_inicio);

    const icsContent = generarICSConfirmacion({
      uid: `turno-${turnoId}`,
      dtstart: fechaHoraToISO(datos.fecha, datos.hora_inicio),
      dtend: fechaHoraToISO(datos.fecha, datos.hora_fin),
      summary: `Consulta con Dr. ${medicoNombreCompleto} - Docto`,
      description: `Consulta médica virtual con Dr. ${medicoNombreCompleto}. Ingresá a: ${urlSala}`,
      location: urlSala,
      organizerEmail: FROM,
      organizerName: NOMBRE_REMITENTE,
    });

    const html = turnoConfirmado({
      pacienteNombre: pacienteNombreCompleto,
      medicoNombre: medicoNombreCompleto,
      medicoEspecialidad: datos.medico_especialidad,
      fecha: fechaLegible,
      hora: horaLegible,
      urlSala,
    });

    await getResendClient().emails.send({
      from: `${NOMBRE_REMITENTE} <${FROM}>`,
      to: email,
      subject: `Turno confirmado con Dr. ${medicoNombreCompleto} — ${fechaLegible}`,
      html,
      attachments: [
        {
          filename: "turno-docto.ics",
          content: Buffer.from(icsContent).toString("base64"),
        },
      ],
    });
  } catch (err) {
    console.error("[email] enviarEmailTurnoConfirmado falló:", err);
  }
}

// ─── Enviar email con consulta inmediata confirmada (CI) ─────────────────────

export async function enviarEmailConsultaConfirmada(consultaId: string): Promise<void> {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("consultas")
      .select(`
        id,
        paciente_id,
        medicos!medico_id (
          nombre,
          apellido,
          especialidad
        )
      `)
      .eq("id", consultaId)
      .single();

    if (error || !data) return;

    const medico = Array.isArray(data.medicos) ? data.medicos[0] : data.medicos;
    if (!medico) return;

    // paciente_id en consultas referencia auth.users.id directamente
    const email = await obtenerEmailUsuario(data.paciente_id);
    if (!email) return;

    // Para el nombre del paciente, buscar en tabla pacientes
    const { data: paciente } = await supabase
      .from("pacientes")
      .select("nombre, apellido")
      .eq("user_id", data.paciente_id)
      .maybeSingle();

    const pacienteNombre = paciente
      ? `${paciente.nombre} ${paciente.apellido}`
      : email;

    const medicoNombreCompleto = `${medico.nombre} ${medico.apellido}`;
    const urlSala = `https://docto.com.ar/consulta/${consultaId}/sala`;

    const html = consultaConfirmada({
      pacienteNombre,
      medicoNombre: medicoNombreCompleto,
      medicoEspecialidad: medico.especialidad ?? "",
      urlSala,
    });

    await getResendClient().emails.send({
      from: `${NOMBRE_REMITENTE} <${FROM}>`,
      to: email,
      subject: `Tu consulta con Dr. ${medicoNombreCompleto} está lista`,
      html,
    });
  } catch (err) {
    console.error("[email] enviarEmailConsultaConfirmada falló:", err);
  }
}

// ─── Enviar email de turno cancelado (por médico o paciente) ─────────────────

export async function enviarEmailTurnoCancelado(
  turnoId: string,
  canceladoPor: "medico" | "paciente"
): Promise<void> {
  try {
    const datos = await obtenerDatosTurno(turnoId);
    if (!datos) return;

    const email = await obtenerEmailUsuario(datos.paciente_user_id);
    if (!email) return;

    const urlSala = `https://docto.com.ar/turno/${turnoId}/espera`;
    const medicoNombreCompleto = `${datos.medico_nombre} ${datos.medico_apellido}`;
    const pacienteNombreCompleto = `${datos.paciente_nombre} ${datos.paciente_apellido}`;
    const fechaLegible = formatearFecha(datos.fecha);
    const horaLegible = formatearHora(datos.hora_inicio);

    const urlReprogramar = datos.medico_slug
      ? `https://docto.com.ar/dr/${datos.medico_slug}`
      : "https://docto.com.ar";

    const icsContent = generarICSCancelacion({
      uid: `turno-${turnoId}`,
      dtstart: fechaHoraToISO(datos.fecha, datos.hora_inicio),
      dtend: fechaHoraToISO(datos.fecha, datos.hora_fin),
      summary: `Consulta con Dr. ${medicoNombreCompleto} - Docto`,
      description: `Turno cancelado. Para reprogramar: ${urlReprogramar}`,
      location: urlSala,
      organizerEmail: FROM,
      organizerName: NOMBRE_REMITENTE,
    });

    const html = turnoCancelado({
      pacienteNombre: pacienteNombreCompleto,
      medicoNombre: medicoNombreCompleto,
      medicoEspecialidad: datos.medico_especialidad,
      fecha: fechaLegible,
      hora: horaLegible,
      quienCancelo: canceladoPor,
      urlReprogramar,
    });

    const asunto =
      canceladoPor === "medico"
        ? `Turno cancelado — Dr. ${medicoNombreCompleto} (${fechaLegible})`
        : `Confirmación de cancelación — turno del ${fechaLegible}`;

    await getResendClient().emails.send({
      from: `${NOMBRE_REMITENTE} <${FROM}>`,
      to: email,
      subject: asunto,
      html,
      attachments: [
        {
          filename: "cancelacion-docto.ics",
          content: Buffer.from(icsContent).toString("base64"),
        },
      ],
    });
  } catch (err) {
    console.error("[email] enviarEmailTurnoCancelado falló:", err);
  }
}

// ─── Enviar email de documentos disponibles ──────────────────────────────────

export async function enviarEmailDocumentosDisponibles(
  tipo: "turno" | "consulta",
  id: string
): Promise<void> {
  try {
    const supabase = createAdminClient();
    const urlDocumentos = "https://docto.com.ar/documentos";

    if (tipo === "turno") {
      const datos = await obtenerDatosTurno(id);
      if (!datos) return;

      const email = await obtenerEmailUsuario(datos.paciente_user_id);
      if (!email) return;

      const medicoNombreCompleto = `${datos.medico_nombre} ${datos.medico_apellido}`;
      const pacienteNombreCompleto = `${datos.paciente_nombre} ${datos.paciente_apellido}`;

      const html = documentosDisponibles({
        pacienteNombre: pacienteNombreCompleto,
        medicoNombre: medicoNombreCompleto,
        urlDocumentos,
      });

      await getResendClient().emails.send({
        from: `${NOMBRE_REMITENTE} <${FROM}>`,
        to: email,
        subject: `Tus documentos médicos están disponibles — Docto`,
        html,
      });
    } else {
      // Consulta inmediata
      const { data, error } = await supabase
        .from("consultas")
        .select(`
          id,
          paciente_id,
          medicos!medico_id (
            nombre,
            apellido
          )
        `)
        .eq("id", id)
        .single();

      if (error || !data) return;

      const medico = Array.isArray(data.medicos) ? data.medicos[0] : data.medicos;
      if (!medico) return;

      const email = await obtenerEmailUsuario(data.paciente_id);
      if (!email) return;

      const { data: paciente } = await supabase
        .from("pacientes")
        .select("nombre, apellido")
        .eq("user_id", data.paciente_id)
        .maybeSingle();

      const pacienteNombre = paciente
        ? `${paciente.nombre} ${paciente.apellido}`
        : email;

      const medicoNombreCompleto = `${medico.nombre} ${medico.apellido}`;

      const html = documentosDisponibles({
        pacienteNombre,
        medicoNombre: medicoNombreCompleto,
        urlDocumentos,
      });

      await getResendClient().emails.send({
        from: `${NOMBRE_REMITENTE} <${FROM}>`,
        to: email,
        subject: `Tus documentos médicos están disponibles — Docto`,
        html,
      });
    }
  } catch (err) {
    console.error("[email] enviarEmailDocumentosDisponibles falló:", err);
  }
}

// ─── Recordatorio (24h y 10min) — sin trigger por ahora ─────────────────────
// Implementación lista. Se engancha cuando llegue Vercel Cron (Sprint 2).

export async function enviarEmailRecordatorio(
  turnoId: string,
  tipo: "24h" | "10min"
): Promise<void> {
  try {
    const datos = await obtenerDatosTurno(turnoId);
    if (!datos) return;

    const email = await obtenerEmailUsuario(datos.paciente_user_id);
    if (!email) return;

    const urlSala = `https://docto.com.ar/turno/${turnoId}/espera`;
    const medicoNombreCompleto = `${datos.medico_nombre} ${datos.medico_apellido}`;
    const pacienteNombreCompleto = `${datos.paciente_nombre} ${datos.paciente_apellido}`;

    const html = recordatorio({
      pacienteNombre: pacienteNombreCompleto,
      medicoNombre: medicoNombreCompleto,
      medicoEspecialidad: datos.medico_especialidad,
      fecha: formatearFecha(datos.fecha),
      hora: formatearHora(datos.hora_inicio),
      tipo,
      urlSala,
    });

    const asunto =
      tipo === "10min"
        ? `Tu consulta empieza en 10 minutos — Docto`
        : `Recordatorio: consulta mañana con Dr. ${medicoNombreCompleto}`;

    await getResendClient().emails.send({
      from: `${NOMBRE_REMITENTE} <${FROM}>`,
      to: email,
      subject: asunto,
      html,
    });
  } catch (err) {
    console.error("[email] enviarEmailRecordatorio falló:", err);
  }
}
