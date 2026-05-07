"use client";

import { useState, useRef } from "react";
import OrigenBadge from "@/components/OrigenBadge";
import { capitalizarNombre } from "@/lib/utils/texto";

type Item = {
  id: string;
  paciente_nombre: string;
  fecha: string;
  url: string;
  canal_origen?: string;
  created_at_raw?: string;
};

const HOURS_48 = 48 * 60 * 60 * 1000;

export default function HistorialInline({
  medicoId,
  tipo,
}: {
  medicoId: string;
  tipo: "consulta" | "turno";
}) {
  const [abierto, setAbierto] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [cargado, setCargado] = useState(false);
  const [enviandoId, setEnviandoId] = useState<string | null>(null);
  const [envioMsg, setEnvioMsg] = useState<{ id: string; msg: string; ok: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingConsultaRef = useRef<string | null>(null);

  async function toggle() {
    if (abierto) {
      setAbierto(false);
      return;
    }
    setAbierto(true);
    if (cargado) return;

    try {
      const res = await fetch(
        `/api/historial-inline?medicoId=${medicoId}&tipo=${tipo}`,
        { credentials: "include" }
      );
      if (!res.ok) return;
      const data: Item[] = await res.json();
      setItems(data);
      setCargado(true);
    } catch {}
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const consultaId = pendingConsultaRef.current;
    if (!file || !consultaId) return;

    setEnviandoId(consultaId);
    setEnvioMsg(null);

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
      setEnvioMsg({
        id: consultaId,
        msg: data.ok ? "Documento enviado al email del paciente." : (data.error || "Error al enviar."),
        ok: !!data.ok,
      });
    } catch {
      setEnvioMsg({ id: consultaId, msg: "Error de conexión.", ok: false });
    } finally {
      setEnviandoId(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      pendingConsultaRef.current = null;
    }
  }

  const accentColor = tipo === "turno" ? "#378ADD" : "#1D9E75";

  return (
    <div className="w-full">
      <button
        onClick={toggle}
        className="text-base font-medium transition-colors"
        style={{ color: `${accentColor}99`, }}
      >
        {abierto ? "Cerrar historial ×" : (tipo === "turno" ? "Historial de turnos →" : "Historial de consultas →")}
      </button>

      {abierto && (
        <div className="mt-3 w-full max-h-[320px] overflow-y-auto rounded-xl bg-white" style={{ border: "0.5px solid #e5e7eb", borderLeft: `3px solid ${accentColor}` }}>
          {/* Header con identidad de tipo */}
          <div className="px-4 py-2.5" style={{ borderBottom: "0.5px solid #e5e7eb", background: `${accentColor}08` }}>
            <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: accentColor }}>
              {tipo === "turno" ? "Historial de turnos" : "Historial de consultas"}
            </p>
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">
              {cargado ? (tipo === "turno" ? "Sin turnos completados" : "Sin consultas completadas") : "Cargando..."}
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={handleFileSelected}
                className="hidden"
              />
              {items.map((item) => {
                const dentro48h = tipo === "consulta" && item.created_at_raw
                  && (Date.now() - new Date(item.created_at_raw).getTime()) < HOURS_48;
                return (
                  <div key={item.id} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-base font-medium text-gray-900">{capitalizarNombre(item.paciente_nombre)}</p>
                          <OrigenBadge canalOrigen={item.canal_origen ?? null} />
                        </div>
                        <p className="text-sm text-gray-400">{item.fecha}</p>
                      </div>
                      <a
                        href={`${item.url}?desde=${tipo}`}
                        className="shrink-0 text-sm font-medium hover:underline"
                        style={{ color: accentColor }}
                      >
                        Ver documentos
                      </a>
                    </div>
                    {dentro48h && (
                      <div className="mt-2">
                        <button
                          type="button"
                          disabled={enviandoId === item.id}
                          onClick={() => {
                            pendingConsultaRef.current = item.id;
                            fileInputRef.current?.click();
                          }}
                          className="text-xs font-medium text-[#378ADD] hover:underline disabled:opacity-50"
                          style={{ minHeight: "32px" }}
                        >
                          {enviandoId === item.id ? "Enviando..." : "Enviar documento adicional"}
                        </button>
                        {envioMsg?.id === item.id && (
                          <p className={`mt-1 text-xs ${envioMsg.ok ? "text-[#1D9E75]" : "text-[#E24B4A]"}`}>
                            {envioMsg.msg}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
