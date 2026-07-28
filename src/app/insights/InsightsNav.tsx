"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { Stethoscope, Settings, AlertTriangle } from "lucide-react";

const LINKS = [
  { href: "/insights", label: "Hoy" },
  { href: "/insights/atenciones", label: "Atenciones" },
  { href: "/insights/medicos", label: "Médicos" },
  { href: "/insights/especialidades", label: "Especialidades" },
  { href: "/insights/oferta", label: "Oferta" },
  { href: "/insights/funnel", label: "Demanda" },
];

export default function InsightsNav() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  // Toggle global de datos. Default ON = "Solo reales" (la verdad para decidir).
  // OFF (?real=0) = incluye cuentas de prueba (modo debug, marcado en ámbar).
  const soloReales = sp.get("real") !== "0";

  function isActive(href: string) {
    if (href === "/insights") return pathname === "/insights";
    return pathname.startsWith(href);
  }

  // Preservar el modo al navegar entre pantallas.
  const sufijo = soloReales ? "" : "?real=0";

  function toggle() {
    const params = new URLSearchParams(sp.toString());
    if (soloReales) params.set("real", "0");
    else params.delete("real");
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname);
  }

  return (
    <>
      <nav className="border-b border-white/10 bg-[#0F172A]">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-4 lg:gap-6">
            <div className="flex shrink-0 items-center gap-2">
              <Stethoscope size={20} strokeWidth={2} color="#378ADD" />
              <span className="text-base font-bold lowercase text-white">docto</span>
              <span className="ml-1 hidden rounded bg-[#378ADD]/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#378ADD] sm:inline">
                CEO
              </span>
            </div>
            <div className="-mx-4 flex items-center gap-1 overflow-x-auto px-4 lg:mx-0 lg:px-0">
              {LINKS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href + sufijo}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive(href)
                      ? "bg-white/10 text-white"
                      : "text-white/50 hover:text-white/80"
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 lg:gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={soloReales}
              onClick={toggle}
              title={soloReales ? "Mostrando solo datos reales. Tocá para incluir cuentas de prueba." : "Incluye cuentas de prueba. Tocá para ver solo reales."}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-white/5"
            >
              <span className={`text-xs font-medium ${soloReales ? "text-white/70" : "text-[#BA7517]"}`}>
                {soloReales ? "Solo reales" : "Incluye test"}
              </span>
              <span className={`relative h-5 w-9 rounded-full transition-colors ${soloReales ? "bg-[#378ADD]" : "bg-[#BA7517]"}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${soloReales ? "left-[18px]" : "left-0.5"}`} />
              </span>
            </button>
            <Link
              href="/admin"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white/40 transition hover:text-white/70"
            >
              <Settings size={14} />
              <span className="hidden sm:inline">Admin</span>
            </Link>
          </div>
        </div>
      </nav>
      {!soloReales && (
        <div className="flex items-center justify-center gap-2 bg-[#BA7517]/15 px-4 py-1.5 text-center text-xs font-medium text-[#BA7517]">
          <AlertTriangle size={13} />
          Estás incluyendo cuentas de prueba — estos números NO son la realidad del negocio.
        </div>
      )}
    </>
  );
}
