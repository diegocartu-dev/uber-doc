// Endpoint de prueba — SOLO PARA TESTING, eliminar antes de mergear a main
// Envía los 5 tipos de email a una dirección de prueba usando datos mock

import { NextResponse } from "next/server";
import { getResendClient } from "@/lib/email/client";
import {
  turnoConfirmado,
  consultaConfirmada,
  turnoCancelado,
  documentosDisponibles,
  recordatorio,
} from "@/lib/email/templates";
import { generarICSConfirmacion, generarICSCancelacion } from "@/lib/email/ics";

const DEST = "diegocartu@gmail.com";
const FROM = "Docto <no-reply@docto.com.ar>";

export async function GET() {
  const resend = getResendClient();
  const resultados: Record<string, string> = {};

  const dtstart = new Date("2026-04-20T17:00:00Z").toISOString();
  const dtend   = new Date("2026-04-20T17:30:00Z").toISOString();

  const icsConfirmacion = generarICSConfirmacion({
    uid: "test-turno-001",
    dtstart,
    dtend,
    summary: "Consulta con Dr. María García - Docto",
    description: "Consulta médica virtual. Ingresá a: https://docto.com.ar/turno/test/espera",
    location: "https://docto.com.ar/turno/test/espera",
    organizerEmail: "no-reply@docto.com.ar",
    organizerName: "Docto",
  });

  const icsCancelacion = generarICSCancelacion({
    uid: "test-turno-001",
    dtstart,
    dtend,
    summary: "Consulta con Dr. María García - Docto",
    description: "Turno cancelado.",
    location: "https://docto.com.ar/turno/test/espera",
    organizerEmail: "no-reply@docto.com.ar",
    organizerName: "Docto",
  });

  // 1 — Turno confirmado (CP)
  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: DEST,
      subject: "[TEST] Turno confirmado con Dr. María García — lunes 20 de abril de 2026",
      html: turnoConfirmado({
        pacienteNombre: "Diego Cartu",
        medicoNombre: "María García",
        medicoEspecialidad: "Medicina General",
        fecha: "lunes 20 de abril de 2026",
        hora: "14:00",
        urlSala: "https://docto.com.ar/turno/test/espera",
      }),
      attachments: [{
        filename: "turno-docto.ics",
        content: Buffer.from(icsConfirmacion).toString("base64"),
      }],
    });
    resultados["turno_confirmado"] = error ? `ERROR: ${error.message}` : "OK";
  } catch (e) {
    resultados["turno_confirmado"] = `EXCEPTION: ${e}`;
  }

  // 2 — Consulta inmediata confirmada (CI)
  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: DEST,
      subject: "[TEST] Tu consulta con Dr. María García está lista",
      html: consultaConfirmada({
        pacienteNombre: "Diego Cartu",
        medicoNombre: "María García",
        medicoEspecialidad: "Medicina General",
        urlSala: "https://docto.com.ar/consulta/test/sala",
      }),
    });
    resultados["consulta_confirmada"] = error ? `ERROR: ${error.message}` : "OK";
  } catch (e) {
    resultados["consulta_confirmada"] = `EXCEPTION: ${e}`;
  }

  // 3 — Turno cancelado por médico
  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: DEST,
      subject: "[TEST] Turno cancelado — Dr. María García (lunes 20 de abril de 2026)",
      html: turnoCancelado({
        pacienteNombre: "Diego Cartu",
        medicoNombre: "María García",
        medicoEspecialidad: "Medicina General",
        fecha: "lunes 20 de abril de 2026",
        hora: "14:00",
        quienCancelo: "medico",
        urlReprogramar: "https://docto.com.ar/dr/dra-garcia",
      }),
      attachments: [{
        filename: "cancelacion-docto.ics",
        content: Buffer.from(icsCancelacion).toString("base64"),
      }],
    });
    resultados["cancelado_medico"] = error ? `ERROR: ${error.message}` : "OK";
  } catch (e) {
    resultados["cancelado_medico"] = `EXCEPTION: ${e}`;
  }

  // 4 — Documentos disponibles
  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: DEST,
      subject: "[TEST] Tus documentos médicos están disponibles — Docto",
      html: documentosDisponibles({
        pacienteNombre: "Diego Cartu",
        medicoNombre: "María García",
        urlDocumentos: "https://docto.com.ar/documentos",
      }),
    });
    resultados["documentos_disponibles"] = error ? `ERROR: ${error.message}` : "OK";
  } catch (e) {
    resultados["documentos_disponibles"] = `EXCEPTION: ${e}`;
  }

  // 5 — Recordatorio 10 min
  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: DEST,
      subject: "[TEST] Tu consulta empieza en 10 minutos — Docto",
      html: recordatorio({
        pacienteNombre: "Diego Cartu",
        medicoNombre: "María García",
        medicoEspecialidad: "Medicina General",
        fecha: "lunes 20 de abril de 2026",
        hora: "14:00",
        tipo: "10min",
        urlSala: "https://docto.com.ar/turno/test/espera",
      }),
    });
    resultados["recordatorio_10min"] = error ? `ERROR: ${error.message}` : "OK";
  } catch (e) {
    resultados["recordatorio_10min"] = `EXCEPTION: ${e}`;
  }

  const todosOK = Object.values(resultados).every((v) => v === "OK");

  return NextResponse.json({
    destino: DEST,
    resultados,
    resumen: todosOK ? "✅ Los 5 emails enviados correctamente" : "⚠️ Algunos emails fallaron — revisar resultados",
  });
}
