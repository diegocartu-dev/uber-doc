"use client";

import { useState, useRef } from "react";

type ArchivoSubido = {
  name: string;
  path: string;
  size: number;
  type: string;
};

type LinkSubido = {
  nombre: string;
  url: string;
  entry: string;
};

type Props = {
  consultaId: string;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function EstudiosPaciente({ consultaId }: Props) {
  const [archivos, setArchivos] = useState<ArchivoSubido[]>([]);
  const [links, setLinks] = useState<LinkSubido[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkNombre, setLinkNombre] = useState("");
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setSubiendo(true);
    setError(null);
    setMensaje(null);

    try {
      const formData = new FormData();
      formData.append("consultaId", consultaId);
      formData.append("archivo", file);

      const res = await fetch("/api/consulta/subir-estudio", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const data = await res.json();
      if (data.ok) {
        setArchivos((prev) => [...prev, data.archivo]);
        setMensaje("Tu estudio está disponible para tu médico. Se eliminará automáticamente cuando finalice la consulta.");
      } else {
        setError(data.error || "Error al subir archivo.");
      }
    } catch {
      setError("Error de conexión al subir.");
    } finally {
      setSubiendo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleAgregarLink() {
    if (!linkUrl.trim()) return;

    setError(null);
    setMensaje(null);

    try {
      const res = await fetch("/api/consulta/agregar-link-estudio", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consultaId,
          url: linkUrl.trim(),
          nombre: linkNombre.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        const entry = linkNombre.trim()
          ? `${linkNombre.trim()}|||${linkUrl.trim()}`
          : linkUrl.trim();
        setLinks((prev) => [
          ...prev,
          { nombre: linkNombre.trim(), url: linkUrl.trim(), entry },
        ]);
        setLinkUrl("");
        setLinkNombre("");
        setShowLinkForm(false);
        setMensaje("Tu estudio está disponible para tu médico. Se eliminará automáticamente cuando finalice la consulta.");
      } else {
        setError(data.error || "Error al agregar link.");
      }
    } catch {
      setError("Error de conexión.");
    }
  }

  async function handleEliminarArchivo(path: string) {
    try {
      const res = await fetch("/api/consulta/eliminar-estudio", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultaId, tipo: "archivo", valor: path }),
      });
      if ((await res.json()).ok) {
        setArchivos((prev) => prev.filter((a) => a.path !== path));
      }
    } catch {
      // silent
    }
  }

  async function handleEliminarLink(entry: string) {
    try {
      const res = await fetch("/api/consulta/eliminar-estudio", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultaId, tipo: "link", valor: entry }),
      });
      if ((await res.json()).ok) {
        setLinks((prev) => prev.filter((l) => l.entry !== entry));
      }
    } catch {
      // silent
    }
  }

  return (
    <div className="mt-6">
      <p className="text-xs font-medium tracking-wide text-gray-400">
        ESTUDIOS PARA TU MÉDICO
      </p>

      {/* Acciones */}
      <div className="mt-3 flex flex-col gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          onChange={handleSubirArchivo}
          className="hidden"
        />
        <button
          type="button"
          disabled={subiendo}
          onClick={() => fileInputRef.current?.click()}
          className="w-full rounded-xl border border-[#378ADD] px-4 py-3 text-sm font-medium text-[#378ADD] hover:bg-[#378ADD]/5 transition disabled:opacity-50"
          style={{ minHeight: "44px" }}
        >
          {subiendo ? "Subiendo..." : "Subir archivo"}
        </button>

        <button
          type="button"
          onClick={() => setShowLinkForm(!showLinkForm)}
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
          style={{ minHeight: "44px" }}
        >
          Tengo un link de mi estudio
        </button>
      </div>

      {/* Link form */}
      {showLinkForm && (
        <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <input
            type="text"
            value={linkNombre}
            onChange={(e) => setLinkNombre(e.target.value)}
            placeholder="Nombre del estudio (opcional)"
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#378ADD] min-h-[44px]"
          />
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="Pegá el link que te dio el centro de imágenes"
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#378ADD] min-h-[44px]"
          />
          <button
            type="button"
            onClick={handleAgregarLink}
            disabled={!linkUrl.trim()}
            className="w-full rounded-xl bg-[#378ADD] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#2e6fb5] disabled:opacity-50 transition min-h-[44px]"
          >
            Agregar link
          </button>
        </div>
      )}

      {/* Feedback messages */}
      {mensaje && (
        <div className="mt-3 rounded-lg bg-[#1D9E75]/10 px-4 py-3">
          <p className="text-xs text-[#1D9E75]">{mensaje}</p>
        </div>
      )}
      {error && (
        <div className="mt-3 rounded-lg bg-red-50 px-4 py-3">
          <p className="text-xs text-[#E24B4A]">{error}</p>
        </div>
      )}

      {/* Lista de subidos */}
      {(archivos.length > 0 || links.length > 0) && (
        <div className="mt-4 space-y-2">
          {archivos.map((archivo) => (
            <div
              key={archivo.path}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm text-gray-900 truncate">{archivo.name}</p>
                <p className="text-xs text-gray-400">{formatSize(archivo.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => handleEliminarArchivo(archivo.path)}
                className="shrink-0 ml-2 text-xs text-gray-400 hover:text-[#E24B4A] transition"
                style={{ minHeight: "44px", minWidth: "44px" }}
              >
                Eliminar
              </button>
            </div>
          ))}

          {links.map((link) => (
            <div
              key={link.entry}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm text-gray-900 truncate">
                  {link.nombre || "Link externo"}
                </p>
                <p className="text-xs text-gray-400 truncate">{link.url}</p>
              </div>
              <button
                type="button"
                onClick={() => handleEliminarLink(link.entry)}
                className="shrink-0 ml-2 text-xs text-gray-400 hover:text-[#E24B4A] transition"
                style={{ minHeight: "44px", minWidth: "44px" }}
              >
                Eliminar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
