"use client";

import * as bwipjs from "bwip-js/browser";

type Documento = {
  id: string;
  tipo: string;
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
  paciente_sexo_dni?: string | null;
  paciente_fecha_nacimiento?: string | null;
  paciente_obra_social?: string | null;
  paciente_nro_afiliado?: string | null;
  paciente_tiene_cobertura?: boolean | null;
};

const tipoLabel: Record<string, string> = {
  receta: "RECETA MEDICA",
  indicaciones: "INDICACIONES MEDICAS",
  certificado: "CERTIFICADO MEDICO",
};

function formatFechaNacimiento(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-");
  return `${parseInt(dia)}/${parseInt(mes)}/${anio}`;
}

function generarNumeroReceta(id: string, createdAt: string): string {
  const anio = new Date(createdAt).getFullYear();
  const hash = id.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `REC-${anio}-${hash}`;
}

function generarBarcodeDataUrl(texto: string): string {
  const canvas = document.createElement("canvas");
  bwipjs.toCanvas(canvas, {
    bcid: "code128",
    text: texto,
    scale: 3,
    height: 10,
    includetext: true,
    textxalign: "center",
    textsize: 9,
  });
  return canvas.toDataURL("image/png");
}

export default function DescargarPDF({ documento }: { documento: Documento }) {
  function generar() {
    const fecha = new Date(documento.created_at).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "America/Argentina/Buenos_Aires",
    });

    const titulo = tipoLabel[documento.tipo] ?? "DOCUMENTO MEDICO";
    const nroReceta = generarNumeroReceta(documento.id, documento.created_at);
    const barcodeDataUrl = generarBarcodeDataUrl(nroReceta);

    // Bloque paciente extra: sexo, fecha nac, cobertura
    const sexoLine = documento.paciente_sexo_dni
      ? `<div class="row"><span><strong>Sexo (DNI):</strong> ${documento.paciente_sexo_dni === "femenino" ? "F" : "M"}</span>${documento.paciente_fecha_nacimiento ? `<span><strong>Fecha nac.:</strong> ${formatFechaNacimiento(documento.paciente_fecha_nacimiento)}</span>` : ""}</div>`
      : (documento.paciente_fecha_nacimiento
        ? `<div class="row"><span><strong>Fecha nac.:</strong> ${formatFechaNacimiento(documento.paciente_fecha_nacimiento)}</span></div>`
        : "");

    const coberturaTexto = documento.paciente_tiene_cobertura && documento.paciente_obra_social
      ? documento.paciente_obra_social + (documento.paciente_nro_afiliado ? ` — Af. ${documento.paciente_nro_afiliado}` : "")
      : "Particular";

    const coberturaLine = `<div class="row"><span><strong>Cobertura:</strong> ${coberturaTexto}</span></div>`;

    const contenido = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${titulo}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 700px; margin: 40px auto; padding: 40px; color: #1a1a1a; }
    .header { text-align: center; border-bottom: 2px solid #1D9E75; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { font-size: 18px; letter-spacing: 2px; color: #1D9E75; margin: 0; font-weight: 600; }
    .header p { font-size: 12px; color: #666; margin: 4px 0; }
    .section { margin: 20px 0; }
    .section h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 6px; font-weight: 600; }
    .section p { font-size: 14px; line-height: 1.6; margin: 0; white-space: pre-wrap; }
    .paciente { background: #f8f9fa; padding: 12px 16px; border-radius: 6px; font-size: 13px; }
    .paciente .row { display: flex; justify-content: space-between; margin: 2px 0; }
    .footer { margin-top: 60px; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #e5e7eb; padding-top: 16px; }
    .firma { margin-top: 50px; text-align: right; }
    .firma .linea { border-top: 1px solid #333; width: 200px; margin-left: auto; margin-bottom: 4px; }
    .firma p { font-size: 12px; color: #666; margin: 2px 0; }
    .barcode { margin-top: 40px; text-align: center; }
    .barcode img { max-width: 240px; height: auto; }
    .barcode .nro { font-size: 10px; color: #999; margin-top: 4px; }
    .no-print { margin: 30px auto 0; display: block; padding: 10px 24px; background: #378ADD; color: white; border: none; border-radius: 8px; font-size: 14px; font-family: 'Inter', sans-serif; font-weight: 500; cursor: pointer; }
    .no-print:hover { background: #2d7bc4; }
    @media print { body { margin: 0; padding: 20px; } .no-print { display: none !important; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>${titulo}</h1>
    <p>Docto — Telemedicina</p>
    <p>${fecha}</p>
  </div>

  <div class="paciente">
    <div class="row">
      <span><strong>Paciente:</strong> ${documento.paciente_nombre}</span>
      <span><strong>${documento.paciente_cuil ? "CUIL" : "DNI"}:</strong> ${documento.paciente_cuil || documento.paciente_dni}</span>
    </div>
    ${documento.paciente_cuil && documento.paciente_dni ? `<div class="row"><span><strong>DNI:</strong> ${documento.paciente_dni}</span></div>` : ""}
    ${sexoLine}
    ${coberturaLine}
  </div>

  <div class="section">
    <h3>Diagnostico</h3>
    <p>${documento.diagnostico}</p>
  </div>

  <div class="section">
    <h3>${tipoLabel[documento.tipo] ?? "Contenido"}</h3>
    <p>${documento.contenido}</p>
  </div>

  <div class="firma">
    <div class="linea"></div>
    <p>Dr. ${documento.medico_nombre}</p>
    <p>${documento.medico_especialidad} — ${documento.medico_matricula}</p>
    ${documento.medico_domicilio ? `<p>${documento.medico_domicilio}</p>` : ""}
  </div>

  <div class="barcode">
    <img src="${barcodeDataUrl}" alt="Código de barras ${nroReceta}" />
    <div class="nro">${nroReceta}</div>
  </div>

  <div class="footer">
    <p>Documento generado por Docto — Plataforma de telemedicina habilitada Ley 27.553</p>
    <p>ReNaPDiS: En trámite</p>
    <p>Este documento no reemplaza una consulta presencial cuando sea necesaria</p>
  </div>

  <button class="no-print" onclick="window.print()">Imprimir / Guardar como PDF</button>
</body>
</html>`;

    const blob = new Blob([contenido], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      win.onload = () => {
        URL.revokeObjectURL(url);
      };
    }
  }

  return (
    <button
      onClick={generar}
      className="shrink-0 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-200"
    >
      Descargar PDF
    </button>
  );
}
