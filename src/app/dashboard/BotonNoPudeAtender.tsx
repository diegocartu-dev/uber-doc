"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelarTurnoNoAtendido } from "./turno-actions";

// Salida del médico ante una falla técnica en un turno en curso: cancela + reembolsa al
// paciente (decisión Diego 08/07). Dialog React inline — NUNCA window.confirm (Chrome lo
// suprime con iframes cross-origin, regla del proyecto).
export default function BotonNoPudeAtender({ turnoId }: { turnoId: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    setCancelando(true);
    setError(null);
    const res = await cancelarTurnoNoAtendido(turnoId);
    if (res.ok) {
      router.refresh();
      return; // la card desaparece con el refresh
    }
    setError(res.error ?? "No se pudo cancelar. Probá de nuevo.");
    setCancelando(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="mt-3 text-xs font-medium text-[#E24B4A] underline"
      >
        No pude atender este turno
      </button>

      {abierto && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 px-4" style={{ zIndex: 9999 }}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5" style={{ boxShadow: "0 10px 40px rgba(0,0,0,0.2)" }}>
            <h3 className="text-base font-semibold text-gray-900">¿Cancelar este turno?</h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              Usalo solo si no pudiste atender (por ejemplo, una falla técnica). El turno se
              cancela y <strong>al paciente se le reembolsa la consulta</strong> para que
              pueda reservar de nuevo sin costo.
            </p>
            {error && <p className="mt-2 text-sm text-[#E24B4A]">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => { setAbierto(false); setError(null); }}
                disabled={cancelando}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={confirmar}
                disabled={cancelando}
                className="flex-1 rounded-lg border border-[#E24B4A] px-4 py-2.5 text-sm font-medium text-[#E24B4A] transition hover:bg-red-50 active:scale-[0.97] disabled:opacity-50"
              >
                {cancelando ? "Cancelando…" : "Sí, cancelar y reembolsar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
