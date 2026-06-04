"use client";

import { useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

type Props = {
  href: string;
  /**
   * Contenido del botón. Como función recibe `isPending` para que el caller
   * decida cómo mostrar el feedback (ej. reemplazar un icono por el spinner,
   * como hace MenuDrawer). Como nodo, se renderiza tal cual + spinner inline.
   */
  children: React.ReactNode | ((isPending: boolean) => React.ReactNode);
  className?: string;
  style?: React.CSSProperties;
  "aria-label"?: string;
  /** Muestra un spinner inline mientras navega. Ignorado si children es función. Default: true. */
  spinner?: boolean;
  /** Tamaño del spinner en px. Default: 14. */
  spinnerSize?: number;
};

/**
 * Wrapper de navegación con guard anti-doble-tap.
 *
 * Clona el patrón de MenuDrawer: un ref sincrónico bloquea taps repetidos
 * ANTES de que React re-renderice, evitando que un usuario que toca 10 veces
 * dispare 10 navegaciones. useTransition da el feedback de "navegando".
 *
 * El guard se resetea solo: al resolver la navegación el componente se
 * desmonta (cambia la ruta) y el ref muere con él.
 */
export default function LinkNav({
  href,
  children,
  className = "",
  style,
  "aria-label": ariaLabel,
  spinner = true,
  spinnerSize = 14,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const navegandoRef = useRef(false);
  // Posición/tiempo del toque inicial, para distinguir tap de scroll.
  const downRef = useRef<{ x: number; y: number; t: number } | null>(null);

  function navegar() {
    if (navegandoRef.current) return;
    navegandoRef.current = true;
    startTransition(() => router.push(href));
  }

  // ── Navegación robusta en touch ──
  // En mobile, si la página todavía se está acomodando (contenido async que
  // carga arriba), el botón puede MOVERSE entre que apoyás el dedo y lo levantás
  // → el `click` sintetizado no encuentra el botón y NO navega (de ahí el "tocás
  // y no pasa nada, hay que tocar dos veces"). Los eventos de puntero, en cambio,
  // quedan CAPTURADOS por el botón: el pointerup llega aunque el botón se haya
  // corrido. Navegamos en el pointerup de un tap real (poco movimiento) → el
  // primer toque siempre entra. `onClick` queda de fallback (mouse/teclado).
  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse") return; // el mouse usa onClick
    downRef.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
  }
  function onPointerUp(e: React.PointerEvent) {
    if (e.pointerType === "mouse") return;
    const d = downRef.current;
    downRef.current = null;
    if (!d) return;
    const movido = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    const transcurrido = e.timeStamp - d.t;
    if (movido < 12 && transcurrido < 700) navegar(); // tap, no scroll
  }
  function onPointerCancel() {
    downRef.current = null; // el gesto se volvió scroll → no navega
  }

  const esFuncion = typeof children === "function";

  return (
    <button
      type="button"
      onClick={navegar}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      disabled={isPending}
      aria-label={ariaLabel}
      aria-busy={isPending}
      className={`inline-flex items-center gap-1.5 transition-transform duration-100 active:scale-[0.97] ${isPending ? "pointer-events-none opacity-80" : ""} ${className}`}
      style={style}
    >
      {esFuncion ? (
        (children as (isPending: boolean) => React.ReactNode)(isPending)
      ) : (
        <>
          {spinner && isPending && (
            <Loader2 size={spinnerSize} strokeWidth={2} className="animate-spin shrink-0" />
          )}
          {children}
        </>
      )}
    </button>
  );
}
