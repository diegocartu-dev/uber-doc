"use client";

import { useEffect, useState } from "react";
import { Menu, X, Stethoscope } from "lucide-react";
import AdminSidebar from "./AdminSidebar";

/** Aviso que dispara cualquier pantalla del admin cuando cambió algo que se cuenta. */
export const EVENTO_CONTADORES = "docto:contadores";

/** Para que una pantalla pida que los globitos se pongan al día. */
export function avisarContadoresCambiaron() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_CONTADORES));
}

interface Props {
  pendingMedicos: number;
  pendingAlertas: number;
  adminEmail: string;
  /** Flag institucional resuelto en el SERVER (layout) — única fuente. */
  institucional?: boolean;
  children: React.ReactNode;
}

export default function AdminShell({ pendingMedicos, pendingAlertas, adminEmail, institucional, children }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ── LOS GLOBITOS ROJOS ─────────────────────────────────────────────────────
  // Los números llegan del layout, que es un server component. El problema: el
  // admin aprueba al último médico pendiente, la lista se vacía en pantalla y el
  // globito seguía diciendo "1" hasta recargar el sitio entero. Se intentó con
  // `router.refresh()` (PR #362) confiando en que volviera a correr el layout, y
  // no alcanzó — el número viejo siguió apareciendo.
  //
  // Así que el globito ya no depende de eso: se pone al día solo, preguntando a
  // /api/admin/contadores cuando una pantalla avisa que cambió algo y cuando la
  // pestaña vuelve al frente (el admin deja el panel abierto horas).
  //
  // El servidor sigue mandando: si trae números nuevos, se descarta lo que
  // tengamos y gana él. Eso se resuelve DURANTE el render y no en un efecto, que
  // es el patrón recomendado para ajustar estado cuando cambian las props.
  const [ultimoDelServidor, setUltimoDelServidor] = useState({ m: pendingMedicos, a: pendingAlertas });
  const [alDia, setAlDia] = useState<{ m: number; a: number } | null>(null);

  if (ultimoDelServidor.m !== pendingMedicos || ultimoDelServidor.a !== pendingAlertas) {
    setUltimoDelServidor({ m: pendingMedicos, a: pendingAlertas });
    setAlDia(null);
  }

  const medicos = alDia?.m ?? pendingMedicos;
  const alertas = alDia?.a ?? pendingAlertas;

  useEffect(() => {
    let vigente = true;

    async function refrescar() {
      try {
        const r = await fetch("/api/admin/contadores", { cache: "no-store" });
        if (!r.ok) return; // 401 al vencer la sesión: se deja el número que había
        const j = (await r.json()) as { medicos?: unknown; alertas?: unknown };
        if (!vigente || typeof j.medicos !== "number" || typeof j.alertas !== "number") return;
        setAlDia({ m: j.medicos, a: j.alertas });
      } catch {
        // Sin red no se toca nada: un globito viejo es mejor que uno en cero mentiroso.
      }
    }

    function alVolverAlFrente() {
      if (document.visibilityState === "visible") refrescar();
    }

    window.addEventListener(EVENTO_CONTADORES, refrescar);
    document.addEventListener("visibilitychange", alVolverAlFrente);
    return () => {
      vigente = false;
      window.removeEventListener(EVENTO_CONTADORES, refrescar);
      document.removeEventListener("visibilitychange", alVolverAlFrente);
    };
  }, []);

  return (
    <div className="flex h-screen bg-[#F8F9FA]">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex">
        <AdminSidebar
          pendingMedicos={medicos}
          pendingAlertas={alertas}
          adminEmail={adminEmail}
          institucional={institucional}
        />
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 lg:hidden" onClick={() => setDrawerOpen(false)} />
          <div className="fixed left-0 top-0 z-50 h-full lg:hidden">
            <AdminSidebar
              pendingMedicos={medicos}
              pendingAlertas={alertas}
              adminEmail={adminEmail}
              institucional={institucional}
              onNavigate={() => setDrawerOpen(false)}
            />
          </div>
        </>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <div className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 lg:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Stethoscope size={20} strokeWidth={2} color="#378ADD" />
            <span className="text-base font-bold lowercase text-gray-900">docto</span>
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Admin
            </span>
          </div>
          <div className="w-10" />
        </div>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
