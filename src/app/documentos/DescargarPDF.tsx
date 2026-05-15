"use client";

import { useState } from "react";

type Documento = {
  id: string;
  tipo: string;
};

export default function DescargarPDF({ documento }: { documento: Documento }) {
  const [loading, setLoading] = useState(false);

  async function descargar() {
    if (loading) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/documentos/${documento.id}/pdf`);

      if (!res.ok) {
        throw new Error(`Error ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      // Abrir en nueva pestaña para que el usuario vea el PDF
      // y pueda imprimir/guardar desde el visor del browser
      window.open(url, "_blank");

      // Limpiar después de un delay
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      console.error("Error descargando PDF:", err);
      // Fallback: abrir directo en nueva pestaña
      window.open(`/api/documentos/${documento.id}/pdf`, "_blank");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={descargar}
      disabled={loading}
      className="shrink-0 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-200 disabled:opacity-50"
    >
      {loading ? "Generando..." : "Descargar PDF"}
    </button>
  );
}
