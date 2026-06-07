"use client";

import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import LinkNav from "./ui/LinkNav";

export type Crumb = { label: string; href?: string };

const BRAND = "var(--color-brand)";

export function buildCrumbs(pathname: string): Crumb[] | null {
  // Normalizar segmentos dinámicos
  const p = pathname
    .replace(/\/medico\/paciente\/[^/]+$/, "/medico/paciente/:id")
    .replace(/\/sala-espera\/[^/]+$/, "/sala-espera/:id")
    .replace(/\/consulta\/[^/]+\/.*$/, "/consulta/:id")
    .replace(/\/turno\/[^/]+\/.*$/, "/turno/:id")
    .replace(/\/clinica\/[^/]+\/.*$/, "/clinica/:id");

  const home: Crumb = { label: "Docto", href: "/dashboard" };

  const map: Record<string, Crumb[] | null> = {
    "/dashboard":            null, // home — sin breadcrumb
    "/mis-consultas":        [home, { label: "Mis consultas" }],
    "/mis-datos":            [home, { label: "Mis datos" }],
    "/documentos":           [home, { label: "Documentos" }],
    "/triage":               [home, { label: "Nueva consulta" }],
    "/clinica":              [home, { label: "Buscar médico" }],
    "/clinica/:id":          [home, { label: "Buscar médico", href: "/clinica" }, { label: "Turnos" }],
    "/sala-espera/:id":      [home, { label: "Sala de espera" }],
    "/medico/agenda":        [home, { label: "Mi agenda" }],
    "/medico/historial":     [home, { label: "Mis pacientes" }],
    "/medico/nova":          [home, { label: "Nova" }],
    "/medico/paciente/:id":  [home, { label: "Mis pacientes", href: "/medico/historial" }, { label: "Paciente" }],
    "/consulta/:id":         [home, { label: "Consulta" }],
    "/turno/:id":            [home, { label: "Turno" }],
  };

  if (p in map) return map[p];
  return null; // ruta desconocida — sin breadcrumb
}

/**
 * Destino jerárquico de "Volver": el href del penúltimo crumb del árbol.
 * Para /medico/agenda ([Docto→/dashboard, Mi agenda]) → "/dashboard".
 * En home (/dashboard) o rutas desconocidas → null (no se muestra Volver).
 */
export function getParentHref(pathname: string): string | null {
  const crumbs = buildCrumbs(pathname);
  if (!crumbs || crumbs.length < 2) return null;
  return crumbs[crumbs.length - 2].href ?? null;
}

export default function Breadcrumb() {
  const pathname = usePathname();
  const crumbs = buildCrumbs(pathname);

  if (!crumbs) return null;

  return (
    <div className="bg-white px-4" style={{ borderBottom: "0.5px solid #f0f0f0" }}>
      <div className="mx-auto flex h-8 max-w-7xl items-center gap-1 lg:px-2">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && (
                <ChevronRight
                  size={12}
                  strokeWidth={2}
                  style={{ color: "#d1d5db", flexShrink: 0 }}
                />
              )}
              {crumb.href && !isLast ? (
                <LinkNav
                  href={crumb.href}
                  className="text-[12px] font-medium hover:underline underline-offset-2 transition-opacity hover:opacity-80"
                  style={{ color: BRAND }}
                >
                  {crumb.label}
                </LinkNav>
              ) : (
                <span
                  className="text-[12px]"
                  style={{
                    color: isLast ? "#374151" : BRAND,
                    fontWeight: isLast ? 500 : 400,
                  }}
                >
                  {crumb.label}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
