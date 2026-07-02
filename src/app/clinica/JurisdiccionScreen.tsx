"use client";

import { useMemo, useState } from "react";
import { Search, Check, MapPin } from "lucide-react";
import { JURISDICCIONES } from "@/lib/jurisdicciones";
import { normalizeTexto } from "./disponibilidad";

// Pantalla 1 del ruteo por jurisdicción (diseño Sofía). Primera pantalla de la Clínica,
// SIEMPRE. Estado A: el que vuelve confirma su provincia con un toque. Estado B: el nuevo
// la elige con buscador + lista (nunca un dropdown de 24). Encuadre de habilitación, no
// de geolocalización ("No usamos tu ubicación").
export default function JurisdiccionScreen({
  provinciaGuardada,
  onConfirmar,
}: {
  provinciaGuardada: string | null;
  onConfirmar: (provincia: string) => void | Promise<void>;
}) {
  const [seleccion, setSeleccion] = useState<string | null>(provinciaGuardada);
  const [modoElegir, setModoElegir] = useState<boolean>(!provinciaGuardada);
  const [busqueda, setBusqueda] = useState("");
  const [guardando, setGuardando] = useState(false);

  const termino = normalizeTexto(busqueda.trim());
  const provinciasFiltradas = useMemo(
    () => (termino ? JURISDICCIONES.filter((p) => normalizeTexto(p).includes(termino)) : JURISDICCIONES),
    [termino]
  );

  async function confirmar() {
    if (!seleccion || guardando) return;
    setGuardando(true);
    await onConfirmar(seleccion);
    // No apagamos `guardando`: el parent desmonta esta pantalla al confirmar.
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col px-5 pb-28 pt-10">
      {!modoElegir && seleccion ? (
        // ── Estado A — confirmar (paciente que vuelve) ──
        <>
          <h1 className="text-[22px] font-bold text-gray-900">Confirmá tu jurisdicción</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-gray-500">
            Te mostramos los médicos habilitados para atender en tu provincia.
          </p>
          <div
            className="mt-6 flex items-center justify-between rounded-xl bg-white px-4 py-4"
            style={{ border: "2px solid #378ADD" }}
          >
            <span className="flex items-center gap-2 text-[16px] font-medium text-gray-900">
              <MapPin size={18} strokeWidth={1.75} style={{ color: "#378ADD" }} />
              {seleccion}
            </span>
            <Check size={20} strokeWidth={2} style={{ color: "#378ADD" }} />
          </div>
          <button
            type="button"
            onClick={() => { setModoElegir(true); setBusqueda(""); }}
            className="mt-4 self-start text-[15px] text-[#888780] underline"
          >
            Cambiar provincia
          </button>
        </>
      ) : (
        // ── Estado B — elegir (paciente nuevo o "cambiar") ──
        <>
          <h1 className="text-[22px] font-bold text-gray-900">¿En qué provincia estás?</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-gray-500">
            Es para mostrarte los médicos habilitados para atenderte. No usamos tu ubicación.
          </p>
          <div className="relative mt-6">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
              <Search size={18} strokeWidth={1.75} style={{ color: "#9ca3af" }} />
            </span>
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscá tu provincia…"
              className="w-full rounded-xl bg-white py-3.5 pl-10 pr-4 text-[16px] shadow-sm focus:outline-none"
              style={{ border: "1px solid #d1d5db", color: "#111827" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "#378ADD"; e.currentTarget.style.boxShadow = "0 0 0 1px #378ADD"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>
          <div className="mt-4 overflow-hidden rounded-xl bg-white" style={{ border: "1px solid #e5e7eb" }}>
            {provinciasFiltradas.length === 0 ? (
              <p className="px-4 py-6 text-center text-[15px] text-gray-500">
                No encontramos esa provincia. Revisá cómo la escribiste.
              </p>
            ) : (
              provinciasFiltradas.map((p, i) => {
                const activa = seleccion === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSeleccion(p)}
                    className="flex min-h-[56px] w-full items-center justify-between px-4 text-left text-[16px] transition-colors hover:bg-[#f8f9fa]"
                    style={{
                      borderTop: i === 0 ? "none" : "1px solid #f0f0f0",
                      color: "#111827",
                      backgroundColor: activa ? "rgba(55,138,221,0.06)" : undefined,
                      fontWeight: activa ? 600 : 400,
                    }}
                  >
                    {p}
                    {activa && <Check size={20} strokeWidth={2} style={{ color: "#378ADD" }} />}
                  </button>
                );
              })
            )}
          </div>
        </>
      )}

      {/* CTA sticky bottom — aparece solo cuando hay selección (no deshabilitado). */}
      {seleccion && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-white px-5 py-3" style={{ borderColor: "#e5e7eb" }}>
          <div className="mx-auto max-w-md">
            <button
              type="button"
              onClick={confirmar}
              disabled={guardando}
              className="h-14 w-full rounded-xl text-[17px] font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-60"
              style={{ backgroundColor: "#378ADD" }}
            >
              {guardando ? "Un momento…" : "Ver médicos habilitados"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
