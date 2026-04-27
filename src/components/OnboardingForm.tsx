"use client";

import { useState, useRef } from "react";
import { completarPerfil } from "@/app/onboarding/actions";
import ModalTerminos from "@/components/ModalTerminos";

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

type FieldErrors = {
  nombre_completo?: string;
  dni?: string;
  fecha_nacimiento?: string;
  sexo_dni?: string;
};

export default function OnboardingForm({ paciente, redirectTo, error: serverError }: Props) {
  const [tieneCobertura, setTieneCobertura] = useState(paciente?.tiene_cobertura ?? false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [checkTerminos, setCheckTerminos] = useState(false);
  const [modalTerminos, setModalTerminos] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function validate(): FieldErrors {
    const form = formRef.current;
    if (!form) return {};

    const errs: FieldErrors = {};
    const nombre = (form.elements.namedItem("nombre_completo") as HTMLInputElement)?.value?.trim();
    const dni = (form.elements.namedItem("dni") as HTMLInputElement)?.value?.trim();
    const fechaNac = (form.elements.namedItem("fecha_nacimiento") as HTMLInputElement)?.value?.trim();
    const sexo = (form.elements.namedItem("sexo_dni") as RadioNodeList)?.value;

    if (!nombre) errs.nombre_completo = "Ingresá tu nombre completo.";
    if (!dni) {
      errs.dni = "Ingresá tu DNI.";
    } else if (!/^\d{7,8}$/.test(dni)) {
      errs.dni = "El DNI debe tener 7 u 8 números, sin puntos.";
    }
    if (!fechaNac) errs.fecha_nacimiento = "Seleccioná tu fecha de nacimiento.";
    if (!sexo) errs.sexo_dni = "Seleccioná tu sexo según DNI.";

    return errs;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const errs = validate();
    setErrors(errs);

    if (Object.keys(errs).length > 0) {
      e.preventDefault();
      return;
    }

    setSubmitting(true);
    setTimeout(() => setSubmitting(false), 15000);
  }

  const inputClass =
    "mt-1 block w-full rounded-xl border px-3 text-[15px] shadow-sm focus:outline-none focus:border-[#378ADD] focus:ring-1 focus:ring-[#378ADD]/30";
  const inputStyle = {
    height: 44,
    borderColor: "#e5e7eb",
    color: "#1a1a1a",
  } as React.CSSProperties;
  const inputErrorStyle = {
    ...inputStyle,
    borderColor: "#E24B4A",
  };

  return (
    <>
      {serverError && (
        <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-[#E24B4A]">
          {serverError === "campos_requeridos"
            ? "Nombre, DNI, fecha de nacimiento y sexo son obligatorios."
            : serverError === "dni_duplicado"
              ? "No pudimos guardar tu información. Si el problema persiste, escribinos a soporte@docto.com.ar."
              : "Ocurrió un error. Intentá de nuevo."}
        </div>
      )}

      <form
        ref={formRef}
        action={completarPerfil}
        onSubmit={handleSubmit}
        className="mt-8 space-y-4"
      >
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
            style={errors.nombre_completo ? inputErrorStyle : inputStyle}
            placeholder="Juan Pérez"
            onChange={() => errors.nombre_completo && setErrors((e) => ({ ...e, nombre_completo: undefined }))}
          />
          {errors.nombre_completo && (
            <p className="mt-1 text-[13px] text-[#E24B4A]">{errors.nombre_completo}</p>
          )}
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
            pattern="\d{7,8}"
            maxLength={8}
            defaultValue={paciente?.dni ?? ""}
            className={inputClass}
            style={errors.dni ? inputErrorStyle : inputStyle}
            placeholder="12345678"
            onChange={() => errors.dni && setErrors((e) => ({ ...e, dni: undefined }))}
          />
          {errors.dni && (
            <p className="mt-1 text-[13px] text-[#E24B4A]">{errors.dni}</p>
          )}
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
            style={errors.fecha_nacimiento ? inputErrorStyle : inputStyle}
            onChange={() => errors.fecha_nacimiento && setErrors((e) => ({ ...e, fecha_nacimiento: undefined }))}
          />
          {errors.fecha_nacimiento && (
            <p className="mt-1 text-[13px] text-[#E24B4A]">{errors.fecha_nacimiento}</p>
          )}
        </div>

        <div>
          <label className="block text-[13px] font-medium text-gray-500">
            Sexo (según DNI)
          </label>
          <div className="mt-1 grid grid-cols-2 gap-3">
            {(["femenino", "masculino"] as const).map((opt) => (
              <label
                key={opt}
                className="flex flex-1 cursor-pointer items-center justify-center rounded-xl border px-3 text-[15px] font-medium text-gray-500 transition-all has-[:checked]:border-[#378ADD] has-[:checked]:bg-[#378ADD]/10 has-[:checked]:text-[#378ADD]"
                style={{
                  height: 44,
                  borderColor: errors.sexo_dni ? "#E24B4A" : "#e5e7eb",
                }}
              >
                <input
                  type="radio"
                  name="sexo_dni"
                  value={opt}
                  required
                  defaultChecked={paciente?.sexo_dni === opt}
                  className="sr-only"
                  onChange={() => errors.sexo_dni && setErrors((e) => ({ ...e, sexo_dni: undefined }))}
                />
                {opt === "femenino" ? "Femenino" : "Masculino"}
              </label>
            ))}
          </div>
          {errors.sexo_dni && (
            <p className="mt-1 text-[13px] text-[#E24B4A]">{errors.sexo_dni}</p>
          )}
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

        <div className="pt-2">
          <label className="flex items-start gap-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={checkTerminos}
              onChange={(e) => setCheckTerminos(e.target.checked)}
              className="mt-0.5 h-5 w-5 rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">
              Leí y acepto los{" "}
              <button type="button" onClick={() => setModalTerminos(true)} className="font-medium underline" style={{ color: "#378ADD" }}>
                Términos y Condiciones
              </button>{" "}
              de Docto
            </span>
          </label>
        </div>

        {checkTerminos && (
          <input type="hidden" name="terminos_aceptados" value="true" />
        )}

        <button
          type="submit"
          disabled={submitting || !checkTerminos}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#378ADD] py-3.5 text-sm font-semibold text-white active:scale-[0.97] transition-all duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting && (
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
              <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          )}
          {submitting ? "Guardando..." : "Guardar y continuar"}
        </button>

        {submitting && (
          <p className="mt-3 text-center text-xs text-gray-400">
            Guardando tus datos, esperá un momento...
          </p>
        )}
      </form>

      <ModalTerminos open={modalTerminos} onClose={() => setModalTerminos(false)} />
    </>
  );
}
