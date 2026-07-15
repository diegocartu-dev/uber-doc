"use client";

// Crear agenda — MODELO B (spec docs/specs/2026-07-14-rediseno-como-atiende-medico.md,
// aprobada por Diego 14/07, implementada 15/07).
//
// DECISIÓN registrada: cada agenda tiene UN solo horario, aplicado a uno o varios
// días. La semana se compone APILANDO agendas simples ("Mañanas" 9-13 + "Tardes"
// 15-19 = dos agendas). Fundamento: pausar/editar granular + EL PRECIO ES POR
// AGENDA (mañanas $50k / guardias $70k). Se descarta el modelo rico (franjas
// múltiples + horario propio por día) que vivía acá antes.
//
// Regla transversal aprobada: NADA prellenado — todo campo arranca vacío y es
// obligatorio; el valor sugerido va como placeholder gris ($ 50.000). La duración
// y el precio son POR AGENDA: no se heredan de medicos.duracion_consulta (que en
// médicos del registro nuevo es NULL — causaba "La duración del turno debe ser un
// número positivo" al guardar).

import { useState, useTransition, useEffect, useRef } from "react";
import { guardarModelo } from "./actions";
import InputMoneda from "@/components/ui/InputMoneda";

type Canal = "clinica_virtual" | "consultorio_privado";

const DIAS = [
  { num: 1, label: "L", nombre: "Lunes" },
  { num: 2, label: "M", nombre: "Martes" },
  { num: 3, label: "X", nombre: "Miércoles" },
  { num: 4, label: "J", nombre: "Jueves" },
  { num: 5, label: "V", nombre: "Viernes" },
  { num: 6, label: "S", nombre: "Sábado" },
  { num: 7, label: "D", nombre: "Domingo" },
];

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
      className="appearance-none rounded-lg bg-[#f8f9fa] px-2 py-1.5 text-[15px] md:text-sm focus:outline-none focus:ring-1 focus:ring-[#378ADD] min-h-[44px]"
      style={{ ...SELECT_BORDER, color: value === "" ? "#9ca3af" : "#111827" }}
    >
      <option value="" disabled>--</option>
      {opciones.map((o) => <option key={o} value={o} style={{ color: "#111827" }}>{o}</option>)}
    </select>
  );
}

// Formato yyyy-mm-dd local (el que esperan los <input type="date">).
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function FormularioModelo({ canal }: { canal: Canal }) {
  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState(0); // 0 = vacío (InputMoneda)
  const [duracion, setDuracion] = useState(""); // "" = sin elegir
  const [dias, setDias] = useState<Record<number, boolean>>({ 1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false });
  // UN solo horario para todos los días seleccionados. "" = sin elegir (placeholder --).
  const [horaIni, setHoraIni] = useState("");
  const [minIni, setMinIni] = useState("");
  const [horaFin, setHoraFin] = useState("");
  const [minFin, setMinFin] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  // "Sin fecha de fin" (Martín, gate 15/07): el médico que atiende lunes y
  // miércoles indefinidamente no tiene por qué inventar un vencimiento (la
  // agenda con fecha_fin vencida moría en silencio). Sentinel 2099-12-31: el
  // cron extiende el horizonte día a día; la generación inicial está capeada
  // a 30 días en crearAgendaModelo.
  const [sinFin, setSinFin] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  // Error del SERVER — aviso resoluble (conflicto) en naranja, error duro en rojo.
  const [errorServer, setErrorServer] = useState<string | null>(null);
  const [avisoServer, setAvisoServer] = useState(false);
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const [isPending, startTransition] = useTransition();

  const hoy = toISODate(new Date());

  const nombreRef = useRef<HTMLInputElement>(null);
  const precioRef = useRef<HTMLDivElement>(null);
  const duracionRef = useRef<HTMLSelectElement>(null);
  const diasRef = useRef<HTMLDivElement>(null);
  const horarioRef = useRef<HTMLDivElement>(null);
  const fechasRef = useRef<HTMLInputElement>(null);

  const inicioCompleto = horaIni !== "" && minIni !== "";
  const finCompleto = horaFin !== "" && minFin !== "";

  // Validación pura — se reusa al Guardar y en la revalidación en vivo post-intento.
  function validar(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!nombre.trim()) errs.nombre = "Poné un nombre a la agenda.";
    if (!precio || precio <= 0) errs.precio = "Poné el valor de la consulta.";
    if (!duracion) errs.duracion = "Elegí la duración de cada turno.";
    if (!Object.values(dias).some(Boolean)) errs.dias = "Elegí al menos un día.";
    if (!inicioCompleto || !finCompleto) {
      errs.horario = "Completá el horario (desde y hasta).";
    } else if (`${horaIni}:${minIni}` >= `${horaFin}:${minFin}`) {
      errs.horario = "El horario de fin debe ser posterior al de inicio.";
    }
    if (!fechaInicio || (!sinFin && !fechaFin)) errs.fechas = sinFin ? "Elegí desde qué fecha vale esta agenda." : "Elegí desde y hasta qué fecha vale esta agenda.";
    else if (fechaInicio < hoy) errs.fechas = "La vigencia arranca desde hoy — no se pueden elegir fechas pasadas.";
    else if (!sinFin && fechaFin < fechaInicio) errs.fechas = "La fecha de fin debe ser igual o posterior a la de inicio.";
    return errs;
  }

  const completo = Object.keys(validar()).length === 0;

  // Revalidar en vivo recién después del primer intento (antes sería agresivo).
  useEffect(() => {
    if (!intentoGuardar) return;
    setErrores(validar());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intentoGuardar, nombre, precio, duracion, dias, horaIni, minIni, horaFin, minFin, fechaInicio, fechaFin]);

  function enfocarPrimerError(errs: Record<string, string>) {
    const orden: [string, React.RefObject<HTMLElement | null>][] = [
      ["nombre", nombreRef],
      ["precio", precioRef],
      ["duracion", duracionRef],
      ["dias", diasRef],
      ["horario", horarioRef],
      ["fechas", fechasRef],
    ];
    for (const [campo, ref] of orden) {
      if (errs[campo] && ref.current) {
        ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
        ref.current.focus({ preventScroll: true });
        return;
      }
    }
  }

  function handleGuardar() {
    setErrorServer(null);
    setIntentoGuardar(true);
    const errs = validar();
    setErrores(errs);
    if (Object.keys(errs).length > 0) {
      enfocarPrimerError(errs);
      return;
    }

    const horario = { inicio: `${horaIni}:${minIni}`, fin: `${horaFin}:${minFin}` };
    const franjas = DIAS.filter((d) => dias[d.num]).map((d) => ({
      dia_semana: d.num,
      hora_inicio: horario.inicio,
      hora_fin: horario.fin,
    }));

    startTransition(async () => {
      const result = await guardarModelo({
        nombre: nombre.trim(),
        fecha_inicio: fechaInicio,
        fecha_fin: sinFin ? "2099-12-31" : fechaFin,
        duracion_turno: parseInt(duracion, 10),
        precio,
        franjas,
        canal_origen: canal,
      });
      if (result?.error) {
        setErrorServer(result.error);
        setAvisoServer((result as { esAviso?: boolean })?.esAviso ?? false);
      }
    });
  }

  const inputClass = "rounded-lg bg-[#f8f9fa] px-3 py-2 text-[15px] md:text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#378ADD] min-h-[44px]";
  const borderStyle = SELECT_BORDER;
  const borderError = { border: "1px solid #E24B4A" };
  const bordeDe = (campo: string) => (errores[campo] ? borderError : borderStyle);
  const labelClass = "text-xs text-gray-500";
  const errClass = "mt-1 text-[13px]";

  const esPrivado = canal === "consultorio_privado";

  return (
    <div className="rounded-xl bg-white p-4 md:p-6" style={borderStyle}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-gray-900">Nueva agenda</h2>
        {/* Chip de canal — viene del punto de entrada, no se elige acá */}
        <span
          className="shrink-0 rounded-full px-3 py-1 text-[12px] font-medium"
          style={esPrivado
            ? { background: "var(--color-bg-tertiary)", color: "var(--color-text-secondary)", border: "1px solid #e5e7eb" }
            : { background: "var(--color-primary-soft)", color: "var(--color-primary)", border: "1px solid var(--color-primary-border)" }}
        >
          {esPrivado ? "Consultorio particular · privado" : "Clínica virtual"}
        </span>
      </div>

      {/* Nombre */}
      <div className="mt-4">
        <label className={labelClass}>Nombre de la agenda</label>
        <input
          ref={nombreRef}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: Mañanas de consultorio"
          className={`mt-1 w-full ${inputClass}`}
          style={bordeDe("nombre")}
        />
        {errores.nombre && <p className={errClass} style={{ color: "#E24B4A" }}>{errores.nombre}</p>}
      </div>

      {/* Valor y duración — POR AGENDA */}
      <div className="mt-4 flex flex-col md:flex-row gap-4">
        <div className="flex-1" ref={precioRef} tabIndex={-1}>
          <label className={labelClass}>Valor de la consulta</label>
          <div className="mt-1">
            <InputMoneda value={precio} onChange={setPrecio} placeholder="50.000" className={`w-full ${inputClass}`} style={bordeDe("precio")} />
          </div>
          {errores.precio && <p className={errClass} style={{ color: "#E24B4A" }}>{errores.precio}</p>}
        </div>
        <div className="flex-1">
          <label className={labelClass}>Duración de cada turno</label>
          <select
            ref={duracionRef}
            value={duracion}
            onChange={(e) => setDuracion(e.target.value)}
            className={`mt-1 w-full ${inputClass}`}
            style={{ ...bordeDe("duracion"), color: duracion === "" ? "#9ca3af" : "#111827" }}
          >
            <option value="" disabled>Elegí</option>
            <option value="20">20 minutos</option>
            <option value="30">30 minutos</option>
            <option value="45">45 minutos</option>
            <option value="60">60 minutos</option>
          </select>
          {errores.duracion && <p className={errClass} style={{ color: "#E24B4A" }}>{errores.duracion}</p>}
        </div>
      </div>

      {/* Días — multiselección simple, nada preseleccionado */}
      <div className="mt-5">
        <label className={labelClass}>Días que atendés</label>
        <div
          ref={diasRef}
          tabIndex={-1}
          className="mt-2 flex flex-wrap gap-[6px] rounded-lg focus:outline-none"
          style={errores.dias ? { ...borderError, padding: "6px" } : undefined}
        >
          {DIAS.map((d) => (
            <button
              key={d.num}
              onClick={() => setDias((prev) => ({ ...prev, [d.num]: !prev[d.num] }))}
              aria-label={`${d.nombre}${dias[d.num] ? " — atiende" : ""}`}
              aria-pressed={dias[d.num]}
              className="flex min-w-[44px] min-h-[44px] items-center justify-center rounded-lg text-xs font-medium transition-all duration-100 active:scale-95"
              style={dias[d.num]
                ? { background: "var(--color-primary)", color: "#fff" }
                : { background: "var(--color-bg-tertiary)", color: "var(--color-muted)" }}
            >
              {d.label}
            </button>
          ))}
        </div>
        {errores.dias && <p className={errClass} style={{ color: "#E24B4A" }}>{errores.dias}</p>}
      </div>

      {/* Horario — UNO solo, el mismo para esos días */}
      <div className="mt-5" ref={horarioRef} tabIndex={-1}>
        <label className={labelClass}>Horario (el mismo para esos días)</label>
        <div className="mt-2 space-y-2 rounded-lg p-3" style={errores.horario ? borderError : borderStyle}>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-gray-400 w-[44px] shrink-0">Desde</span>
            <SelectHora value={horaIni} onChange={setHoraIni} opciones={HORAS} ariaLabel="Hora de inicio" />
            <span className="text-gray-300">:</span>
            <SelectHora value={minIni} onChange={setMinIni} opciones={MINUTOS} ariaLabel="Minutos de inicio" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-gray-400 w-[44px] shrink-0">Hasta</span>
            <SelectHora value={horaFin} onChange={setHoraFin} opciones={HORAS} ariaLabel="Hora de fin" />
            <span className="text-gray-300">:</span>
            <SelectHora value={minFin} onChange={setMinFin} opciones={MINUTOS} ariaLabel="Minutos de fin" />
          </div>
        </div>
        {errores.horario && <p className={errClass} style={{ color: "#E24B4A" }}>{errores.horario}</p>}
      </div>

      {/* Vigencia — desde HOY, fechas pasadas bloqueadas. "Sin fecha de fin" evita
          el vencimiento inventado (y silencioso) para el que atiende siempre. */}
      <div className="mt-5">
        <label className={labelClass}>Vigencia</label>
        <div className="mt-1 flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <span className="text-[12px] text-gray-400">Desde</span>
            <input ref={fechasRef} type="date" value={fechaInicio} min={hoy} onChange={(e) => setFechaInicio(e.target.value)} className={`mt-1 w-full ${inputClass}`} style={bordeDe("fechas")} />
          </div>
          {!sinFin && (
            <div className="flex-1">
              <span className="text-[12px] text-gray-400">Hasta</span>
              <input type="date" value={fechaFin} min={fechaInicio || hoy} onChange={(e) => setFechaFin(e.target.value)} className={`mt-1 w-full ${inputClass}`} style={bordeDe("fechas")} />
            </div>
          )}
        </div>
        <label className="mt-2 flex cursor-pointer items-center gap-2.5 py-1">
          <input
            type="checkbox"
            checked={sinFin}
            onChange={(e) => setSinFin(e.target.checked)}
            className="h-5 w-5 shrink-0 rounded border-gray-300 text-[#378ADD] focus:ring-[#378ADD]"
          />
          <span className="text-[13px] text-gray-700">Sin fecha de fin — la agenda sigue hasta que la pauses</span>
        </label>
        {errores.fechas && <p className={errClass} style={{ color: "#E24B4A" }}>{errores.fechas}</p>}
      </div>

      {/* Tip modelo B — comunicado como ventaja */}
      <p className="mt-5 rounded-lg px-3 py-2.5 text-[13px]" style={{ background: "var(--color-primary-soft)", color: "var(--color-text-secondary)" }}>
        ¿Atendés mañana y tarde, o con otro precio? <strong>Creá otra agenda</strong> — así podés
        pausar o editar cada bloque por separado.
      </p>

      {/* Banner del server: aviso resoluble naranja / error duro rojo */}
      {errorServer && (
        <div
          role="alert"
          className="mt-4 rounded-lg p-3 text-sm"
          style={avisoServer
            ? { backgroundColor: "#FBEEE6", color: "#D85A30" }
            : { backgroundColor: "#FDECEC", color: "#E24B4A" }}
        >
          {errorServer}
        </div>
      )}

      {/* Acciones — CTA atenuado hasta completar (pero clickeable: marca qué falta) */}
      <div className="mt-6 flex flex-col md:flex-row gap-3">
        <a href={esPrivado ? "/medico/como-atendes/consultorio" : "/medico/agenda"} className="flex-1 flex items-center justify-center rounded-lg bg-gray-100 px-4 min-h-[48px] md:min-h-0 md:py-2.5 text-center text-sm text-gray-700 hover:bg-gray-200">
          Cancelar
        </a>
        <button
          onClick={handleGuardar}
          disabled={isPending}
          className={`flex-1 flex items-center justify-center gap-2 rounded-lg bg-[#378ADD] px-4 min-h-[48px] md:min-h-0 md:py-2.5 text-sm font-medium text-white hover:bg-[#2e6fb5] active:scale-95 active:opacity-80 transition-all duration-100 ${completo && !isPending ? "" : "opacity-50"}`}
        >
          {isPending && (
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
              <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          )}
          {isPending ? "Creando..." : "Crear agenda"}
        </button>
      </div>
    </div>
  );
}
