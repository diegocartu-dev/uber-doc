"use client";

import { usePathname } from "next/navigation";
import { ChevronLeft, Loader2 } from "lucide-react";
import LinkNav from "./LinkNav";
import { getParentHref } from "../Breadcrumb";

const AZUL = "#378ADD";

/**
 * Botón "← Volver" — navegación jerárquica del producto (Opción B).
 *
 * El destino NO es history.back(): es el padre jerárquico del crumb actual
 * (getParentHref reusa el árbol de Breadcrumb). Para /medico/agenda → /dashboard.
 *
 * En home (/dashboard) o rutas sin padre no se renderiza nada — igual que el
 * breadcrumb devolvía null en esas rutas.
 *
 * Target táctil ≥44px vía padding propio aunque el riel del navbar sea h-8.
 */
export default function BotonVolver() {
  const pathname = usePathname();
  const parentHref = getParentHref(pathname);

  if (!parentHref) return null;

  return (
    <div className="bg-white" style={{ borderBottom: "0.5px solid #f0f0f0" }}>
      <div className="mx-auto flex max-w-7xl items-center lg:px-2">
        <LinkNav
          href={parentHref}
          aria-label="Volver"
          className="py-2.5 pr-3 text-[13px] font-medium"
          style={{ color: AZUL, minHeight: 44 }}
        >
          {(isPending) => (
            <>
              {isPending ? (
                <Loader2 size={18} strokeWidth={2} className="animate-spin shrink-0" />
              ) : (
                <ChevronLeft size={18} strokeWidth={2} className="shrink-0" />
              )}
              Volver
            </>
          )}
        </LinkNav>
      </div>
    </div>
  );
}
