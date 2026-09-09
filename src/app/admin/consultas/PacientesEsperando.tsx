"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, Clock, X } from "lucide-react";
import { BarraTabla, CabezaTabla, useVistaTabla, type Columna } from "@/components/tabla/TablaDatos";

interface EntradaSala {
  id: string;
  paciente_id: string;
  medico_id: string | null;
  tipo: string;
  entrada_en: string;
  consulta_id: string | null;
  turno_id: string | null;
  paciente: { nombre_completo: string; dni: string; email: string } | null;
  medico: { nombre_completo: string } | null;
  tiempo_espera_min: number;
  urgencia: "baja" | "media" | "alta";
}

const POLL_INTERVAL = 10_000;

const TIPO_LABEL: Record<string, string> = {
  ci: "CI",
  turno_programado: "Turno",
  consultorio: "Consultorio",
};

/** La espera se decía SOLO con color. Ahora también con la palabra: el color acompaña,
 *  la palabra informa (regla 6 del mandato de tablas). */
const URGENCIA_LABEL: Record<string, string> = { alta: "Alta", media: "Media", baja: "Baja" };
const CICLO_URGENCIA = ["Alta", "Media", "Baja"];

function urgenciaColor(urgencia: string) {
  if (urgencia === "alta") return "#E24B4A";
  if (urgencia === "media") return "#BA7517";
  return "#1D9E75";
}

function formatTiempo(min: number) {
  if (min < 60) return `${min} min`;
  const hrs = Math.floor(min / 60);
  return `${hrs}h ${min % 60}min`;
}

export default function PacientesEsperando() {
  const [entradas, setEntradas] = useState<EntradaSala[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [motivo, setMotivo] = useState("");
  const [cancelando, setCancelando] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/sala-espera/activos");
      if (!res.ok) return;
      const data = await res.json();
      setEntradas(data.entradas ?? []);
    } catch { /* retry next cycle */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const COLUMNAS: Columna<EntradaSala>[] = useMemo(() => [
    { k: "sel", t: "", val: () => "", sinOrden: true },
    { k: "paciente", t: "Paciente", val: (e) => e.paciente?.nombre_completo ?? "—",
      busca: (e) => `${e.paciente?.nombre_completo ?? ""} ${e.paciente?.email ?? ""}` },
    { k: "medico", t: "Médico", val: (e) => e.medico?.nombre_completo ?? "Sin asignar" },
    { k: "tipo", t: "Tipo", val: (e) => TIPO_LABEL[e.tipo] ?? e.tipo },
    { k: "espera", t: "Espera", val: (e) => e.tiempo_espera_min, num: true, porEvento: true,
      busca: (e) => formatTiempo(e.tiempo_espera_min) },
    { k: "urgencia", t: "Urgencia", val: (e) => URGENCIA_LABEL[e.urgencia] ?? e.urgencia, rango: CICLO_URGENCIA },
    { k: "acc", t: "", val: () => "", sinOrden: true, num: true },
  ], []);
  // Acá NO manda "lo más nuevo": es una fila de gente esperando en vivo, y arriba va el
  // que lleva más tiempo sin que lo atiendan. Motivo escrito, como pide la regla 4 para
  // desviarse del orden por defecto.
  const vista = useVistaTabla(entradas, COLUMNAS, {
    clave: (e) => e.id,
    defecto: (a, b) => b.tiempo_espera_min - a.tiempo_espera_min,
  });

  /** Tilda o destilda las filas QUE SE VEN. Antes tomaba la lista entera: con un filtro
   *  puesto se podían cancelar entradas que no estaban en pantalla. */
  function seleccionarVisibles() {
    const ids = vista.filas.map((e) => e.id);
    const todas = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected(todas ? new Set() : new Set(ids));
  }

  async function cancelarSeleccionadas() {
    if (motivo.trim().length < 10) {
      setError("El motivo debe tener al menos 10 caracteres.");
      return;
    }
    setCancelando(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sala-espera/cancelar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entrada_ids: Array.from(selected),
          motivo: motivo.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error cancelando entradas");
      } else {
        setEntradas((prev) => prev.filter((e) => !selected.has(e.id)));
        setSelected(new Set());
        setMotivo("");
        setShowDialog(false);
      }
    } catch {
      setError("Error de conexión");
    }
    setCancelando(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (entradas.length === 0) {
    return (
      <div className="mt-4 rounded-xl bg-white p-8 text-center" style={{ border: "1px solid #e5e7eb" }}>
        <p className="text-gray-500">No hay pacientes esperando</p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div
          className="mb-3 flex items-center justify-between rounded-lg px-4 py-2.5"
          style={{ backgroundColor: "#FEF3C7", border: "1px solid #F59E0B" }}
        >
          <span className="text-sm font-medium text-amber-800">
            {selected.size} entrada{selected.size > 1 ? "s" : ""} seleccionada{selected.size > 1 ? "s" : ""}
          </span>
          <button
            onClick={() => setShowDialog(true)}
            className="rounded-lg border border-[#E24B4A] bg-white px-3 py-1 text-xs font-medium text-[#E24B4A] transition hover:bg-red-50"
          >
            Cancelar seleccionadas
          </button>
        </div>
      )}

      {/* Table */}
      <BarraTabla vista={vista} placeholder="Buscar paciente o médico…" cuenta="esperando">
        <button
          onClick={seleccionarVisibles}
          className="rounded-lg border border-gray-200 px-2.5 py-1 text-[12px] font-medium text-gray-600 transition hover:border-[#378ADD] hover:text-[#378ADD]"
        >
          Tildar los {vista.filas.length} que se ven
        </button>
      </BarraTabla>
      <div className="overflow-auto rounded-xl bg-white max-h-[72vh]" style={{ border: "1px solid #e5e7eb" }}>
        <table className="w-full border-separate border-spacing-0 text-sm">
          <CabezaTabla vista={vista} />
          <tbody>
            {vista.filas.map((e) => (
              <tr key={e.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(e.id)}
                    onChange={() => toggleSelect(e.id)}
                    className="h-3.5 w-3.5 rounded border-gray-300"
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">
                    {e.paciente?.nombre_completo ?? "—"}
                  </div>
                  <div className="text-xs text-gray-400">
                    {e.paciente?.email ?? ""}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {e.medico?.nombre_completo ?? "Sin asignar"}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                    e.tipo === "ci"
                      ? "bg-blue-50 text-[#378ADD]"
                      : e.tipo === "turno_programado"
                        ? "bg-purple-50 text-purple-600"
                        : "bg-teal-50 text-teal-600"
                  }`}>
                    {TIPO_LABEL[e.tipo] ?? e.tipo}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Clock size={14} style={{ color: urgenciaColor(e.urgencia) }} />
                    <span className="font-medium" style={{ color: urgenciaColor(e.urgencia) }}>
                      {formatTiempo(e.tiempo_espera_min)}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: urgenciaColor(e.urgencia) }} />
                    {URGENCIA_LABEL[e.urgencia] ?? e.urgencia}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => {
                      setSelected(new Set([e.id]));
                      setShowDialog(true);
                    }}
                    className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-500 transition hover:border-[#E24B4A] hover:text-[#E24B4A]"
                  >
                    Cancelar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cancel dialog */}
      {showDialog && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Cancelar {selected.size} entrada{selected.size > 1 ? "s" : ""}
              </h3>
              <button onClick={() => { setShowDialog(false); setError(null); }}>
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-500">
              Esta acción cierra las entradas de sala de espera seleccionadas.
              No afecta la consulta asociada. Se notificará al médico.
            </p>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo obligatorio (mín. 10 caracteres)..."
              rows={3}
              className="mt-4 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-[#378ADD] focus:outline-none"
            />
            {/* Feedback en vivo: antes el botón quedaba deshabilitado en silencio
                con motivo < 10 caracteres y parecía roto. */}
            {motivo.trim().length > 0 && motivo.trim().length < 10 && (
              <p className="mt-2 text-xs" style={{ color: "#BA7517" }}>
                El motivo debe tener al menos 10 caracteres — te faltan {10 - motivo.trim().length}.
              </p>
            )}
            {error && (
              <p className="mt-2 text-xs text-[#E24B4A]">{error}</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { setShowDialog(false); setError(null); }}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Volver
              </button>
              <button
                onClick={cancelarSeleccionadas}
                disabled={cancelando || motivo.trim().length < 10}
                className="rounded-lg border border-[#E24B4A] bg-white px-4 py-2 text-sm font-medium text-[#E24B4A] transition hover:bg-red-50 disabled:opacity-50"
              >
                {cancelando ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  "Confirmar cancelación"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
