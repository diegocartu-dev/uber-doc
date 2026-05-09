"use client";

import { useState, useEffect } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import ConfirmDialog from "../../components/ConfirmDialog";

interface ComisionesData {
  comisiones: { founder: number; tradicional: number };
  regimenNuevos: string;
  stats: {
    foundersActivos: number;
    tradicionalActivos: number;
    totalActivos: number;
  };
}

export default function ComisionesTab() {
  const [data, setData] = useState<ComisionesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<string | null>(null);
  const [nuevoValor, setNuevoValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [confirmandoRegimen, setConfirmandoRegimen] = useState(false);
  const [mensaje, setMensaje] = useState<{
    texto: string;
    tipo: "ok" | "error";
  } | null>(null);

  useEffect(() => {
    fetch("/api/admin/comisiones")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  async function cambiarPorcentaje(categoria: string) {
    const val = parseFloat(nuevoValor);
    if (isNaN(val) || val < 0 || val > 100) {
      setMensaje({ texto: "Porcentaje invalido", tipo: "error" });
      return;
    }
    if (motivo.trim().length < 10) {
      setMensaje({
        texto: "Motivo obligatorio (min 10 caracteres)",
        tipo: "error",
      });
      return;
    }

    setProcesando(true);
    try {
      const res = await fetch("/api/admin/comisiones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "cambiar_porcentaje",
          categoria,
          nuevoPorcentaje: val,
          motivo,
        }),
      });
      if (res.ok) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                comisiones: { ...prev.comisiones, [categoria]: val },
              }
            : prev
        );
        setMensaje({ texto: "Comision actualizada", tipo: "ok" });
        setEditando(null);
        setNuevoValor("");
        setMotivo("");
      } else {
        const err = await res.json();
        setMensaje({ texto: err.error || "Error", tipo: "error" });
      }
    } catch {
      setMensaje({ texto: "Error de conexion", tipo: "error" });
    }
    setProcesando(false);
  }

  async function cambiarRegimen() {
    const nuevoReg =
      data?.regimenNuevos === "founder" ? "tradicional" : "founder";
    setProcesando(true);
    try {
      const res = await fetch("/api/admin/comisiones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "cambiar_regimen_nuevos",
          nuevaCategoria: nuevoReg,
        }),
      });
      if (res.ok) {
        setData((prev) =>
          prev ? { ...prev, regimenNuevos: nuevoReg } : prev
        );
        setMensaje({
          texto: `Nuevos medicos entraran como ${nuevoReg}`,
          tipo: "ok",
        });
      }
    } catch {
      setMensaje({ texto: "Error de conexion", tipo: "error" });
    }
    setProcesando(false);
    setConfirmandoRegimen(false);
  }

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {mensaje && (
        <p
          className={`text-center text-sm ${mensaje.tipo === "ok" ? "text-[#1D9E75]" : "text-[#E24B4A]"}`}
        >
          {mensaje.texto}
        </p>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Founders activos" value={data.stats.foundersActivos} />
        <StatCard
          label="Tradicionales activos"
          value={data.stats.tradicionalActivos}
        />
        <StatCard label="Total activos" value={data.stats.totalActivos} />
      </div>

      {/* Comisiones */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Comisiones globales
        </h2>

        {(["founder", "tradicional"] as const).map((cat) => (
          <div
            key={cat}
            className="rounded-xl bg-white p-5"
            style={{ border: "1px solid #e5e7eb" }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 capitalize">
                  {cat}
                </p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {data.comisiones[cat]}%
                </p>
              </div>
              {editando !== cat && (
                <button
                  onClick={() => {
                    setEditando(cat);
                    setNuevoValor(data.comisiones[cat].toString());
                    setMotivo("");
                    setMensaje(null);
                  }}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Editar
                </button>
              )}
            </div>

            {editando === cat && (
              <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                <div>
                  <label className="text-xs font-medium text-gray-500">
                    Nuevo porcentaje
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    value={nuevoValor}
                    onChange={(e) => setNuevoValor(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#378ADD] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">
                    Motivo del cambio (obligatorio)
                  </label>
                  <textarea
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Min 10 caracteres..."
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#378ADD] focus:outline-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => cambiarPorcentaje(cat)}
                    disabled={procesando}
                    className="rounded-lg bg-[#378ADD] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {procesando ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      "Guardar"
                    )}
                  </button>
                  <button
                    onClick={() => setEditando(null)}
                    className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Regimen nuevos */}
      <div
        className="rounded-xl bg-white p-5"
        style={{ border: "1px solid #e5e7eb" }}
      >
        <h2 className="text-sm font-semibold text-gray-900">
          Regimen para nuevos medicos
        </h2>
        <p className="mt-1 text-xs text-gray-400">
          Los medicos que se aprueben entraran con esta categoria
        </p>
        <div className="mt-3 flex items-center gap-3">
          <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-[#378ADD] capitalize">
            {data.regimenNuevos}
          </span>
          <button
            onClick={() => setConfirmandoRegimen(true)}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Cambiar a{" "}
            {data.regimenNuevos === "founder" ? "tradicional" : "founder"}
          </button>
        </div>
      </div>

      {confirmandoRegimen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
          onClick={() => setConfirmandoRegimen(false)}
        >
          <div
            className="mx-4 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <ConfirmDialog
              title={`Cambiar regimen a ${data.regimenNuevos === "founder" ? "Tradicional" : "Founder"}?`}
              description={`Los nuevos medicos que se aprueben entraran como ${data.regimenNuevos === "founder" ? "Tradicional (10%)" : "Founder (5%)"}. Los medicos existentes no se ven afectados.`}
              confirmLabel="Si, cambiar"
              variant="warning"
              onConfirm={cambiarRegimen}
              onCancel={() => setConfirmandoRegimen(false)}
              isLoading={procesando}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="rounded-xl bg-white p-4"
      style={{ border: "1px solid #e5e7eb" }}
    >
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
