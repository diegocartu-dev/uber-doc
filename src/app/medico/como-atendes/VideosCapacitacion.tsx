"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Play, X } from "lucide-react";
import type { VideoCapacitacionVisible as VideoCapacitacion } from "@/lib/capacitacion";

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
//
// El margen izquierdo es chico en todas: en un teléfono la caja del video mide
// unos 330 px, y con un margen del 40% un nombre largo se cortaba. Además la
// pastilla tiene tope de ancho y parte línea (ver `anchoMaximo`).
const POSICIONES = [
  { top: "12%", left: "6%" },
  { top: "36%", left: "18%" },
  { top: "60%", left: "8%" },
  { top: "24%", left: "22%" },
  { top: "48%", left: "12%" },
];

const anchoMaximo = (left: string) => `calc(94% - ${left})`;

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
              <span className="mt-1.5 block text-[13px] font-medium text-gray-700">Dura {v.duracion}</span>
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
  const botonCerrar = useRef<HTMLButtonElement>(null);
  const [posicion, setPosicion] = useState(0);
  const [fallo, setFallo] = useState(false);
  // Cambiar la key remonta el <video>: vuelve a pedir la ruta y recibe una firma
  // nueva. Es lo que arregla un link vencido o un corte de red.
  const [intento, setIntento] = useState(0);

  const cerrar = useCallback(() => {
    ref.current?.pause();
    onCerrar();
  }, [onCerrar]);

  // El botón atrás de Android y el gesto de volver de iPhone tienen que CERRAR el
  // reproductor, no salir de la pantalla: parece una página nueva, así que un
  // profesional mayor toca "atrás" para volver. Se agrega una entrada al
  // historial al abrir y se cierra al retroceder.
  useEffect(() => {
    window.history.pushState({ capacitacion: true }, "");
    const alVolver = () => cerrar();
    window.addEventListener("popstate", alVolver);
    return () => window.removeEventListener("popstate", alVolver);
  }, [cerrar]);

  // Escape cierra (en captura, para que llegue aunque el foco esté en los
  // controles del video), y la página de abajo no se desplaza mientras está
  // abierto. El foco entra al diálogo y vuelve a su lugar al cerrar.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cerrar();
      }
    };
    document.addEventListener("keydown", alTeclear, true);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focoPrevio = document.activeElement as HTMLElement | null;
    botonCerrar.current?.focus();
    return () => {
      document.removeEventListener("keydown", alTeclear, true);
      document.body.style.overflow = overflowPrevio;
      focoPrevio?.focus?.();
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
      className="fixed inset-0 flex flex-col bg-black"
      style={{ zIndex: 9999 }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="min-w-0 text-[15px] font-semibold leading-snug text-white">{video.titulo}</p>
        <button
          ref={botonCerrar}
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
            // Texto neutro: el mismo error llega por un corte de red, un link
            // vencido o una sesión que caducó, y culpar a la conexión sería
            // mentirle a quien tiene buena señal.
            <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6 text-center">
              <p className="text-[15px] text-white">No pudimos abrir el video.</p>
              <button
                type="button"
                onClick={() => {
                  setFallo(false);
                  setIntento((n) => n + 1);
                }}
                className="rounded-xl px-5 py-3 text-[15px] font-semibold text-white"
                style={{ background: "var(--color-primary)" }}
              >
                Volver a intentar
              </button>
            </div>
          ) : (
            <video
              key={intento}
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
              // Salta de posición sin animar el tamaño: `transition-all` movía el
              // ancho máximo y partía la línea a mitad de camino en el celular.
              className="pointer-events-none absolute select-none break-words rounded-md px-2 py-1 text-[12px] font-medium"
              style={{
                ...POSICIONES[posicion],
                maxWidth: anchoMaximo(POSICIONES[posicion].left),
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
