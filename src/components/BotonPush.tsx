"use client";

import { useState, useEffect } from "react";
import { pushSoportado, pushYaActivo, pushRechazado, esIOSSinPWA, suscribirPush } from "@/lib/push-client";

type Props = {
  rol: "medico" | "paciente";
  variante?: "boton" | "popup";
  onResult?: (ok: boolean) => void;
};

type Estado = "cargando" | "push-listo" | "ios-sin-pwa" | "no-soportado" | "ya-activo" | "rechazado";

export default function BotonPush({ rol, variante = "boton", onResult }: Props) {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [activando, setActivando] = useState(false);
  const [descartado, setDescartado] = useState(false);

  useEffect(() => {
    if (esIOSSinPWA()) {
      setEstado("ios-sin-pwa");
    } else if (!pushSoportado()) {
      setEstado("no-soportado");
    } else if (pushRechazado()) {
      setEstado("rechazado");
    } else if (pushYaActivo()) {
      setEstado("ya-activo");
    } else {
      setEstado("push-listo");
    }
  }, []);

  async function activar() {
    setActivando(true);
    const ok = await suscribirPush(rol);
    setActivando(false);
    if (ok) setEstado("ya-activo");
    onResult?.(ok);
  }

  if (estado === "cargando" || estado === "ya-activo" || estado === "no-soportado" || estado === "rechazado" || descartado) return null;

  if (estado === "ios-sin-pwa") {
    return (
      <div className={variante === "popup" ? "mt-4" : ""}>
        <div className="rounded-xl bg-[#f8f9fa] p-4" style={{ border: "0.5px solid #e5e7eb" }}>
          <p className="text-sm font-medium text-gray-900">
            Activá notificaciones para no perderte nada
          </p>
          <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">
            En Safari, tocá{" "}
            <span className="inline-flex items-center align-middle">
              <svg className="h-4 w-4 text-[#378ADD]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 0 0-2.25 2.25v9a2.25 2.25 0 0 0 2.25 2.25h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25H15m0-3-3-3m0 0-3 3m3-3V15" />
              </svg>
            </span>{" "}
            y luego <strong>Agregar a inicio</strong>. Después abrí Docto desde el ícono.
          </p>
          {variante === "popup" && (
            <button
              onClick={() => setDescartado(true)}
              className="mt-3 w-full rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-500 active:scale-[0.97] transition-all"
            >
              Ahora no
            </button>
          )}
        </div>
      </div>
    );
  }

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
