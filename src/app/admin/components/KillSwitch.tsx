"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

interface Props {
  flag: {
    key: string;
    nombre: string;
    descripcion: string;
    activo: boolean;
    es_kill_switch: boolean;
  };
  desdeMobile?: boolean;
}

export default function KillSwitch({ flag, desdeMobile = false }: Props) {
  const [activo, setActivo] = useState(flag.activo);
  const [step, setStep] = useState<"idle" | "first" | "confirm">("idle");
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/feature-flags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: flag.key,
          activo: !activo,
          desdeMobile,
        }),
      });

      if (res.ok) {
        setActivo(!activo);
      }
    } catch {
      // silencioso
    }
    setLoading(false);
    setStep("idle");
  }

  return (
    <>
      <div
        className="flex items-center justify-between rounded-xl bg-white p-4"
        style={{ border: "1px solid #e5e7eb" }}
      >
        <div className="flex-1 mr-3">
          <p className="font-medium text-gray-900 text-sm">{flag.nombre}</p>
          <p
            className={`text-xs mt-0.5 ${activo ? "text-[#1D9E75]" : "text-[#E24B4A]"}`}
          >
            {activo ? "Activo" : "Apagado"}
          </p>
        </div>
        <button
          onClick={() => setStep("first")}
          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
            activo ? "bg-[#1D9E75]" : "bg-gray-300"
          }`}
          style={{ minHeight: 28, minWidth: 48 }}
          aria-label={`Toggle ${flag.nombre}`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow ${
              activo ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {/* Modal paso 1 */}
      {step === "first" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6">
            <h3 className="text-lg font-semibold text-gray-900">
              {activo ? `Apagar ${flag.nombre}` : `Prender ${flag.nombre}`}
            </h3>
            <p className="mt-2 text-sm text-gray-500">{flag.descripcion}</p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setStep("idle")}
                className="flex-1 rounded-lg bg-gray-100 py-3 text-sm font-medium text-gray-700"
                style={{ minHeight: 44 }}
              >
                Cancelar
              </button>
              <button
                onClick={() => setStep("confirm")}
                className="flex-1 rounded-lg bg-[#BA7517] py-3 text-sm font-medium text-white"
                style={{ minHeight: 44 }}
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal paso 2: confirmacion final */}
      {step === "confirm" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6">
            <h3 className="text-lg font-semibold text-[#E24B4A]">
              Confirmacion final
            </h3>
            <p className="mt-2 text-sm text-gray-900">
              {activo
                ? `Vas a APAGAR ${flag.nombre}. Esto afecta a la plataforma en produccion.`
                : `Vas a PRENDER ${flag.nombre}.`}
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => {
                  setStep("idle");
                }}
                className="flex-1 rounded-lg bg-gray-100 py-3 text-sm font-medium text-gray-700"
                style={{ minHeight: 44 }}
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 rounded-lg bg-[#E24B4A] py-3 text-sm font-medium text-white disabled:opacity-50"
                style={{ minHeight: 44 }}
              >
                {loading ? (
                  <Loader2 size={16} className="mx-auto animate-spin" />
                ) : (
                  "Si, estoy seguro"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
