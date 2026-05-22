"use client";

import { useState, useEffect } from "react";
import { ShieldCheck, Loader2, Check } from "lucide-react";

interface Props {
  firmaConfigurada: boolean;
}

export default function BannerFirmaElectronica({ firmaConfigurada }: Props) {
  const [estado, setEstado] = useState<"idle" | "activando" | "listo" | "oculto">(
    firmaConfigurada ? "oculto" : "idle"
  );
  const [error, setError] = useState("");

  // Auto-hide success banner after 4 seconds
  useEffect(() => {
    if (estado === "listo") {
      const timer = setTimeout(() => setEstado("oculto"), 4000);
      return () => clearTimeout(timer);
    }
  }, [estado]);

  if (estado === "oculto") return null;

  const activar = async () => {
    setEstado("activando");
    setError("");

    try {
      const res = await fetch("/api/firma/configurar", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error activando firma");
        setEstado("idle");
        return;
      }
      setEstado("listo");
    } catch {
      setError("Error de conexión. Intentá de nuevo.");
      setEstado("idle");
    }
  };

  // Estado: recién activado — feedback breve
  if (estado === "listo") {
    return (
      <div
        className="mb-4 rounded-xl p-5"
        style={{ background: "#E8F5EF", border: "1px solid #1D9E75" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1D9E75]/10">
            <Check className="h-4 w-4 text-[#1D9E75]" />
          </div>
          <p className="text-sm font-semibold text-gray-900">
            Firma electrónica activada
          </p>
        </div>
        <p className="mt-2 text-sm text-gray-600">
          Tus recetas ahora incluyen firma electrónica conforme a la Ley 25.506.
        </p>
      </div>
    );
  }

  // Estado: sin configurar
  return (
    <div
      className="mb-4 rounded-xl p-5"
      style={{ background: "#EBF4FF", border: "1px solid #378ADD" }}
    >
      <ShieldCheck className="h-8 w-8 text-[#378ADD]" />

      <p className="mt-3 text-sm font-semibold text-gray-900">
        Activá la firma electrónica para tus recetas
      </p>
      <p className="mt-1 text-sm text-gray-600">
        Tus recetas van a incluir firma electrónica conforme a la Ley 25.506.
        Cada vez que firmes, te pedimos un código por email para verificar tu
        identidad.
      </p>

      {error && (
        <p className="mt-2 text-[13px] text-[#E24B4A]">{error}</p>
      )}

      <button
        onClick={activar}
        disabled={estado === "activando"}
        className="mt-4 block w-full rounded-lg bg-[#378ADD] px-5 py-2.5 text-center text-sm font-medium text-white transition hover:bg-[#2d75c4] active:scale-[0.97] disabled:opacity-60"
      >
        {estado === "activando" ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Activando...
          </span>
        ) : (
          "Activar firma electrónica"
        )}
      </button>

      <p className="mt-2 text-[11px] text-gray-400">
        Solo se configura una vez.
      </p>
    </div>
  );
}
