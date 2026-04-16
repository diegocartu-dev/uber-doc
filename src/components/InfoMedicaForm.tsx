"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type PacienteData = {
  fecha_nacimiento: string | null;
  sexo_dni: string | null;
  tiene_cobertura: boolean | null;
  obra_social: string | null;
  nro_afiliado: string | null;
  perfil_medico_completado: boolean | null;
} | null;

type Props = {
  paciente: PacienteData;
  redirect: string;
};

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function parseFecha(fecha: string | null): { dia: string; mes: string; anio: string } {
  if (!fecha) return { dia: "", mes: "", anio: "" };
  const [anio, mes, dia] = fecha.split("-");
  return { dia: String(parseInt(dia)), mes: String(parseInt(mes)), anio };
}

type Estado = "A" | "B" | "C";

function calcularEstado(paciente: PacienteData): Estado {
  if (!paciente?.perfil_medico_completado) return "A";
  if (!paciente?.fecha_nacimiento || !paciente?.sexo_dni) return "C";
  return "B";
}

export default function InfoMedicaForm({ paciente, redirect }: Props) {
  const router = useRouter();
  const estadoInicial = calcularEstado(paciente);
  const [modo, setModo] = useState<"lectura" | "edicion">(
    estadoInicial === "B" ? "lectura" : "edicion"
  );

  // Form state
  const parsed = parseFecha(paciente?.fecha_nacimiento ?? null);
  const [sexo, setSexo] = useState<string>(paciente?.sexo_dni ?? "");
  const [dia, setDia] = useState(parsed.dia);
  const [mes, setMes] = useState(parsed.mes);
  const [anio, setAnio] = useState(parsed.anio);
  const [tieneCobertura, setTieneCobertura] = useState(paciente?.tiene_cobertura ?? false);
  const [obraSocial, setObraSocial] = useState(paciente?.obra_social ?? "");
  const [nroAfiliado, setNroAfiliado] = useState(paciente?.nro_afiliado ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const anioActual = new Date().getFullYear();
  const formValido = sexo !== "" && dia !== "" && mes !== "" && anio !== "";

  async function handleGuardar() {
    setSaving(true);
    setError(null);

    const fechaNacimiento = `${anio}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;

    try {
      const res = await fetch("/api/paciente/perfil-medico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha_nacimiento: fechaNacimiento,
          sexo_dni: sexo,
          tiene_cobertura: tieneCobertura,
          obra_social: tieneCobertura ? obraSocial : null,
          nro_afiliado: tieneCobertura ? nroAfiliado : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al guardar.");
        setSaving(false);
        return;
      }

      router.push(redirect);
    } catch {
      setError("Error de conexión. Intentá de nuevo.");
      setSaving(false);
    }
  }

  function handleConfirmar() {
    router.push(redirect);
  }

  // MODO LECTURA (Estado B)
  if (modo === "lectura") {
    const fechaDisplay = paciente?.fecha_nacimiento
      ? (() => {
          const p = parseFecha(paciente.fecha_nacimiento);
          return `${p.dia} de ${MESES[parseInt(p.mes) - 1]} de ${p.anio}`;
        })()
      : "---";

    return (
      <div className="flex min-h-dvh flex-col bg-white">
        <div className="mx-auto w-full max-w-lg flex-1 px-6 py-10">
          {/* Header */}
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#378ADD]/10">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#378ADD" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.8 2.3A.3.3 0 105 2H19a2 2 0 012 2v16a2 2 0 01-2 2H5a2 2 0 01-2-2V4a2 2 0 01.8-1.7z"/>
                <path d="M8 10h8"/><path d="M8 14h4"/>
                <circle cx="16" cy="18" r="2"/>
              </svg>
            </div>
            <h1 className="mt-4 text-lg font-medium text-gray-900">Tu información médica</h1>
            <p className="mt-1.5 text-sm text-gray-400">Estos datos se usan para tu receta.</p>
          </div>

          {/* Tarjeta lectura */}
          <div className="mt-8 rounded-xl bg-[#f8f9fa] p-5 space-y-3 text-sm" style={{ border: "0.5px solid #e5e7eb" }}>
            <div className="flex justify-between">
              <span className="text-gray-500">Sexo (según DNI)</span>
              <span className="font-medium text-gray-900 capitalize">{paciente?.sexo_dni ?? "---"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Fecha de nacimiento</span>
              <span className="font-medium text-gray-900">{fechaDisplay}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Cobertura</span>
              <span className="font-medium text-gray-900">
                {paciente?.tiene_cobertura ? (paciente?.obra_social ?? "Si") : "Particular"}
              </span>
            </div>
            {paciente?.tiene_cobertura && paciente?.nro_afiliado && (
              <div className="flex justify-between">
                <span className="text-gray-500">Nro. afiliado</span>
                <span className="font-medium text-gray-900">{paciente.nro_afiliado}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-6 space-y-3">
            <button
              onClick={handleConfirmar}
              className="w-full rounded-xl bg-[#378ADD] py-3.5 text-sm font-medium text-white active:scale-[0.97] transition-all duration-100"
            >
              Confirmar y entrar
            </button>
            <button
              onClick={() => setModo("edicion")}
              className="w-full text-center text-sm text-[#888780] hover:text-gray-600"
            >
              Editar datos
            </button>
          </div>
        </div>
      </div>
    );
  }

  // MODO EDICION (Estado A y C)
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <div className="mx-auto w-full max-w-lg flex-1 px-6 py-10">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#378ADD]/10">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#378ADD" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.8 2.3A.3.3 0 105 2H19a2 2 0 012 2v16a2 2 0 01-2 2H5a2 2 0 01-2-2V4a2 2 0 01.8-1.7z"/>
              <path d="M8 10h8"/><path d="M8 14h4"/>
              <circle cx="16" cy="18" r="2"/>
            </svg>
          </div>
          <h1 className="mt-4 text-lg font-medium text-gray-900">Tu información médica</h1>
          <p className="mt-1.5 text-sm text-gray-400">La usamos para completar tu receta. Solo la ven vos y tu médico.</p>
        </div>

        {error && (
          <div className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
        )}

        {/* Sexo según DNI */}
        <div className="mt-8">
          <label className="mb-2 block text-sm font-medium text-gray-700">Sexo (según DNI)</label>
          <div className="grid grid-cols-2 gap-3">
            {(["femenino", "masculino"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setSexo(opt)}
                className="flex items-center justify-center rounded-xl py-3 text-sm font-medium transition-all duration-150"
                style={{
                  height: 44,
                  border: sexo === opt ? "1.5px solid #378ADD" : "1px solid #e5e7eb",
                  backgroundColor: sexo === opt ? "rgba(55,138,221,0.1)" : "white",
                  color: sexo === opt ? "#378ADD" : "#6b7280",
                }}
              >
                {opt === "femenino" ? "Femenino" : "Masculino"}
              </button>
            ))}
          </div>
        </div>

        {/* Fecha de nacimiento */}
        <div className="mt-5">
          <label className="mb-2 block text-sm font-medium text-gray-700">Fecha de nacimiento</label>
          <div className="grid grid-cols-3 gap-2">
            {/* Dia */}
            <select
              value={dia}
              onChange={(e) => setDia(e.target.value)}
              className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-[#378ADD] focus:ring-1 focus:ring-[#378ADD]/30"
            >
              <option value="">Dia</option>
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i + 1} value={String(i + 1)}>{i + 1}</option>
              ))}
            </select>

            {/* Mes */}
            <select
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-[#378ADD] focus:ring-1 focus:ring-[#378ADD]/30"
            >
              <option value="">Mes</option>
              {MESES.map((m, i) => (
                <option key={i} value={String(i + 1)}>{m}</option>
              ))}
            </select>

            {/* Anio */}
            <select
              value={anio}
              onChange={(e) => setAnio(e.target.value)}
              className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-[#378ADD] focus:ring-1 focus:ring-[#378ADD]/30"
            >
              <option value="">Anio</option>
              {Array.from({ length: anioActual - 1920 + 1 }, (_, i) => {
                const y = anioActual - i;
                return <option key={y} value={String(y)}>{y}</option>;
              })}
            </select>
          </div>
        </div>

        {/* Toggle cobertura */}
        <div className="mt-6">
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

          {/* Campos cobertura con animacion */}
          <div
            className="overflow-hidden transition-all duration-200"
            style={{
              maxHeight: tieneCobertura ? 200 : 0,
              opacity: tieneCobertura ? 1 : 0,
            }}
          >
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-sm text-gray-600">Obra social</label>
                <input
                  type="text"
                  value={obraSocial}
                  onChange={(e) => setObraSocial(e.target.value)}
                  placeholder="Ej: OSDE, Swiss Medical, PAMI..."
                  className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-[#378ADD] focus:ring-1 focus:ring-[#378ADD]/30"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-gray-600">Nro. de afiliado</label>
                <input
                  type="text"
                  value={nroAfiliado}
                  onChange={(e) => setNroAfiliado(e.target.value)}
                  placeholder="Número de afiliado"
                  className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-[#378ADD] focus:ring-1 focus:ring-[#378ADD]/30"
                />
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-8 pb-6">
          <button
            onClick={handleGuardar}
            disabled={!formValido || saving}
            className="w-full rounded-xl bg-[#378ADD] py-3.5 text-sm font-medium text-white transition-all duration-100 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Guardando...
              </span>
            ) : (
              "Guardar y entrar"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
