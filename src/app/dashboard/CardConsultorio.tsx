"use client";

import { useState } from "react";
import { Building2, Copy, Check } from "lucide-react";

export default function CardConsultorio({ slug }: { slug: string }) {
  const [copiado, setCopiado] = useState(false);

  const url = `${typeof window !== "undefined" ? window.location.origin : "https://docto.com.ar"}/dr/${slug}`;

  function copiar() {
    navigator.clipboard.writeText(url);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }

  return (
    <div
      className="rounded-xl bg-white p-5"
      style={{ border: "0.5px solid #e5e7eb", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ background: "#f3f4f6" }}
        >
          <Building2 size={18} style={{ color: "#888780" }} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Tu consultorio particular</h3>
          <p className="text-xs text-gray-500">Copiá el link y compartilo con tus pacientes</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div
          className="flex-1 min-w-0 rounded-lg px-3 py-2.5 text-sm text-gray-700 truncate select-all"
          style={{ background: "#f8f9fa", border: "1px solid #e5e7eb", fontFamily: "monospace", fontSize: 13 }}
        >
          docto.com.ar/dr/{slug}
        </div>
        <button
          onClick={copiar}
          className="shrink-0 flex items-center gap-1.5 rounded-lg px-3.5 py-2.5 text-sm font-medium text-white transition-all active:scale-95"
          style={{ background: copiado ? "#1D9E75" : "#378ADD" }}
        >
          {copiado ? <Check size={15} /> : <Copy size={15} />}
          <span className="hidden sm:inline">{copiado ? "Copiado" : "Copiar"}</span>
        </button>
      </div>
    </div>
  );
}
