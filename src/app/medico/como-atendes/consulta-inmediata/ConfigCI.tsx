"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ChevronLeft, Zap } from "lucide-react";
import { actualizarDisponibilidad } from "@/app/dashboard/actions";
import InputMoneda from "@/components/ui/InputMoneda";

const HORAS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
const MINUTOS = ["00", "15", "30", "45"];

const SELECT_BORDER = { border: "0.5px solid #e5e7eb" };

// A nivel módulo (no dentro del render): un componente creado en cada render
// resetea su estado y dispara la regla react "no components during render".
function SelectHora({ value, onChange, opciones, ariaLabel }: { value: string; onChange: (v: string) => void; opciones: string[]; ariaLabel: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className="appearance-none rounded-lg bg-white px-2 py-1.5 text-[15px] md:text-sm focus:outline-none focus:ring-1 focus:ring-[#378ADD] min-h-[44px]"
      style={{ ...SELECT_BORDER, color: value === "" ? "#9ca3af" : "#111827" }}
    >
      <option value="" disabled>--</option>
      {opciones.map((o) => <option key={o} value={o} style={{ color: "#111827" }}>{o}</option>)}
    </select>
  );
}

type Inicial = {
  disponible: boolean;
  desde: string; // "HH:MM" o ""
  hasta: string;
  duracion: string; // "20" | ... | ""
  precio: number; // 0 = vacío
  ciEnConsultorio: boolean; // tilde "CI también en mi consultorio particular"
};

// Configurar Consulta Inmediata — spec aprobada 14/07. Toggle "Disponible ahora"
// atenuado y apagado hasta completar valor + duración + horario. Guardar ídem.
export default function ConfigCI({ inicial, activacionCompleta }: { inicial: Inicial; activacionCompleta: boolean }) {
  const [precio, setPrecio] = useState(inicial.precio);
  const [duracion, setDuracion] = useState(inicial.duracion);
  const [horaIni, setHoraIni] = useState(inicial.desde.split(":")[0] ?? "");
  const [minIni, setMinIni] = useState(inicial.desde ? (inicial.desde.split(":")[1] ?? "00") : "");
  const [horaFin, setHoraFin] = useState(inicial.hasta.split(":")[0] ?? "");
  const [minFin, setMinFin] = useState(inicial.hasta ? (inicial.hasta.split(":")[1] ?? "00") : "");
  const [disponible, setDisponible] = useState(inicial.disponible);
  // Opt-in explícito (decisión Diego 15/07): la CI en el consultorio particular
  // se activa SOLO con este tilde. DEFAULT false — nadie queda incluido sin elegirlo.
  const [ciEnConsultorio, setCiEnConsultorio] = useState(inicial.ciEnConsultorio);
  // Último estado CONFIRMADO por el server — el revert de un error vuelve acá,
  // no al valor del primer render (Roberto: toggle OK + toggle fallido dejaba
  // el switch desincronizado hasta el refresh).
  const [confirmado, setConfirmado] = useState(inicial.disponible);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [isPending, startTransition] = useTransition();

  const desde = horaIni && minIni ? `${horaIni}:${minIni}` : "";
  const hasta = horaFin && minFin ? `${horaFin}:${minFin}` : "";
  const horarioValido = !!desde && !!hasta && desde < hasta;
  const completo = precio > 0 && !!duracion && horarioValido;

  function persistir(nuevoDisponible: boolean) {
    setError(null);
    setGuardado(false);
    startTransition(async () => {
      const result = await actualizarDisponibilidad({
        disponible: nuevoDisponible,
        disponible_desde: desde,
        disponible_hasta: hasta,
        duracion_consulta: duracion ? parseInt(duracion, 10) : undefined,
        precio_consulta: precio > 0 ? precio : undefined,
        ci_en_consultorio: ciEnConsultorio,
      });
      if (result?.error) {
        setError(result.error);
        setDisponible(confirmado); // revertir al último estado confirmado
        return;
      }
      setDisponible(nuevoDisponible);
      setConfirmado(nuevoDisponible);
      setGuardado(true);
    });
  }

  function handleToggle() {
    if (isPending) return;
    // APAGAR está permitido SIEMPRE (Sofía R2): el gate de completitud aplica
    // solo para activarse — un médico legacy disponible con config incompleta
    // tiene que poder desactivarse desde acá.
    if (!disponible && !completo) {
      setError("Completá valor, duración y horario para poder activarte.");
      return;
    }
    persistir(!disponible);
  }

  function handleGuardar() {
    if (isPending) return;
    // Sin dead-end mudo (Sofía R1): el click con campos incompletos explica qué falta.
    if (!completo) {
      setError("Completá valor, duración y horario para guardar.");
      return;
    }
    persistir(disponible);
  }

  const inputStyle = SELECT_BORDER;
  const labelClass = "text-[13px] font-medium text-gray-700";

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <Link href="/medico/como-atendes" className="inline-flex items-center gap-1 py-2 text-sm font-medium" style={{ color: "var(--color-text-link)" }}>
        <ChevronLeft size={16} /> Volver
      </Link>

      <div className="mt-2 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "var(--color-primary-soft)" }}>
          <Zap size={18} style={{ color: "var(--color-primary)" }} />
        </span>
        <div>
          <h1 className="text-[20px] font-semibold text-gray-900">Consulta inmediata</h1>
          <p className="text-[13px] text-gray-500">Pacientes que te consultan ahora, sin turno.</p>
        </div>
      </div>

      <div className="mt-5 space-y-5 rounded-xl bg-white p-4 md:p-6" style={inputStyle}>
        {error && (
          <div role="alert" className="rounded-lg p-3 text-sm" style={{ backgroundColor: "#FDECEC", color: "#E24B4A" }}>
            {error}
          </div>
        )}
        {guardado && !error && (
          <div role="alert" className="rounded-lg p-3 text-sm" style={{ backgroundColor: "var(--color-success-soft)", color: "var(--color-success)" }}>
            Guardado. {disponible ? "Estás disponible para consultas inmediatas." : "Tu configuración quedó lista — activate cuando quieras atender."}
          </div>
        )}
        {!activacionCompleta && (
          <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: "rgba(186,117,23,0.08)", color: "#BA7517" }}>
            Te falta completar tu activación (Mercado Pago y firma) para poder atender.{" "}
            <Link href="/medico/onboarding" className="font-medium underline">Completala acá.</Link>
          </div>
        )}

        {/* Valor */}
        <div>
          <label className={labelClass}>Valor de la consulta</label>
          <div className="mt-1">
            <InputMoneda value={precio} onChange={setPrecio} placeholder="50.000" className="w-full rounded-lg bg-white px-3 py-2 text-[15px] min-h-[44px]" style={inputStyle} />
          </div>
        </div>

        {/* Duración */}
        <div>
          <label className={labelClass}>Duración de cada consulta</label>
          <select
            value={duracion}
            onChange={(e) => setDuracion(e.target.value)}
            className="mt-1 w-full appearance-none rounded-lg bg-white px-3 py-2 text-[15px] min-h-[44px] focus:outline-none focus:ring-1 focus:ring-[#378ADD]"
            style={{ ...inputStyle, color: duracion === "" ? "#9ca3af" : "#111827" }}
          >
            <option value="" disabled>Elegí</option>
            <option value="20">20 minutos</option>
            <option value="30">30 minutos</option>
            <option value="45">45 minutos</option>
            <option value="60">60 minutos</option>
          </select>
        </div>

        {/* Horario */}
        <div>
          <label className={labelClass}>Horario en que aceptás consultas</label>
          <div className="mt-1 space-y-2 rounded-lg bg-[#f8f9fa] p-3" style={inputStyle}>
            <div className="flex items-center gap-2">
              <span className="w-[44px] shrink-0 text-[12px] text-gray-400">Desde</span>
              <SelectHora value={horaIni} onChange={setHoraIni} opciones={HORAS} ariaLabel="Hora desde" />
              <span className="text-gray-300">:</span>
              <SelectHora value={minIni} onChange={setMinIni} opciones={MINUTOS} ariaLabel="Minutos desde" />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-[44px] shrink-0 text-[12px] text-gray-400">Hasta</span>
              <SelectHora value={horaFin} onChange={setHoraFin} opciones={HORAS} ariaLabel="Hora hasta" />
              <span className="text-gray-300">:</span>
              <SelectHora value={minFin} onChange={setMinFin} opciones={MINUTOS} ariaLabel="Minutos hasta" />
            </div>
          </div>
          <p className="mt-1.5 text-[13px] text-gray-500">
            Fuera de esa franja no aparecés como disponible, aunque dejes el interruptor en sí.
          </p>
          {desde && hasta && !horarioValido && (
            <p className="mt-1 text-[13px]" style={{ color: "#E24B4A" }}>El horario de fin debe ser posterior al de inicio.</p>
          )}
        </div>

        {/* Interruptor Disponible ahora */}
        <div className="border-t border-gray-100 pt-4">
          <div className={`flex items-center justify-between ${completo ? "" : "opacity-50"}`}>
            <div className="pr-3">
              <p className="text-[15px] font-semibold text-gray-900">Disponible ahora</p>
              <p className="mt-0.5 text-[13px] text-gray-500">
                Mientras esté activo, los pacientes te ven en la clínica y te pueden consultar.
              </p>
            </div>
            <button
              onClick={handleToggle}
              disabled={isPending}
              aria-label={disponible ? "Desactivar disponibilidad" : "Activar disponibilidad"}
              aria-checked={disponible}
              role="switch"
              className={`relative inline-flex h-[30px] w-[52px] shrink-0 items-center rounded-full transition-colors ${
                disponible ? "bg-[#378ADD]" : "bg-gray-300"
              } ${isPending ? "cursor-wait" : "cursor-pointer"}`}
            >
              <span className={`inline-block h-[24px] w-[24px] rounded-full bg-white shadow transition-transform ${disponible ? "translate-x-[24px]" : "translate-x-[3px]"}`} />
            </button>
          </div>
          {!completo && (
            <p className="mt-2 text-[13px]" style={{ color: "#BA7517" }}>
              Completá valor, duración y horario para poder activarte.
            </p>
          )}
        </div>

        {/* Tilde CI en consultorio particular — opt-in explícito (Diego 15/07) */}
        <div className="border-t border-gray-100 pt-4">
          <label className="flex cursor-pointer items-start gap-3 py-1">
            <input
              type="checkbox"
              checked={ciEnConsultorio}
              onChange={(e) => setCiEnConsultorio(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-gray-300 text-[#378ADD] focus:ring-[#378ADD]"
            />
            <span className="text-sm text-gray-700">
              Ofrecer la consulta inmediata también en mi <strong>Consultorio Particular</strong>
              <span className="mt-0.5 block text-[13px] font-normal text-gray-500">
                Los pacientes que entren por tu link privado van a poder consultarte al instante,
                con el mismo valor y horario de arriba. Se guarda al tocar Guardar.
              </span>
            </span>
          </label>
        </div>

        {/* Guardar */}
        <button
          onClick={handleGuardar}
          disabled={isPending}
          className={`w-full rounded-lg bg-[#378ADD] px-4 py-3 text-sm font-semibold text-white transition-all duration-100 active:scale-[0.98] hover:bg-[#2e6fb5] ${completo && !isPending ? "" : "opacity-50"}`}
        >
          {isPending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </div>
  );
}
