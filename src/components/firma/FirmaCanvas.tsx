"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Trash2, Upload } from "lucide-react";
import SignaturePad from "signature_pad";

// Captura de firma manuscrita SIN persistencia (spec Sofía 20/07, firma en el
// registro). Extraído de FirmaManuscrita: durante la Fase B del registro la
// ficha de `medicos` NO existe todavía, así que guardar contra /api/medico/firma
// sería un éxito silencioso falso — acá el padre pide el blob con la ref y lo
// manda en el MISMO FormData del registro (insert atómico, patrón credencial).
// Conserva los patrones probados del componente original: touchAction none,
// borde dashed→sólido con trazos, preservación de trazos en resize, y el modo
// alternativo "subir imagen" (médicos con firma escaneada).

export interface FirmaCanvasHandle {
  /** Blob PNG del canvas o el archivo subido; null si está vacío. */
  getBlob(): Promise<Blob | null>;
  isEmpty(): boolean;
}

interface Props {
  /** Inicializar el pad recién cuando el paso es visible (oculto, el canvas mide 0). */
  activo: boolean;
  /** Altura del área de firma (px). El paso dedicado permite más aire que el wizard. */
  altura?: number;
}

const FirmaCanvas = forwardRef<FirmaCanvasHandle, Props>(function FirmaCanvas(
  { activo, altura = 200 },
  ref
) {
  const [modo, setModo] = useState<"dibujar" | "subir">("dibujar");
  const [tieneTrazos, setTieneTrazos] = useState(false);
  const [archivoSubido, setArchivoSubido] = useState<File | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const initPad = useCallback((preserveData = false) => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (!canvas || !container) return;

    const savedData = preserveData && padRef.current ? padRef.current.toData() : null;

    const rect = container.getBoundingClientRect();
    if (rect.width === 0) return; // todavía oculto — reintenta al activarse
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(ratio, ratio);

    if (padRef.current) padRef.current.off();

    const pad = new SignaturePad(canvas, {
      penColor: "#000000",
      minWidth: 1.5,
      maxWidth: 2.5,
      backgroundColor: "rgba(255,255,255,0)",
    });
    pad.addEventListener("beginStroke", () => setTieneTrazos(true));
    if (savedData && savedData.length > 0) pad.fromData(savedData);
    padRef.current = pad;
  }, []);

  // Montar el pad recién cuando el paso se hace visible (spec: inicializado
  // oculto, getBoundingClientRect da 0 y el canvas queda muerto).
  useEffect(() => {
    if (activo && modo === "dibujar") {
      const t = setTimeout(() => initPad(true), 50);
      return () => clearTimeout(t);
    }
  }, [activo, modo, initPad]);

  useEffect(() => {
    if (!activo || modo !== "dibujar") return;
    const handleResize = () => initPad(true);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [activo, modo, initPad]);

  useImperativeHandle(ref, () => ({
    isEmpty() {
      if (modo === "subir") return !archivoSubido;
      return !padRef.current || padRef.current.isEmpty();
    },
    async getBlob() {
      if (modo === "subir") return archivoSubido;
      if (!padRef.current || padRef.current.isEmpty()) return null;
      const dataUrl = padRef.current.toDataURL("image/png");
      const res = await fetch(dataUrl);
      return res.blob();
    },
  }));

  function limpiarCanvas() {
    padRef.current?.clear();
    setTieneTrazos(false);
  }

  function handleArchivoSeleccionado(e: React.ChangeEvent<HTMLInputElement>) {
    setErrorArchivo(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setErrorArchivo("Solo se permiten PNG o JPG");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErrorArchivo("La imagen no puede superar 2MB");
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

  return (
    <div>
      {modo === "dibujar" && (
        <>
          <div
            className="relative rounded-xl bg-white"
            style={{
              height: `${altura}px`,
              border: tieneTrazos ? "2px solid #378ADD" : "2px dashed #E5E7EB",
              touchAction: "none",
            }}
          >
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full rounded-xl" />
            {!tieneTrazos && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="text-sm text-[#888780]">Firmá acá</span>
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setModo("subir");
                setTieneTrazos(false);
              }}
              className="text-sm text-[#378ADD] hover:underline"
            >
              Prefiero subir una imagen
            </button>
            {tieneTrazos && (
              <button
                type="button"
                onClick={limpiarCanvas}
                className="inline-flex items-center gap-1.5 text-sm text-[#888780] hover:text-gray-600"
              >
                <Trash2 size={16} />
                Borrar
              </button>
            )}
          </div>
        </>
      )}

      {modo === "subir" && (
        <>
          {!archivoSubido ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center justify-center rounded-xl"
              style={{ height: `${altura}px`, border: "2px dashed #E5E7EB", background: "#F9FAFB" }}
            >
              <Upload size={32} className="text-[#888780]" />
              <span className="mt-2 text-sm text-[#888780]">Tocá para seleccionar</span>
              <span className="mt-1 text-xs text-gray-400">PNG o JPG, fondo transparente o blanco</span>
            </button>
          ) : (
            <div
              className="flex items-center justify-center rounded-xl bg-white"
              style={{ height: `${altura}px`, border: "2px solid #378ADD", overflow: "hidden" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewSrc || ""} alt="Preview firma" className="max-h-full max-w-full object-contain p-3" />
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={handleArchivoSeleccionado}
          />
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setModo("dibujar");
                limpiarArchivo();
              }}
              className="text-sm text-[#378ADD] hover:underline"
            >
              Prefiero dibujar
            </button>
            {archivoSubido && (
              <button
                type="button"
                onClick={limpiarArchivo}
                className="inline-flex items-center gap-1.5 text-sm text-[#888780] hover:text-gray-600"
              >
                <Trash2 size={16} />
                Borrar
              </button>
            )}
          </div>
          {errorArchivo && <p className="mt-2 text-xs text-[#E24B4A]">{errorArchivo}</p>}
        </>
      )}
    </div>
  );
});

export default FirmaCanvas;
