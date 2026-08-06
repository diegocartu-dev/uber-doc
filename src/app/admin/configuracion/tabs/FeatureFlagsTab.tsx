"use client";

import { useState, useEffect } from "react";
import { Loader2, Shield, ToggleLeft, ToggleRight } from "lucide-react";
import ConfirmDialog from "../../components/ConfirmDialog";

interface Flag {
  key: string;
  nombre: string;
  descripcion: string;
  activo: boolean;
  es_kill_switch: boolean;
}

export default function FeatureFlagsTab() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<Flag | null>(null);
  const [mensaje, setMensaje] = useState<{
    texto: string;
    tipo: "ok" | "error";
  } | null>(null);

  useEffect(() => {
    fetch("/api/admin/feature-flags")
      .then((r) => r.json())
      .then((data) => setFlags(data.flags ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function handleToggle(flag: Flag, motivo?: string) {
    setToggling(flag.key);
    setMensaje(null);
    try {
      const res = await fetch("/api/admin/feature-flags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: flag.key,
          activo: !flag.activo,
          motivo,
        }),
      });
      if (res.ok) {
        setFlags((prev) =>
          prev.map((f) =>
            f.key === flag.key ? { ...f, activo: !f.activo } : f
          )
        );
        setMensaje({
          texto: `${flag.nombre} ${!flag.activo ? "activado" : "desactivado"}`,
          tipo: "ok",
        });
      } else {
        setMensaje({ texto: "Error al cambiar flag", tipo: "error" });
      }
    } catch {
      setMensaje({ texto: "Error de conexion", tipo: "error" });
    }
    setToggling(null);
    setConfirmando(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  const killSwitches = flags.filter((f) => f.es_kill_switch);
  const otros = flags.filter((f) => !f.es_kill_switch);

  return (
    <div className="space-y-6">
      {mensaje && (
        <p
          className={`text-center text-sm ${mensaje.tipo === "ok" ? "text-[#1D9E75]" : "text-[#E24B4A]"}`}
        >
          {mensaje.texto}
        </p>
      )}

      {/* Leyenda: qué significa "kill switch" (asustaba sin explicación) */}
      <p className="text-xs text-gray-400">
        «Kill switch» = interruptor de emergencia: apagarlo corta ese flujo al instante en producción.
        Verde = funcionando normal.
      </p>

      {/* Kill Switches */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Shield size={16} className="text-[#E24B4A]" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Kill Switches
          </h2>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Apagar funcionalidades si algo se rompio. Efecto inmediato.
        </p>
        <div className="space-y-2">
          {killSwitches.map((flag) => (
            <FlagRow
              key={flag.key}
              flag={flag}
              toggling={toggling === flag.key}
              onToggle={() => setConfirmando(flag)}
            />
          ))}
        </div>
      </div>

      {/* Otros flags */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
          Otros flags
        </h2>
        <div className="space-y-2">
          {otros.map((flag) => (
            <FlagRow
              key={flag.key}
              flag={flag}
              toggling={toggling === flag.key}
              onToggle={() => setConfirmando(flag)}
            />
          ))}
        </div>
      </div>

      {/* Confirm dialog */}
      {confirmando && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
          onClick={() => setConfirmando(null)}
        >
          <div
            className="mx-4 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <ConfirmDialog
              title={`${confirmando.activo ? "Apagar" : "Prender"} ${confirmando.nombre}?`}
              description={confirmando.descripcion}
              confirmLabel={
                confirmando.activo ? "Si, apagar" : "Si, prender"
              }
              variant={confirmando.activo ? "danger" : "primary"}
              requireReason={confirmando.es_kill_switch && confirmando.activo}
              reasonPlaceholder="Motivo del cambio..."
              onConfirm={(motivo) => handleToggle(confirmando, motivo ?? undefined)}
              onCancel={() => setConfirmando(null)}
              isLoading={toggling === confirmando.key}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function FlagRow({
  flag,
  toggling,
  onToggle,
}: {
  flag: Flag;
  toggling: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="flex items-center justify-between rounded-xl bg-white p-4"
      style={{ border: "1px solid #e5e7eb" }}
    >
      <div className="flex-1 mr-4">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-900">{flag.nombre}</p>
          {flag.es_kill_switch && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-[#E24B4A]">
              KILL SWITCH
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-gray-400">{flag.descripcion}</p>
      </div>
      <button
        onClick={onToggle}
        disabled={toggling}
        className="shrink-0"
        aria-label={`Toggle ${flag.nombre}`}
      >
        {toggling ? (
          <Loader2 size={24} className="animate-spin text-gray-400" />
        ) : flag.activo ? (
          <ToggleRight size={32} className="text-[#1D9E75]" />
        ) : (
          <ToggleLeft size={32} className="text-gray-300" />
        )}
      </button>
    </div>
  );
}
