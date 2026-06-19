"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Trash2, Upload, Loader2 } from "lucide-react";
import SignaturePad from "signature_pad";

interface Props {
  firmaUrl: string | null; // path en storage, no URL pública
  onGuardada?: () => void; // opcional: avisa al padre (wizard) cuando la firma se guardó
}

export default function FirmaManuscrita({ firmaUrl, onGuardada }: Props) {
  const [modo, setModo] = useState<"dibujar" | "subir">("dibujar");
  const [guardando, setGuardando] = useState(false);
  const [firmaGuardada, setFirmaGuardada] = useState(!!firmaUrl);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [archivoSubido, setArchivoSubido] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState(false);
  const [tieneTrazos, setTieneTrazos] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Cargar preview de firma existente
  useEffect(() => {
    if (firmaUrl) {
      setPreviewSrc(`/api/medico/firma?v=${Date.now()}`);
      setFirmaGuardada(true);
    }
  }, [firmaUrl]);

  // Inicializar SignaturePad
  const initPad = useCallback((preserveData = false) => {
    if (!canvasRef.current || firmaGuardada) return;

    const canvas = canvasRef.current;
    const container = canvas.parentElement;
    if (!container) return;

    // Guardar trazos existentes antes de redimensionar
    const savedData = preserveData && padRef.current ? padRef.current.toData() : null;

    // Ajustar tamaño al contenedor
    const rect = container.getBoundingClientRect();
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(ratio, ratio);

    if (padRef.current) {
      padRef.current.off();
    }

    const pad = new SignaturePad(canvas, {
      penColor: "#000000",
      minWidth: 1.5,
      maxWidth: 2.5,
      backgroundColor: "rgba(255,255,255,0)",
    });

    pad.addEventListener("beginStroke", () => {
      setTieneTrazos(true);
    });

    // Restaurar trazos después de redimensionar
    if (savedData && savedData.length > 0) {
      pad.fromData(savedData);
    }

    padRef.current = pad;
  }, [firmaGuardada]);

  useEffect(() => {
    if (modo === "dibujar" && !firmaGuardada) {
      // Pequeño delay para que el DOM se renderice
      const t = setTimeout(initPad, 50);
      return () => clearTimeout(t);
    }
  }, [modo, firmaGuardada, initPad]);

  // Resize handler — preserva trazos existentes
  useEffect(() => {
    if (modo !== "dibujar" || firmaGuardada) return;
    const handleResize = () => initPad(true);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [modo, firmaGuardada, initPad]);

  function limpiarCanvas() {
    padRef.current?.clear();
    setTieneTrazos(false);
  }

  function handleArchivoSeleccionado(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setError("Solo se permiten PNG o JPG");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("La imagen no puede superar 2MB");
      return;
    }

    setArchivoSubido(file);
    const reader = new FileReader();
    reader.onload = () => setPreviewSrc(reader.result as string);
    reader.readAsDataURL(file);
  }

  function limpiarArchivo() {
    setArchivoSubido(null);
    setPreviewSrc(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function guardarFirma() {
    setGuardando(true);
    setError(null);

    try {
      let blob: Blob;

      if (modo === "dibujar") {
        if (!padRef.current || padRef.current.isEmpty()) {
          setError("Dibujá tu firma antes de guardar");
          setGuardando(false);
          return;
        }
        // Exportar canvas como PNG con fondo transparente
        const dataUrl = padRef.current.toDataURL("image/png");
        const res = await fetch(dataUrl);
        blob = await res.blob();
      } else {
        if (!archivoSubido) {
          setError("Seleccioná una imagen");
          setGuardando(false);
          return;
        }
        blob = archivoSubido;
      }

      const formData = new FormData();
      formData.append(
        "firma",
        blob,
        modo === "dibujar" ? "firma.png" : archivoSubido?.name || "firma.png"
      );

      const res = await fetch("/api/medico/firma", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error al guardar");
        return;
      }

      setFirmaGuardada(true);
      onGuardada?.();
      setPreviewSrc(`/api/medico/firma?v=${Date.now()}`);
      setArchivoSubido(null);
      setTieneTrazos(false);
      setToast(true);
      setTimeout(() => setToast(false), 3000);
    } catch {
      setError("Error de conexión");
    } finally {
      setGuardando(false);
    }
  }

  function handleCambiarFirma() {
    setFirmaGuardada(false);
    setPreviewSrc(null);
    setModo("dibujar");
    setTieneTrazos(false);
    setArchivoSubido(null);
  }

  const mostrarBotones =
    (modo === "dibujar" && tieneTrazos) ||
    (modo === "subir" && archivoSubido);

  return (
    <div
      className="mt-4 rounded-xl bg-white p-6"
      style={{ border: "0.5px solid #e5e7eb" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium tracking-wide text-gray-400 uppercase">
          FIRMA MANUSCRITA
        </p>
        {firmaGuardada && (
          <span className="inline-flex items-center gap-1.5 text-xs text-[#1D9E75]">
            <span className="h-2 w-2 rounded-full bg-[#1D9E75]" />
            Cargada
          </span>
        )}
        {!firmaGuardada && (
          <span className="inline-flex items-center gap-1.5 text-xs text-[#BA7517]">
            <span className="h-2 w-2 rounded-full bg-[#BA7517]" />
            Pendiente
          </span>
        )}
      </div>

      <div className="mt-4">
        {/* Estado: firma guardada — mostrar preview */}
        {firmaGuardada && previewSrc && (
          <>
            <div
              className="flex items-center justify-center rounded-xl bg-white"
              style={{
                border: "1px solid #E5E7EB",
                height: "120px",
                overflow: "hidden",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewSrc}
                alt="Firma manuscrita"
                className="max-h-full max-w-full object-contain p-3"
              />
            </div>
            <button
              onClick={handleCambiarFirma}
              className="mt-3 text-sm font-medium text-[#378ADD] hover:underline"
            >
              Cambiar firma
            </button>
          </>
        )}

        {/* Estado: edición */}
        {!firmaGuardada && (
          <>
            {!firmaGuardada && !previewSrc && (
              <p className="mb-3 text-sm text-gray-500">
                Tu firma aparece en cada receta que emitas. Podés cambiarla
                cuando quieras.
              </p>
            )}

            {/* Modo dibujar */}
            {modo === "dibujar" && (
              <>
                <div
                  className="relative rounded-xl bg-white"
                  style={{
                    height: "160px",
                    border: tieneTrazos
                      ? "2px solid #378ADD"
                      : "2px dashed #E5E7EB",
                    touchAction: "none",
                  }}
                >
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 h-full w-full rounded-xl"
                  />
                  {!tieneTrazos && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <span className="text-sm text-[#888780]">
                        Firmá acá
                      </span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setModo("subir");
                    setTieneTrazos(false);
                  }}
                  className="mt-2 text-sm text-[#378ADD] hover:underline"
                >
                  Prefiero subir una imagen
                </button>
              </>
            )}

            {/* Modo subir */}
            {modo === "subir" && (
              <>
                {!archivoSubido ? (
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="flex w-full flex-col items-center justify-center rounded-xl"
                    style={{
                      height: "160px",
                      border: "2px dashed #E5E7EB",
                      background: "#F9FAFB",
                    }}
                  >
                    <Upload size={32} className="text-[#888780]" />
                    <span className="mt-2 text-sm text-[#888780]">
                      Tocá para seleccionar
                    </span>
                    <span className="mt-1 text-xs text-gray-400">
                      PNG o JPG, fondo transparente o blanco
                    </span>
                  </button>
                ) : (
                  <div
                    className="flex items-center justify-center rounded-xl bg-white"
                    style={{
                      height: "160px",
                      border: "2px solid #378ADD",
                      overflow: "hidden",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewSrc || ""}
                      alt="Preview firma"
                      className="max-h-full max-w-full object-contain p-3"
                    />
                  </div>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={handleArchivoSeleccionado}
                />
                <button
                  onClick={() => {
                    setModo("dibujar");
                    limpiarArchivo();
                  }}
                  className="mt-2 text-sm text-[#378ADD] hover:underline"
                >
                  Prefiero dibujar
                </button>
              </>
            )}

            {/* Error */}
            {error && (
              <p className="mt-2 text-xs text-[#E24B4A]">{error}</p>
            )}

            {/* Botones acción */}
            {mostrarBotones && (
              <div
                className="mt-3 flex items-center justify-between transition-opacity duration-200"
                style={{ opacity: mostrarBotones ? 1 : 0 }}
              >
                <button
                  onClick={
                    modo === "dibujar" ? limpiarCanvas : limpiarArchivo
                  }
                  className="inline-flex items-center gap-1.5 text-sm text-[#888780] hover:text-gray-600"
                >
                  <Trash2 size={16} />
                  Borrar
                </button>
                <button
                  onClick={guardarFirma}
                  disabled={guardando}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#378ADD] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#2d7acc] disabled:opacity-50"
                >
                  {guardando ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    "Guardar firma"
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-[#1D9E75] px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          Firma guardada
        </div>
      )}
    </div>
  );
}
