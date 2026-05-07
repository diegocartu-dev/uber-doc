"use client";

import { useState, useRef } from "react";

const HOURS_48 = 48 * 60 * 60 * 1000;

type Props = {
  consultaId: string;
  consultaCreatedAt: string;
};

export default function EnviarDocumentoAdicional({ consultaId, consultaCreatedAt }: Props) {
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dentro48h = (Date.now() - new Date(consultaCreatedAt).getTime()) < HOURS_48;
  if (!dentro48h) return null;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setEnviando(true);
    setMsg(null);

    try {
      const formData = new FormData();
      formData.append("consultaId", consultaId);
      formData.append("archivo", file);

      const res = await fetch("/api/consulta/enviar-documento-medico", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const data = await res.json();
      setMsg({
        texto: data.ok ? "Documento enviado al email del paciente." : (data.error || "Error al enviar."),
        ok: !!data.ok,
      });
    } catch {
      setMsg({ texto: "Error de conexión.", ok: false });
    } finally {
      setEnviando(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="mt-4 border-t pt-3" style={{ borderColor: "#e5e7eb" }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        onChange={handleFile}
        className="hidden"
      />
      <button
        type="button"
        disabled={enviando}
        onClick={() => fileInputRef.current?.click()}
        className="text-xs font-medium text-[#378ADD] hover:underline disabled:opacity-50"
        style={{ minHeight: "32px" }}
      >
        {enviando ? "Enviando..." : "Enviar documento adicional"}
      </button>
      {msg && (
        <p className={`mt-1 text-xs ${msg.ok ? "text-[#1D9E75]" : "text-[#E24B4A]"}`}>
          {msg.texto}
        </p>
      )}
    </div>
  );
}
