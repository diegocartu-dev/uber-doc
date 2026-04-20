"use client";

import { useState, useEffect } from "react";
import { pushSoportado, pushYaActivo, pushRechazado, suscribirPush } from "@/lib/push-client";

type Props = {
  rol: "medico" | "paciente";
  variante?: "boton" | "popup";
  onResult?: (ok: boolean) => void;
};

export default function BotonPush({ rol, variante = "boton", onResult }: Props) {
  const [visible, setVisible] = useState(false);
  const [activando, setActivando] = useState(false);
  const [activado, setActivado] = useState(false);
  const [descartado, setDescartado] = useState(false);

  useEffect(() => {
    if (!pushSoportado() || pushRechazado()) return;
    if (pushYaActivo()) {
      setActivado(true);
      return;
    }
    setVisible(true);
  }, []);

  async function activar() {
    setActivando(true);
    const ok = await suscribirPush(rol);
    setActivando(false);
    if (ok) setActivado(true);
    setVisible(false);
    onResult?.(ok);
  }

  if (!visible || activado || descartado) return null;

  if (variante === "popup") {
    return (
      <div className="mt-4 rounded-xl bg-[#f8f9fa] p-4" style={{ border: "0.5px solid #e5e7eb" }}>
        <p className="text-sm font-medium text-gray-900">
          ¿Querés que te avisemos cuando tu médico esté listo?
        </p>
        <div className="mt-3 flex gap-3">
          <button
            onClick={activar}
            disabled={activando}
            className="flex-1 rounded-lg bg-[#378ADD] py-2.5 text-sm font-medium text-white active:scale-[0.97] transition-all disabled:opacity-60"
          >
            {activando ? "Activando..." : "Activar notificaciones"}
          </button>
          <button
            onClick={() => setDescartado(true)}
            className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 active:scale-[0.97] transition-all"
          >
            Ahora no
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[#f8f9fa] p-4" style={{ border: "0.5px solid #e5e7eb" }}>
      <button
        onClick={activar}
        disabled={activando}
        className="w-full rounded-lg bg-[#378ADD] py-2.5 text-sm font-medium text-white active:scale-[0.97] transition-all disabled:opacity-60"
      >
        {activando ? "Activando..." : "Activar notificaciones"}
      </button>
      <p className="mt-2 text-center text-xs text-gray-400">
        {rol === "medico"
          ? "Solo te avisamos cuando tenés un paciente esperando y estás libre."
          : "Te avisamos cuando tu médico esté listo para atenderte."}
      </p>
    </div>
  );
}
