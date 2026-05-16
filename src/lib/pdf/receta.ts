import PDFDocument from "pdfkit";
import path from "path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bwipjs = require("bwip-js");

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type DocumentoPDF = {
  id: string;
  tipo: "receta" | "indicaciones" | "certificado";
  diagnostico: string;
  contenido: string;
  created_at: string;
  medico_nombre: string;
  medico_especialidad: string;
  medico_matricula: string;
  medico_domicilio: string;
  paciente_nombre: string;
  paciente_dni: string;
  paciente_cuil: string;
  paciente_sexo_dni: string | null;
  paciente_fecha_nacimiento: string | null;
  paciente_tiene_cobertura: boolean;
  paciente_obra_social: string | null;
  paciente_nro_afiliado: string | null;
  paciente_plan_obra_social: string | null;
};

// ─── Constantes ───────────────────────────────────────────────────────────────

const COLORS = {
  primary: "#000000",
  secondary: "#666666",
  accent: "#378ADD",
  border: "#E0E0E0",
  bgBox: "#F5F5F5",
  footerText: "#666666",
} as const;

const MARGIN = { top: 36, right: 50, bottom: 10, left: 50 };
const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89; // A4
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN.left - MARGIN.right;

// Hallazgo 9 — Tildes correctas
const tipoLabel: Record<string, string> = {
  receta: "RECETA MÉDICA",
  indicaciones: "INDICACIONES MÉDICAS",
  certificado: "CERTIFICADO MÉDICO",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fontsDir(): string {
  return path.join(process.cwd(), "src", "fonts");
}

function formatFecha(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

// Hallazgo 8 — Hora de emisión para trazabilidad
function formatHora(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function formatFechaNacimiento(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-");
  return `${parseInt(dia)}/${parseInt(mes)}/${anio}`;
}

function generarNumeroReceta(_id: string, createdAt: string): string {
  const anio = new Date(createdAt).getFullYear();
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `REC-${anio}-${code}`;
}

async function generarBarcodePNG(texto: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    bwipjs.toBuffer(
      {
        bcid: "code128",
        text: texto,
        scale: 3,
        height: 10,
        includetext: false,
      },
      (err: string | Error, png: Buffer) => {
        if (err) reject(err);
        else resolve(png);
      }
    );
  });
}

// ─── Generador principal ─────────────────────────────────────────────────────

export async function generarRecetaPDF(doc: DocumentoPDF): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const pdf = new PDFDocument({
        size: "A4",
        margins: MARGIN,
        info: {
          Title: `${tipoLabel[doc.tipo] ?? "Documento"} - ${doc.paciente_nombre}`,
          Author: `Dr. ${doc.medico_nombre}`,
          Creator: "Docto - Telemedicina",
        },
      });

      const chunks: Buffer[] = [];
      pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
      pdf.on("end", () => resolve(Buffer.concat(chunks)));
      pdf.on("error", reject);

      // Registrar fuentes Inter
      const fonts = fontsDir();
      pdf.registerFont("Inter", path.join(fonts, "Inter-Regular.ttf"));
      pdf.registerFont("Inter-Medium", path.join(fonts, "Inter-Medium.ttf"));
      pdf.registerFont("Inter-SemiBold", path.join(fonts, "Inter-SemiBold.ttf"));
      pdf.registerFont("Inter-Bold", path.join(fonts, "Inter-Bold.ttf"));

      const titulo = tipoLabel[doc.tipo] ?? "DOCUMENTO MÉDICO";
      const esReceta = doc.tipo === "receta";

      // ─── HEADER ──────────────────────────────────────────────────────
      renderHeader(pdf, titulo, doc.created_at);

      // ─── PROFESIONAL (Hallazgo 1) ───────────────────────────────────────
      await renderProfesionalBox(pdf, doc);

      // ─── PACIENTE (Hallazgo 1) ───────────────────────────────────────
      renderPacienteBox(pdf, doc);

      // ─── DIAGNÓSTICO (Hallazgo 7, 9) ─────────────────────────────────
      pdf.moveDown(0.3);
      renderSectionLabel(pdf, "DIAGNÓSTICO");
      pdf.font("Inter").fontSize(10).fillColor(COLORS.primary);
      pdf.text(doc.diagnostico, MARGIN.left, undefined, { width: CONTENT_WIDTH });

      // ─── CONTENIDO ────────────────────────────────────────────────────
      pdf.moveDown(0.3);
      renderSectionLabel(pdf, titulo);
      pdf.font("Inter").fontSize(10).fillColor(COLORS.primary);
      pdf.text(doc.contenido, MARGIN.left, undefined, {
        width: CONTENT_WIDTH,
        lineGap: 2,
      });

      // ─── Calcular posición del footer ─────────────────────────────────
      const footerHeight = esReceta ? 125 : 50;
      const footerTopY = PAGE_HEIGHT - MARGIN.bottom - footerHeight;

      // Si el contenido ya pasó de donde debería ir la firma, agregar página
      if (pdf.y > footerTopY - 85) {
        pdf.addPage();
      }

      // ─── FIRMA (Hallazgo 5 + 10 — nombre + barcode matrícula) ─────
      await renderFirma(pdf, doc, footerTopY);

      // ─── FOOTER (Hallazgo 4 + 11 — leyendas ReNaPDiS) ───────────────
      renderFooter(pdf, doc, esReceta, footerTopY);

      // ─── BARCODE RECETA — a pie de página, centrado, abajo de todo ──
      if (esReceta) {
        const nroReceta = generarNumeroReceta(doc.id, doc.created_at);
        await renderBarcodeReceta(pdf, nroReceta);
      }

      pdf.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ─── Render functions ─────────────────────────────────────────────────────────

function renderHeader(pdf: PDFKit.PDFDocument, titulo: string, createdAt: string) {
  const fecha = formatFecha(createdAt);
  const hora = formatHora(createdAt);

  pdf.font("Inter-SemiBold").fontSize(15).fillColor(COLORS.accent);
  pdf.text(titulo, MARGIN.left, MARGIN.top, {
    width: CONTENT_WIDTH,
    align: "center",
  });

  pdf.moveDown(0.2);
  pdf.font("Inter").fontSize(9).fillColor(COLORS.secondary);
  pdf.text("Docto — Telemedicina", MARGIN.left, undefined, {
    width: CONTENT_WIDTH,
    align: "center",
  });

  // Hallazgo 8 — Fecha con hora de emisión
  pdf.moveDown(0.1);
  pdf.text(`${fecha} — ${hora} hs`, MARGIN.left, undefined, {
    width: CONTENT_WIDTH,
    align: "center",
  });

  // Línea separadora azul
  const lineY = pdf.y + 8;
  pdf
    .moveTo(MARGIN.left, lineY)
    .lineTo(PAGE_WIDTH - MARGIN.right, lineY)
    .strokeColor(COLORS.accent)
    .lineWidth(1.5)
    .stroke();

  pdf.y = lineY + 12;
}

// Bloque PROFESIONAL — barcode matrícula + nombre + especialidad + domicilio
async function renderProfesionalBox(pdf: PDFKit.PDFDocument, doc: DocumentoPDF) {
  const boxX = MARGIN.left;
  const boxWidth = CONTENT_WIDTH;
  const padding = 10;
  const titleHeight = 14;
  const lineHeight = 13;
  const fontSize = 9;
  const barcodeHeight = 22; // barcode + texto matrícula debajo
  const barcodeSpacing = 4;

  const rows: string[] = [];
  rows.push(`Dr. ${doc.medico_nombre}`);
  rows.push(`${doc.medico_especialidad} — ${doc.medico_matricula}`);
  if (doc.medico_domicilio) {
    rows.push(doc.medico_domicilio);
  }

  const boxHeight = padding * 2 + titleHeight + barcodeHeight + barcodeSpacing + rows.length * lineHeight;
  const boxY = pdf.y;

  // Fondo + borde
  pdf.roundedRect(boxX, boxY, boxWidth, boxHeight, 3).fillColor(COLORS.bgBox).fill();
  pdf.roundedRect(boxX, boxY, boxWidth, boxHeight, 3).strokeColor(COLORS.border).lineWidth(0.5).stroke();

  // Título
  let currentY = boxY + padding;
  pdf.font("Inter-SemiBold").fontSize(8).fillColor(COLORS.accent);
  pdf.text("PROFESIONAL", boxX + padding, currentY, {
    width: boxWidth - padding * 2,
    characterSpacing: 1,
  });
  currentY += titleHeight;

  // Barcode matrícula dentro de la caja
  try {
    const matriculaBarcode = await generarBarcodePNG(doc.medico_matricula);
    const barcodeWidth = 130;
    pdf.image(matriculaBarcode, boxX + padding, currentY, { width: barcodeWidth, height: 16 });
    currentY += barcodeHeight + barcodeSpacing;
  } catch {
    // Fallback sin barcode
    currentY += barcodeSpacing;
  }

  // Filas de texto
  for (let i = 0; i < rows.length; i++) {
    pdf
      .font(i === 0 ? "Inter-SemiBold" : "Inter")
      .fontSize(fontSize)
      .fillColor(COLORS.primary);
    pdf.text(rows[i], boxX + padding, currentY, {
      width: boxWidth - padding * 2,
    });
    currentY += lineHeight;
  }

  pdf.y = boxY + boxHeight + 10;
}

// Hallazgo 1 — Bloque PACIENTE en caja gris equivalente
function renderPacienteBox(pdf: PDFKit.PDFDocument, doc: DocumentoPDF) {
  const rows: Array<{ left: string; right?: string }> = [];

  rows.push({ left: doc.paciente_nombre });

  const dni = doc.paciente_dni.trim();
  const cuil = doc.paciente_cuil.trim();
  if (dni || cuil) {
    const l = dni ? `DNI: ${dni}` : "";
    const r = cuil ? `CUIL: ${cuil}` : "";
    if (l && r) rows.push({ left: l, right: r });
    else rows.push({ left: l || r });
  }

  const sexo = doc.paciente_sexo_dni
    ? `Sexo: ${doc.paciente_sexo_dni === "femenino" ? "F" : "M"}`
    : "";
  const fechaNac = doc.paciente_fecha_nacimiento
    ? `Fecha nac.: ${formatFechaNacimiento(doc.paciente_fecha_nacimiento)}`
    : "";
  if (sexo || fechaNac) {
    if (sexo && fechaNac) rows.push({ left: sexo, right: fechaNac });
    else rows.push({ left: sexo || fechaNac });
  }

  if (doc.paciente_tiene_cobertura && doc.paciente_obra_social) {
    rows.push({ left: `Obra Social: ${doc.paciente_obra_social}` });
    rows.push({ left: `Plan: ${doc.paciente_plan_obra_social ?? ""}` });
    rows.push({ left: `Nº Afiliado: ${doc.paciente_nro_afiliado ?? ""}` });
  } else {
    rows.push({ left: "Cobertura: Particular" });
  }

  renderInfoBoxTwoCol(pdf, "PACIENTE", rows);
}

// ─── Box rendering helpers ────────────────────────────────────────────────────

function renderInfoBoxTwoCol(
  pdf: PDFKit.PDFDocument,
  title: string,
  rows: Array<{ left: string; right?: string }>
) {
  const boxX = MARGIN.left;
  const boxWidth = CONTENT_WIDTH;
  const padding = 10;
  const titleHeight = 14;
  const lineHeight = 13;
  const fontSize = 9;

  const boxHeight = padding * 2 + titleHeight + rows.length * lineHeight;
  const boxY = pdf.y;

  // Fondo + borde
  pdf.roundedRect(boxX, boxY, boxWidth, boxHeight, 3).fillColor(COLORS.bgBox).fill();
  pdf.roundedRect(boxX, boxY, boxWidth, boxHeight, 3).strokeColor(COLORS.border).lineWidth(0.5).stroke();

  // Título de bloque
  let currentY = boxY + padding;
  pdf.font("Inter-SemiBold").fontSize(8).fillColor(COLORS.accent);
  pdf.text(title, boxX + padding, currentY, {
    width: boxWidth - padding * 2,
    characterSpacing: 1,
  });
  currentY += titleHeight;

  // Filas
  const halfWidth = (boxWidth - padding * 2) / 2;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const isBold = i === 0;

    pdf
      .font(isBold ? "Inter-SemiBold" : "Inter")
      .fontSize(fontSize)
      .fillColor(COLORS.primary);
    pdf.text(row.left, boxX + padding, currentY, {
      width: row.right ? halfWidth : boxWidth - padding * 2,
    });

    if (row.right) {
      pdf.text(row.right, boxX + padding + halfWidth, currentY, { width: halfWidth });
    }

    currentY += lineHeight;
  }

  pdf.y = boxY + boxHeight + 4;
}

// Hallazgo 7, 9 — Label de sección con tilde y estilo consistente
function renderSectionLabel(pdf: PDFKit.PDFDocument, label: string) {
  pdf.font("Inter-SemiBold").fontSize(9).fillColor(COLORS.accent);
  pdf.text(label, MARGIN.left, undefined, {
    width: CONTENT_WIDTH,
    characterSpacing: 1,
  });
  pdf.moveDown(0.15);
}

// Hallazgo 5 + 10 — Firma: línea + nombre + barcode matrícula + matrícula texto
// Posicionada justo arriba del footer, alineada a la derecha
async function renderFirma(pdf: PDFKit.PDFDocument, doc: DocumentoPDF, footerTopY: number) {
  // El bloque firma ocupa ~65pt (línea + nombre + barcode + matrícula)
  // Se posiciona justo arriba del footer con 10pt de margen
  const firmaBlockHeight = 65;
  const firmaY = footerTopY - firmaBlockHeight - 10;
  const firmaWidth = 200;
  const lineX = PAGE_WIDTH - MARGIN.right - firmaWidth;
  const lineEndX = PAGE_WIDTH - MARGIN.right;

  // Línea de firma
  pdf
    .moveTo(lineX, firmaY)
    .lineTo(lineEndX, firmaY)
    .strokeColor(COLORS.primary)
    .lineWidth(0.5)
    .stroke();

  // Nombre del médico
  pdf.font("Inter").fontSize(9).fillColor(COLORS.secondary);
  pdf.text(`Dr. ${doc.medico_nombre}`, lineX, firmaY + 5, {
    width: firmaWidth,
    align: "center",
  });

  // Hallazgo 10 — Barcode Code128 de matrícula debajo del nombre
  const barcodeY = firmaY + 20;
  try {
    const matriculaBarcode = await generarBarcodePNG(doc.medico_matricula);
    const barcodeWidth = 120;
    const barcodeX = lineX + (firmaWidth - barcodeWidth) / 2;
    pdf.image(matriculaBarcode, barcodeX, barcodeY, { width: barcodeWidth, height: 18 });

    // Matrícula como texto debajo del barcode
    pdf.font("Inter").fontSize(7).fillColor(COLORS.secondary);
    pdf.text(doc.medico_matricula, lineX, barcodeY + 20, {
      width: firmaWidth,
      align: "center",
    });
  } catch {
    // Fallback sin barcode: solo texto matrícula
    pdf.font("Inter").fontSize(8).fillColor(COLORS.secondary);
    pdf.text(doc.medico_matricula, lineX, barcodeY, {
      width: firmaWidth,
      align: "center",
    });
  }
}

// Barcode de receta — centrado a pie de página, abajo de todo (después del footer)
async function renderBarcodeReceta(pdf: PDFKit.PDFDocument, nroReceta: string) {
  const barcodeY = pdf.y + 8;

  try {
    const barcodePng = await generarBarcodePNG(nroReceta);
    const barcodeWidth = 140;
    pdf.image(barcodePng, PAGE_WIDTH / 2 - barcodeWidth / 2, barcodeY, {
      width: barcodeWidth,
      height: 18,
    });

    pdf.font("Inter").fontSize(7).fillColor(COLORS.secondary);
    pdf.text(nroReceta, MARGIN.left, barcodeY + 20, {
      width: CONTENT_WIDTH,
      align: "center",
      characterSpacing: 0.5,
    });
  } catch {
    pdf.font("Inter").fontSize(7).fillColor(COLORS.secondary);
    pdf.text(nroReceta, MARGIN.left, barcodeY, {
      width: CONTENT_WIDTH,
      align: "center",
    });
  }
}

// ─── Hallazgo 4 — Footer completo con Sección A + Sección B ──────────────────

function renderFooter(
  pdf: PDFKit.PDFDocument,
  doc: DocumentoPDF,
  esReceta: boolean,
  footerTopY: number
) {
  let y = footerTopY;

  if (esReceta) {
    // ─── Sección A — Leyendas obligatorias ReNaPDiS ──────────────────

    // Línea separadora superior
    pdf
      .moveTo(MARGIN.left, y)
      .lineTo(PAGE_WIDTH - MARGIN.right, y)
      .strokeColor(COLORS.border)
      .lineWidth(0.5)
      .stroke();
    y += 6;

    // Leyenda 1: Firma electrónica
    pdf.font("Inter").fontSize(8).fillColor(COLORS.primary);
    pdf.text(
      `Este documento ha sido firmado —electrónica o digitalmente según corresponda— por Dr. ${doc.medico_nombre}.`,
      MARGIN.left, y,
      { width: CONTENT_WIDTH, align: "center" }
    );
    y = pdf.y + 4;

    // Leyenda 2: ReNaPDiS
    const renapdisRL = process.env.RENAPDIS_RL_NUMBER;

    const leyendaRenapdis = renapdisRL
      ? `Esta receta fue creada por un emisor inscripto y validado en el Registro de Recetarios Electrónicos del Ministerio de Salud de la Nación - ${renapdisRL}`
      : `Esta receta fue creada por un emisor inscripto en el Registro de Recetarios Electrónicos del Ministerio de Salud de la Nación — Inscripción en trámite (EX-2026-41816871-APN-SSVEIYES#MS)`;

    pdf.font("Inter").fontSize(8).fillColor(COLORS.primary);
    pdf.text(
      leyendaRenapdis,
      MARGIN.left, y,
      { width: CONTENT_WIDTH, align: "center" }
    );
    y = pdf.y + 4;

    // Línea separadora inferior
    pdf
      .moveTo(MARGIN.left, y)
      .lineTo(PAGE_WIDTH - MARGIN.right, y)
      .strokeColor(COLORS.border)
      .lineWidth(0.5)
      .stroke();
    y += 6;
  } else {
    // Para no-recetas: línea separadora simple
    pdf
      .moveTo(MARGIN.left, y)
      .lineTo(PAGE_WIDTH - MARGIN.right, y)
      .strokeColor(COLORS.border)
      .lineWidth(0.5)
      .stroke();
    y += 6;
  }

  // ─── Sección B — Marco regulatorio (letra chica) ────────────────────

  pdf.font("Inter").fontSize(6.5).fillColor(COLORS.footerText);

  // Ley habilitante + firma electrónica en una sola línea
  const seccionB = esReceta
    ? "Documento emitido por Docto — Plataforma de telemedicina habilitada por Ley 27.553 y Decreto 63/2024. Firma electrónica con validez legal según Ley 25.506."
    : "Documento emitido por Docto — Plataforma de telemedicina habilitada por Ley 27.553 y Decreto 63/2024.";

  pdf.text(seccionB, MARGIN.left, y, { width: CONTENT_WIDTH, align: "center" });
  y = pdf.y + 2;

  // Disclaimer final
  pdf.text(
    "Este documento no reemplaza una consulta presencial cuando sea necesaria.",
    MARGIN.left, y,
    { width: CONTENT_WIDTH, align: "center" }
  );
}
