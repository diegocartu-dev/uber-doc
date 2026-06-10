"use client";

import { useState } from "react";

type Documento = {
  id: string;
};

export default function DescargarPDF({ documento }: { documento: Documento }) {
  const [abriendo, setAbriendo] = useState(false);

  // Enlace nativo en vez de fetch + blob + window.open.
  //
  // El patrón anterior (fetch → blob → window.open) se rompía en Safari iOS:
  // `window.open()` llamado DESPUÉS de un `await` ya no está dentro del gesto
  // del usuario, así que iOS lo bloquea como popup y no abre nada. El paciente
  // tocaba "Descargar PDF" y no pasaba nada.
  //
  // Un <a> con href directo es una navegación sincrónica (sí cuenta como gesto
  // del usuario), por lo que iOS la permite. El endpoint ya devuelve el PDF con
  // `Content-Disposition: inline` + `application/pdf`, así que el navegador lo
  // abre en su visor nativo, desde donde el usuario puede guardar o compartir.
  return (
    <a
      href={`/api/documentos/${documento.id}/pdf`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        // Solo feedback visual — NO preventDefault: dejamos que la navegación
        // nativa proceda (es lo que funciona en iOS).
        setAbriendo(true);
        setTimeout(() => setAbriendo(false), 4000);
      }}
      className="shrink-0 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-200"
    >
      {abriendo ? "Abriendo…" : "Descargar PDF"}
    </a>
  );
}
