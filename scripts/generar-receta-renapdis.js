/**
 * Genera una receta médica PDF de ejemplo para la inscripción en ReNaPDiS.
 * Cumple con los datos mínimos obligatorios de la Resolución 2214/2025.
 *
 * Uso: node scripts/generar-receta-renapdis.js
 * Output: docs/renapdis/receta-ejemplo-renapdis.pdf
 */

const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const outDir = path.join(__dirname, "..", "docs", "renapdis");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const doc = new PDFDocument({
  size: "A4",
  margins: { top: 40, bottom: 40, left: 50, right: 50 },
  autoFirstPage: true,
  bufferPages: true, // prevent auto page breaks
});

const outPath = path.join(outDir, "receta-ejemplo-renapdis.pdf");
doc.pipe(fs.createWriteStream(outPath));

// Colors
const BRAND = "#378ADD";
const GREEN = "#1D9E75";
const DARK = "#1a1a1a";
const GRAY = "#555555";
const LGRAY = "#999999";
const BORDER = "#d0d0d0";
const BG = "#f5f7fa";

const W = doc.page.width - 100; // usable width
const L = 50; // left margin
const R = L + W; // right edge
const col2 = 290;

function line(y, color) {
  doc.moveTo(L, y).lineTo(R, y).strokeColor(color || BORDER).lineWidth(0.5).stroke();
}

function section(label, y) {
  doc.fontSize(8).font("Helvetica-Bold").fillColor(BRAND).text(label.toUpperCase(), L, y, { width: W });
  return y + 13;
}

function field(label, value, x, y, w) {
  doc.fontSize(6.5).font("Helvetica").fillColor(LGRAY).text(label, x, y, { width: w || 200 });
  doc.fontSize(9).font("Helvetica").fillColor(DARK).text(value, x, y + 8, { width: w || 200 });
  return y + 22;
}

// ═══════════════════════════════════════════
// HEADER
// ═══════════════════════════════════════════
const hY = 38;

// Stethoscope icon
doc.lineWidth(1.8).strokeColor("#6BB3E8")
  .moveTo(L + 4, hY).lineTo(L + 4, hY + 7)
  .quadraticCurveTo(L + 4, hY + 12, L + 10, hY + 12)
  .quadraticCurveTo(L + 16, hY + 12, L + 16, hY + 7)
  .lineTo(L + 16, hY).stroke();
doc.circle(L + 4, hY - 1, 1.8).fill("#378ADD");
doc.circle(L + 16, hY - 1, 1.8).fill("#378ADD");
doc.lineWidth(1.8).strokeColor("#6BB3E8").moveTo(L + 10, hY + 12).lineTo(L + 10, hY + 15).stroke();
doc.circle(L + 10, hY + 17, 2.2).fill("#E88B6A");

doc.fontSize(16).font("Helvetica-Bold").fillColor("#6BB3E8").text("Docto", L + 24, hY - 2);
doc.fontSize(7).font("Helvetica").fillColor(LGRAY).text("Plataforma de Telemedicina", L + 24, hY + 14);

doc.fontSize(12).font("Helvetica-Bold").fillColor(DARK)
  .text("RECETA MÉDICA ELECTRÓNICA", col2, hY, { width: R - col2, align: "right" });
doc.fontSize(7).font("Helvetica").fillColor(LGRAY)
  .text("Resolución 2214/2025 — Ministerio de Salud", col2, hY + 15, { width: R - col2, align: "right" });

line(68, BRAND);

// ═══════════════════════════════════════════
// DATOS DEL PROFESIONAL
// ═══════════════════════════════════════════
let y = section("Datos del profesional", 76);

field("Nombre y Apellido", "Dr. Diego González", L, y, 220);
field("Matrícula Nacional", "MN 122222", col2, y, 200);
y += 22;
field("Profesión / Especialidad", "Médico — Clínica Médica", L, y, 220);
y += 26;

// Barcode + fecha row
doc.rect(L, y, 160, 22).fillAndStroke(BG, BORDER);
doc.fontSize(6).font("Helvetica").fillColor(LGRAY).text("CÓDIGO DE BARRAS — PLACEHOLDER", L + 5, y + 3);
doc.fontSize(7).font("Helvetica-Bold").fillColor(GRAY).text("REC-2026-04-10-00001", L + 5, y + 12);

doc.fontSize(6.5).font("Helvetica").fillColor(LGRAY).text("Fecha de emisión", col2, y + 1);
doc.fontSize(9).font("Helvetica-Bold").fillColor(DARK).text("10 de abril de 2026", col2, y + 10);

doc.fontSize(6.5).font("Helvetica").fillColor(LGRAY).text("N° Receta", 420, y + 1);
doc.fontSize(9).font("Helvetica-Bold").fillColor(DARK).text("REC-00001", 420, y + 10);

y += 28;
line(y);

// ═══════════════════════════════════════════
// DATOS DEL PACIENTE
// ═══════════════════════════════════════════
y = section("Datos del paciente", y + 7);

field("Nombre y Apellido", "María Fernanda López", L, y, 220);
field("DNI", "30.456.789", col2, y, 200);
y += 22;
field("Obra Social / Plan Médico", "OSDE 310", L, y, 220);
field("N° Afiliado", "310-00456789-01", col2, y, 200);
y += 22;
field("Fecha de Nacimiento", "15 de marzo de 1988 (38 años)", L, y, 220);
y += 24;
line(y);

// ═══════════════════════════════════════════
// DIAGNÓSTICO
// ═══════════════════════════════════════════
y = section("Diagnóstico", y + 7);
doc.fontSize(9.5).font("Helvetica").fillColor(DARK)
  .text("Hipertensión arterial esencial (CIE-10: I10)", L, y, { width: W });
y = doc.y + 8;
line(y);

// ═══════════════════════════════════════════
// PRESCRIPCIÓN
// ═══════════════════════════════════════════
y = section("Prescripción", y + 7);

// Med 1
doc.rect(L, y, W, 58).fillAndStroke("#fafbfc", BORDER);
doc.fontSize(13).font("Helvetica-Bold").fillColor(BRAND).text("Rp/", L + 6, y + 5);
doc.fontSize(9.5).font("Helvetica-Bold").fillColor(DARK).text("Enalapril 10 mg", L + 35, y + 6);
doc.fontSize(8).font("Helvetica").fillColor(GRAY);
doc.text("Nombre genérico (IFA):  Enalapril maleato", L + 35, y + 18);
doc.text("Presentación:  Comprimidos ranurados x 30 unidades", L + 35, y + 28);
doc.text("Forma farmacéutica:  Comprimido", L + 35, y + 38);
doc.text("Cantidad:  2 (dos) envases", L + 35, y + 48);
y += 62;

// Med 2
doc.rect(L, y, W, 58).fillAndStroke("#fafbfc", BORDER);
doc.fontSize(13).font("Helvetica-Bold").fillColor(BRAND).text("Rp/", L + 6, y + 5);
doc.fontSize(9.5).font("Helvetica-Bold").fillColor(DARK).text("Amlodipina 5 mg", L + 35, y + 6);
doc.fontSize(8).font("Helvetica").fillColor(GRAY);
doc.text("Nombre genérico (IFA):  Amlodipina besilato", L + 35, y + 18);
doc.text("Presentación:  Comprimidos x 30 unidades", L + 35, y + 28);
doc.text("Forma farmacéutica:  Comprimido", L + 35, y + 38);
doc.text("Cantidad:  1 (un) envase", L + 35, y + 48);
y += 64;
line(y);

// ═══════════════════════════════════════════
// INDICACIONES
// ═══════════════════════════════════════════
y = section("Indicaciones", y + 7);
doc.fontSize(8.5).font("Helvetica").fillColor(DARK)
  .text(
    "1. Enalapril 10 mg: tomar 1 comprimido cada 12 horas (mañana y noche) con un vaso de agua.\n" +
    "2. Amlodipina 5 mg: tomar 1 comprimido por la mañana.\n" +
    "3. Dieta hiposódica. Evitar el consumo excesivo de sal.\n" +
    "4. Control de presión arterial domiciliario, registrar valores semanalmente.\n" +
    "5. Control en consultorio en 30 días.",
    L, y, { width: W, lineGap: 2 }
  );
y = doc.y + 10;
line(y);

// ═══════════════════════════════════════════
// FIRMA DEL PROFESIONAL
// ═══════════════════════════════════════════
y += 10;
const sigX = L + W / 2 - 65;
doc.rect(sigX, y, 130, 36).dash(3, { space: 3 }).strokeColor(BORDER).stroke();
doc.undash();
doc.fontSize(7).font("Helvetica").fillColor(LGRAY)
  .text("FIRMA DIGITAL — PLACEHOLDER", sigX + 10, y + 13, { width: 110, align: "center" });

y += 42;
doc.fontSize(9).font("Helvetica-Bold").fillColor(DARK)
  .text("Dr. Diego González", L, y, { width: W, align: "center" });
y += 12;
doc.fontSize(8).font("Helvetica").fillColor(GRAY)
  .text("Médico — Clínica Médica · MN 122222", L, y, { width: W, align: "center" });

// ═══════════════════════════════════════════
// FOOTER (absolute position, bottom of page)
// Disable bottom margin to prevent auto-pagination
// ═══════════════════════════════════════════
doc.page.margins.bottom = 0;
const fY = doc.page.height - 50;
line(fY, BORDER);
doc.fontSize(7).font("Helvetica").fillColor(GREEN)
  .text("Receta emitida por Docto — Plataforma registrada en ReNaPDiS", L, fY + 6, { width: W, align: "center", lineBreak: false });
doc.fontSize(6.5).font("Helvetica").fillColor(LGRAY)
  .text("Ley 27.553 — Recetas electrónicas · docto.com.ar · Verificación: https://docto.com.ar/verificar/REC-00001", L, fY + 17, { width: W, align: "center", lineBreak: false });

// ═══════════════════════════════════════════
doc.end();
console.log(`✅ Receta generada en 1 página: ${outPath}`);
