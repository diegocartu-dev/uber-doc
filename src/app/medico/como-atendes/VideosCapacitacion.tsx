"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Play, X } from "lucide-react";
import type { VideoCapacitacion } from "@/lib/capacitacion";

// ─── Los dos videos de capacitación ──────────────────────────────────────────
//
// Cada video es una tarjeta con la misma anatomía que las otras tres de la
// pantalla. Al tocarla se abre el reproductor encima de todo, ocupando la
// pantalla: es más simple para un profesional de 70 años que un reproductor
// chico en medio de la página, y resuelve la pantalla completa sin usar la del
// sistema, que taparía la marca con el nombre.
//
// El `src` se pone recién al abrir: hasta que alguien toca, no se pide nada.
//
// Lo que NO se puede impedir está escrito en src/lib/capacitacion.ts. Lo de
// acá abajo es higiene, no candado: saca las invitaciones obvias a guardar el
// archivo, sin romperle nada a nadie.

const SEGUNDOS_ENTRE_POSICIONES = 18;

// Posiciones de la marca, en porcentaje. Cambia de lugar para que no alcance
// con recortar una esquina de la grabación. Nunca en la franja de abajo, donde
// están los controles.
const POSICIONES = [
  { top: "12%", left: "8%" },
  { top: "38%", left: "46%" },
  { top: "62%", left: "10%" },
  { top: "24%", left: "40%" },
  { top: "50%", left: "18%" },
];

type Props = {
  videos: readonly VideoCapacitacion[];
  /** Nombre de quien mira. Va sobreimpreso encima del video. */
  marca: string;
};

export default function VideosCapacitacion({ videos, marca }: Props) {
  const [abierto, setAbierto] = useState<VideoCapacitacion | null>(null);

  return (
    <>
      <div className="mt-3 space-y-3">
        {videos.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setAbierto(v)}
            className="flex w-full items-center gap-3 rounded-xl bg-white p-4 text-left transition hover:bg-gray-50 active:scale-[0.99]"
            style={{ border: "0.5px solid #e5e7eb" }}
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              style={{ background: "var(--color-primary-soft)" }}
            >
              <Play size={18} style={{ color: "var(--color-primary)" }} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-gray-900">{v.titulo}</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-gray-500">{v.bajada}</span>
              <span className="mt-1.5 block text-[13px] font-medium text-gray-700">{v.duracion} min</span>
            </span>
            <span className="flex items-center gap-1 text-sm font-medium" style={{ color: "var(--color-text-link)" }}>
              Ver <ChevronRight size={16} />
            </span>
          </button>
        ))}
      </div>

      {abierto && <Reproductor video={abierto} marca={marca} onCerrar={() => setAbierto(null)} />}
    </>
  );
}

function Reproductor({
  video,
  marca,
  onCerrar,
}: {
  video: VideoCapacitacion;
  marca: string;
  onCerrar: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [posicion, setPosicion] = useState(0);
  const [fallo, setFallo] = useState(false);

  const cerrar = useCallback(() => {
    ref.current?.pause();
    onCerrar();
  }, [onCerrar]);

  // Escape cierra, y la página de abajo no se desplaza mientras está abierto.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
    };
    document.addEventListener("keydown", alTeclear);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = overflowPrevio;
    };
  }, [cerrar]);

  useEffect(() => {
    const t = setInterval(() => setPosicion((p) => (p + 1) % POSICIONES.length), SEGUNDOS_ENTRE_POSICIONES * 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={video.titulo}
      className="fixed inset-0 flex flex-col bg-black/90"
      style={{ zIndex: 9999 }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="min-w-0 truncate text-[15px] font-semibold text-white">{video.titulo}</p>
        <button
          type="button"
          onClick={cerrar}
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[15px] font-medium text-white"
          style={{ background: "rgba(255,255,255,0.14)" }}
        >
          <X size={18} /> Cerrar
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-4">
        <div
          className="relative overflow-hidden rounded-xl bg-black"
          style={{ height: "100%", maxWidth: "100%", aspectRatio: "9 / 16" }}
        >
          {fallo ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-[15px] text-white">No pudimos abrir el video.</p>
              <p className="text-[13px] text-gray-300">Revisá tu conexión y volvé a intentar en un momento.</p>
            </div>
          ) : (
            <video
              ref={ref}
              src={`/api/medico/capacitacion/${video.id}`}
              poster={video.poster}
              controls
              autoPlay
              playsInline
              preload="metadata"
              controlsList="nodownload nofullscreen noremoteplayback"
              disablePictureInPicture
              disableRemotePlayback
              // Solo sobre el video, no en la página: saca "Guardar video como"
              // del menú contextual sin romperle a nadie el copiar y pegar.
              onContextMenu={(e) => e.preventDefault()}
              onError={() => setFallo(true)}
              className="h-full w-full object-contain"
            />
          )}

          {!fallo && marca && (
            <span
              aria-hidden="true"
              // Pastilla oscura translúcida: los videos son casi todo pantallas
              // blancas, y un texto blanco suelto ahí no se leería. Así se ve
              // igual sobre fondo claro y oscuro, sin tapar el contenido.
              className="pointer-events-none absolute select-none whitespace-nowrap rounded-md px-2 py-1 text-[12px] font-medium transition-all duration-1000"
              style={{
                ...POSICIONES[posicion],
                color: "rgba(255,255,255,0.92)",
                background: "rgba(17,24,39,0.34)",
              }}
            >
              {marca}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
