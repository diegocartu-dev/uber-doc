"use client";

import { useState } from "react";
import { completarPerfil } from "@/app/onboarding/actions";

type PacienteData = {
  nombre_completo: string | null;
  dni: string | null;
  fecha_nacimiento: string | null;
  sexo_dni: string | null;
  tiene_cobertura: boolean | null;
  obra_social: string | null;
  nro_afiliado: string | null;
  telefono: string | null;
};

type Props = {
  paciente: PacienteData | null;
  redirectTo: string;
  error?: string | null;
};

export default function OnboardingForm({ paciente, redirectTo, error }: Props) {
  const [tieneCobertura, setTieneCobertura] = useState(paciente?.tiene_cobertura ?? false);

  const inputClass =
    "mt-1 block w-full rounded-xl border px-3 text-[15px] shadow-sm focus:outline-none focus:border-[#378ADD] focus:ring-1 focus:ring-[#378ADD]/30";
  const inputStyle = {
    height: 44,
    borderColor: "#e5e7eb",
    color: "#1a1a1a",
  } as React.CSSProperties;

  return (
    <>
      {error && (
        <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">
          {error === "campos_requeridos"
            ? "Nombre, DNI, fecha de nacimiento y sexo son obligatorios."
            : "Ocurrió un error. Intentá de nuevo."}
        </div>
      )}

      <form action={completarPerfil} className="mt-8 space-y-4">
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <input type="hidden" name="tiene_cobertura" value={tieneCobertura ? "true" : "false"} />

        <div>
          <label htmlFor="nombre_completo" className="block text-[13px] font-medium text-gray-500">
            Nombre completo
          </label>
          <input
            id="nombre_completo"
            name="nombre_completo"
            type="text"
            required
            defaultValue={paciente?.nombre_completo ?? ""}
            className={inputClass}
            style={inputStyle}
            placeholder="Juan Pérez"
          />
        </div>

        <div>
          <label htmlFor="dni" className="block text-[13px] font-medium text-gray-500">
            DNI
          </label>
          <input
            id="dni"
            name="dni"
            type="text"
            required
            inputMode="numeric"
            defaultValue={paciente?.dni ?? ""}
            className={inputClass}
            style={inputStyle}
            placeholder="12345678"
          />
        </div>

        <div>
          <label htmlFor="fecha_nacimiento" className="block text-[13px] font-medium text-gray-500">
            Fecha de nacimiento
          </label>
          <input
            id="fecha_nacimiento"
            name="fecha_nacimiento"
            type="date"
            required
            defaultValue={paciente?.fecha_nacimiento ?? ""}
            className={inputClass}
            style={inputStyle}
          />
        </div>

        <div>
          <label className="block text-[13px] font-medium text-gray-500">
            Sexo (según DNI)
          </label>
          <div className="mt-1 grid grid-cols-2 gap-3">
            {(["femenino", "masculino"] as const).map((opt) => (
              <label
                key={opt}
                className="flex flex-1 cursor-pointer items-center justify-center rounded-xl border px-3 text-[15px] font-medium transition-all has-[:checked]:border-[#378ADD] has-[:checked]:bg-[#378ADD]/10 has-[:checked]:text-[#378ADD]"
                style={{ height: 44, borderColor: "#e5e7eb", color: "#6b7280" }}
              >
                <input
                  type="radio"
                  name="sexo_dni"
                  value={opt}
                  required
                  defaultChecked={paciente?.sexo_dni === opt}
                  className="sr-only"
                />
                {opt === "femenino" ? "Femenino" : "Masculino"}
              </label>
            ))}
          </div>
        </div>

        <div className="pt-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Tengo cobertura médica</span>
            <button
              type="button"
              role="switch"
              aria-checked={tieneCobertura}
              onClick={() => setTieneCobertura(!tieneCobertura)}
              className="relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors duration-200"
              style={{ backgroundColor: tieneCobertura ? "#378ADD" : "#d1d5db" }}
            >
              <span
                className="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200"
                style={{
                  transform: tieneCobertura ? "translateX(22px)" : "translateX(3px)",
                  marginTop: 4,
                }}
              />
            </button>
          </div>

          <div
            className="overflow-hidden transition-all duration-200"
            style={{
              maxHeight: tieneCobertura ? 200 : 0,
              opacity: tieneCobertura ? 1 : 0,
            }}
          >
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-[13px] text-gray-500">Obra social</label>
                <input
                  type="text"
                  name="obra_social"
                  defaultValue={paciente?.obra_social ?? ""}
                  placeholder="Ej: OSDE, Swiss Medical, PAMI..."
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] text-gray-500">Nro. de afiliado</label>
                <input
                  type="text"
                  name="nro_afiliado"
                  defaultValue={paciente?.nro_afiliado ?? ""}
                  placeholder="Número de afiliado"
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="w-full rounded-xl bg-[#378ADD] py-3.5 text-sm font-semibold text-white active:scale-[0.97] transition-all duration-100"
        >
          Guardar y continuar
        </button>
      </form>
    </>
  );
}
