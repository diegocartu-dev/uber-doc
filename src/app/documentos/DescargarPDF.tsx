"use client";

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
};

const tipoLabel: Record<string, string> = {
  receta: "RECETA MÉDICA",
  indicaciones: "INDICACIONES MÉDICAS",
  certificado: "CERTIFICADO MÉDICO",
};

export default function DescargarPDF({ documento }: { documento: Documento }) {
  function generar() {
    const fecha = new Date(documento.created_at).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "America/Argentina/Buenos_Aires",
    });

    const titulo = tipoLabel[documento.tipo] ?? "DOCUMENTO MÉDICO";

    const contenido = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${titulo}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 700px; margin: 40px auto; padding: 40px; color: #1a1a1a; }
    .header { text-align: center; border-bottom: 2px solid #1D9E75; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { font-size: 18px; letter-spacing: 2px; color: #1D9E75; margin: 0; }
    .header p { font-size: 12px; color: #666; margin: 4px 0; }
    .section { margin: 20px 0; }
    .section h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 6px; }
    .section p { font-size: 14px; line-height: 1.6; margin: 0; white-space: pre-wrap; }
    .paciente { background: #f8f9fa; padding: 12px 16px; border-radius: 6px; font-size: 13px; }
    .paciente .row { display: flex; justify-content: space-between; margin: 2px 0; }
    .footer { margin-top: 60px; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #e5e7eb; padding-top: 16px; }
    .firma { margin-top: 50px; text-align: right; }
    .firma .linea { border-top: 1px solid #333; width: 200px; margin-left: auto; margin-bottom: 4px; }
    .firma p { font-size: 12px; color: #666; margin: 2px 0; }
    @media print { body { margin: 0; padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>${titulo}</h1>
    <p>Uber Doc — Telemedicina</p>
    <p>${fecha}</p>
  </div>

  <div class="paciente">
    <div class="row">
      <span><strong>Paciente:</strong> ${documento.paciente_nombre}</span>
      <span><strong>${documento.paciente_cuil ? "CUIL" : "DNI"}:</strong> ${documento.paciente_cuil || documento.paciente_dni}</span>
    </div>
    ${documento.paciente_cuil && documento.paciente_dni ? `<div class="row"><span><strong>DNI:</strong> ${documento.paciente_dni}</span></div>` : ""}
  </div>

  <div class="section">
    <h3>Diagnóstico</h3>
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

  <div class="footer">
    <p>Documento generado por Uber Doc — Plataforma de telemedicina habilitada Ley 27.553</p>
    <p>ReNaPDiS: En trámite</p>
    <p>Este documento no reemplaza una consulta presencial cuando sea necesaria</p>
  </div>
</body>
</html>`;

    const blob = new Blob([contenido], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      win.onload = () => {
        win.print();
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
