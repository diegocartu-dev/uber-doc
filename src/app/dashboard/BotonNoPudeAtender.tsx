"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelarTurnoNoAtendido } from "./turno-actions";

// Salida del médico ante una falla técnica en un turno en curso: cancela + reembolsa al
// paciente (decisión Diego 08/07). Dialog React inline — NUNCA window.confirm (Chrome lo
// suprime con iframes cross-origin, regla del proyecto). El copy explicita los deterrentes
// reales del mal uso: no se cobra y queda registrado (gate Sofía).
export default function BotonNoPudeAtender({ turnoId }: { turnoId: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [hecho, setHecho] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    setCancelando(true);
    setError(null);
    const res = await cancelarTurnoNoAtendido(turnoId);
    setCancelando(false);
    if (res.ok) {
      // Confirmación explícita ANTES del refresh: la card no desaparece muda
      // (el médico tiene que saber que funcionó — gate Sofía).
      setHecho(true);
      return;
    }
    setError(res.error ?? "No se pudo cancelar. Probá de nuevo.");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="-mx-2 mt-1 inline-block px-2 py-2.5 text-xs font-medium text-[#E24B4A] underline"
      >
        No pude atender este turno
      </button>

      {abierto && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 px-4" style={{ zIndex: 9999 }}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5" style={{ boxShadow: "0 10px 40px rgba(0,0,0,0.2)" }}>
            {hecho ? (
              <>
                <h3 className="text-base font-semibold text-gray-900">Turno cancelado</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">
                  Avisamos al paciente y su reembolso ya está en marcha.
                </p>
                <button
                  type="button"
                  onClick={() => router.refresh()}
                  className="mt-4 w-full rounded-lg bg-[#378ADD] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#2d75c4] active:scale-[0.97]"
                >
                  Entendido
                </button>
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold text-gray-900">¿Cancelar y reembolsar este turno?</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">
                  Usalo únicamente si no pudiste atender la consulta (por ejemplo, por una falla técnica).
                  El turno se cancela, el paciente recibe el <strong>reembolso completo</strong> y esta
                  consulta <strong>no se te paga</strong>. La cancelación queda registrada.
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
                    {cancelando ? "Cancelando…" : "Cancelar y reembolsar"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
