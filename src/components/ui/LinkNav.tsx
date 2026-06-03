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

  function handleClick() {
    if (navegandoRef.current) return;
    navegandoRef.current = true;
    startTransition(() => router.push(href));
  }

  const esFuncion = typeof children === "function";

  return (
    <button
      type="button"
      onClick={handleClick}
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
