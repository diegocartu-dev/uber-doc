"use client";

// Aviso del término de medicamentos controlados para los profesionales que ya
// estaban registrados (Diego, 12/10/2026): "una vez, pueden posponerlo".
// Aparece solo si todavía no lo aceptaron. "Más tarde" lo esconde hasta la
// próxima sesión del navegador; vuelve a aparecer hasta que lo tilden.
// Diálogo React inline (nunca window.confirm: Chrome lo suprime con iframes).

import { useEffect, useState } from "react";
import TerminoControlados from "@/components/legal/TerminoControlados";
import {
  necesitaAceptarControlados,
  aceptarControladosDesdeElPanel,
} from "@/lib/legal/controlados-acciones";
import { useDashboardMedico } from "./DashboardMedicoProvider";

const POSPUESTO = "docto_controlados_pospuesto";

export default function AvisoControladosMedico() {
  // Un pedido de consulta o un paciente listo mandan: mientras haya uno a la
  // vista, este aviso no se dibuja (su capa tapaba el botón "Aceptar" del
  // pedido; revisión adversarial del 12/10). Vuelve cuando se resuelven.
  const { popupData, popupListo } = useDashboardMedico();
  const [visible, setVisible] = useState(false);
  const [aceptado, setAceptado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vivo = true;
    try {
      if (sessionStorage.getItem(POSPUESTO) === "1") return;
    } catch {
      // Sin sessionStorage (navegador privado): se pregunta igual.
    }
    necesitaAceptarControlados()
      .then((n) => { if (vivo && n) setVisible(true); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  if (!visible || popupData || popupListo) return null;

  function masTarde() {
    try {
      sessionStorage.setItem(POSPUESTO, "1");
    } catch {
      // Sin sessionStorage: se cierra igual por esta vez.
    }
    setVisible(false);
  }

  async function aceptar() {
    if (!aceptado || guardando) return;
    setGuardando(true);
    setError(false);
    const r = await aceptarControladosDesdeElPanel().catch(() => ({ ok: false }));
    setGuardando(false);
    if (r.ok) setVisible(false);
    else setError(true);
  }

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/50 px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <TerminoControlados aceptado={aceptado} onChange={setAceptado} />
        {error && (
          <p className="mt-3 text-sm" style={{ color: "#E24B4A" }}>
            No pudimos guardarlo. Probá de nuevo en un momento.
          </p>
        )}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={masTarde}
            className="flex-1 rounded-lg px-4 py-2.5 text-sm min-h-[48px]"
            style={{ color: "#888780" }}
          >
            Más tarde
          </button>
          <button
            type="button"
            onClick={aceptar}
            disabled={!aceptado || guardando}
            className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-white min-h-[48px] disabled:opacity-50"
            style={{ backgroundColor: "#378ADD" }}
          >
            {guardando ? "Guardando…" : "Aceptar"}
          </button>
        </div>
      </div>
    </div>
  );
}
