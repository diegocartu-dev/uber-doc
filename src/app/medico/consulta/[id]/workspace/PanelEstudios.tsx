"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import LoadingButton from "@/components/ui/LoadingButton";
import { MAX_BYTES_ENVIO } from "@/lib/imagenes/comprimir";

type Archivo = {
  name: string;
  path: string;
  size: number;
  type: string;
  uploadedAt: string;
  signedUrl: string | null;
};

type Link = {
  nombre: string;
  url: string;
};

type Props = {
  consultaId: string;
  estadoConsulta: string;
  createdAt: string;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "recién";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  return `hace ${hrs}h`;
}

function truncateUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 20 ? u.pathname.slice(0, 20) + "..." : u.pathname;
    return u.hostname + path;
  } catch {
    return url.length > 40 ? url.slice(0, 40) + "..." : url;
  }
}

export default function PanelEstudios({ consultaId, estadoConsulta, createdAt }: Props) {
  const [archivos, setArchivos] = useState<Archivo[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [envioMsg, setEnvioMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSendDoc = estadoConsulta === "en_curso" || (
    estadoConsulta === "completada" &&
    Date.now() - new Date(createdAt).getTime() < 48 * 60 * 60 * 1000
  );

  const fetchEstudios = useCallback(async () => {
    try {
      const res = await fetch(`/api/consulta/estudios?consultaId=${consultaId}`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = await res.json();
      setArchivos(data.archivos ?? []);
      setLinks(data.links ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [consultaId]);

  useEffect(() => {
    fetchEstudios();
    const interval = setInterval(fetchEstudios, 10000);
    return () => clearInterval(interval);
  }, [fetchEstudios]);

  async function handleEnviarDocumento(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      setEnvioMsg("Solo se pueden enviar archivos PDF.");
      return;
    }

    // El tope real es el de la plataforma (~4,5 MB) y corta ANTES de llegar al
    // servidor: el 413 vuelve como HTML, `res.json()` explota, y el médico leía
    // "Error de conexión" en el medio de la consulta. Se frena acá, con un
    // mensaje que dice qué hacer.
    if (file.size > MAX_BYTES_ENVIO) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      setEnvioMsg(`El PDF pesa ${mb} MB y el máximo es 4 MB. Mandá las páginas que importan en un archivo más liviano.`);
      return;
    }

    setEnviando(true);
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
      if (data.ok) {
        setEnvioMsg("Documento enviado al email del paciente.");
      } else {
        setEnvioMsg(data.error || "Error al enviar documento.");
      }
    } catch {
      setEnvioMsg("Error de conexión al enviar.");
    } finally {
      setEnviando(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const totalEstudios = archivos.length + links.length;

  return (
    <div className="p-5 space-y-6">
      {/* Estudios del paciente */}
      <div>
        <p className="text-xs font-medium tracking-wide text-gray-400">
          ESTUDIOS DEL PACIENTE
        </p>

        {loading ? (
          <div className="mt-4 flex items-center justify-center py-8">
            <svg className="h-5 w-5 animate-spin text-gray-300" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          </div>
        ) : totalEstudios === 0 ? (
          <p className="mt-4 text-sm text-gray-500">
            El paciente no subió estudios para esta consulta
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {archivos.map((archivo) => (
              <div
                key={archivo.path}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {archivo.name}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {formatSize(archivo.size)} · {timeAgo(archivo.uploadedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {archivo.signedUrl && (
                      <>
                        <a
                          href={archivo.signedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg px-3 py-1.5 text-xs font-medium text-[#378ADD] border border-[#378ADD] hover:bg-[#378ADD]/5 transition"
                          style={{ minHeight: "36px", display: "inline-flex", alignItems: "center" }}
                        >
                          Ver
                        </a>
                        <a
                          href={archivo.signedUrl}
                          download={archivo.name}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium text-[#378ADD] border border-[#378ADD] hover:bg-[#378ADD]/5 transition"
                          style={{ minHeight: "36px", display: "inline-flex", alignItems: "center" }}
                        >
                          Descargar
                        </a>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {links.map((link, i) => (
              <div
                key={`link-${i}`}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {link.nombre || "Estudio externo"}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400 truncate">
                      {truncateUrl(link.url)}
                    </p>
                  </div>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-[#378ADD] border border-[#378ADD] hover:bg-[#378ADD]/5 transition"
                    style={{ minHeight: "36px", display: "inline-flex", alignItems: "center" }}
                  >
                    Abrir
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Enviar documento al paciente */}
      {canSendDoc && (
        <div
          className="pt-6"
          style={{ borderTop: "0.5px solid #e5e7eb" }}
        >
          <p className="text-xs font-medium tracking-wide text-gray-400">
            ENVIAR DOCUMENTO AL PACIENTE
          </p>
          <p className="mt-2 text-xs text-gray-500">
            El documento se enviará por email al paciente.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleEnviarDocumento}
            className="hidden"
          />

          <LoadingButton
            type="button"
            isLoading={enviando}
            onClick={() => fileInputRef.current?.click()}
            className="mt-3 w-full rounded-xl bg-[#378ADD] px-6 py-3 text-sm font-medium text-white transition-all duration-100 hover:bg-[#2e6fb5] active:scale-95 disabled:opacity-50"
            style={{ minHeight: "44px" }}
          >
            Subir PDF (factura u otro)
          </LoadingButton>

          {envioMsg && (
            <p className={`mt-2 text-xs ${envioMsg.includes("enviado") ? "text-[#1D9E75]" : "text-[#E24B4A]"}`}>
              {envioMsg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function useEstudiosCount(consultaId: string): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch(`/api/consulta/estudios?consultaId=${consultaId}`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        setCount((data.archivos?.length ?? 0) + (data.links?.length ?? 0));
      } catch {
        // silent
      }
    }
    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, [consultaId]);

  return count;
}
