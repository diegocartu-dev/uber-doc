"use client";

// Formulario para crear/editar modelos de agenda
// Extensiones pendientes:
// - Modo edicion: recibir modeloId como prop, precargar datos, usar editarModelo()
// - Preview de turnos generados antes de guardar
// - Selector de bloqueos dentro del modelo

import { useState, useTransition, useEffect, useRef } from "react";
import { guardarModelo } from "./actions";
import InputMoneda from "@/components/ui/InputMoneda";

type Modelo = { id: string; nombre: string; fecha_inicio: string; fecha_fin: string; activo: boolean; prioridad: number };
type Franja = { dia_semana: number; hora_inicio: string; hora_fin: string };

const DIAS = [
  { num: 1, label: "L" },
  { num: 2, label: "M" },
  { num: 3, label: "X" },
  { num: 4, label: "J" },
  { num: 5, label: "V" },
  { num: 6, label: "S" },
  { num: 7, label: "D" },
];

const HORAS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
const MINUTOS = ["00", "15", "30", "45"];

// 0 = no atiende · 1 = horario común (azul lleno) · 2 = horario propio (azul borde)
type DiaEstado = 0 | 1 | 2;

// Formato yyyy-mm-dd (el que esperan los <input type="date"> y guardarModelo)
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultFechaInicio(): string {
  return toISODate(new Date());
}

function defaultFechaFin(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return toISODate(d);
}

export default function FormularioModelo({
  modelosExistentes,
  duracionConsulta,
  precioConsulta,
}: {
  modelosExistentes: Modelo[];
  duracionConsulta: number;
  precioConsulta: number;
}) {
  const [nombre, setNombre] = useState("");
  const [duracionTurno, setDuracionTurno] = useState(duracionConsulta);
  const [precio, setPrecio] = useState(precioConsulta);
  const [fechaInicio, setFechaInicio] = useState(defaultFechaInicio);
  const [fechaFin, setFechaFin] = useState(defaultFechaFin);
  const [dias, setDias] = useState<Record<number, DiaEstado>>({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 });
  const [franjasBase, setFranjasBase] = useState<{ inicio: string; fin: string }[]>([
    { inicio: "09:00", fin: "13:00" },
  ]);
  const [franjasCustom, setFranjasCustom] = useState<Record<number, { inicio: string; fin: string }[]>>({});
  const [soloConsultorioPrivado, setSoloConsultorioPrivado] = useState(false);
  // Errores por campo (clave: nombre | fechas | dias | franjas). Cada campo muestra
  // SU mensaje pegado debajo + borde rojo. Reemplaza el banner global "mudo".
  const [errores, setErrores] = useState<Record<string, string>>({});
  // Error del SERVER (falló el guardado) — banner general cerca del botón, no de campo.
  const [errorServer, setErrorServer] = useState<string | null>(null);
  // Aviso resoluble (R1 / turnos reservados) → naranja; error duro del sistema → rojo.
  const [avisoServer, setAvisoServer] = useState(false);
  // Recién después del primer intento de guardar revalidamos onChange (no antes — sería agresivo).
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Refs por campo validable — para hacer scrollIntoView + focus al primero con error.
  const nombreRef = useRef<HTMLInputElement>(null);
  const fechaInicioRef = useRef<HTMLInputElement>(null);
  const diasRef = useRef<HTMLDivElement>(null);
  const franjasRef = useRef<HTMLDivElement>(null);

  // Una vez que el médico tocó Guardar, revalidamos en vivo para que el rojo
  // desaparezca solo al corregir. Antes del primer intento NO validamos (sería agresivo).
  useEffect(() => {
    if (!intentoGuardar) return;
    setErrores(validar());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intentoGuardar, nombre, fechaInicio, fechaFin, dias, franjasBase, franjasCustom]);

  // Tocar un día cicla su estado: apagado → horario común → horario propio → apagado.
  // Todo se maneja desde la grilla de arriba (el color dice en qué estado está).
  // Las franjas propias NO se borran al ciclar: quedan guardadas por si vuelve a propio.
  function toggleDia(num: number) {
    const next: DiaEstado = dias[num] === 0 ? 1 : dias[num] === 1 ? 2 : 0;
    setDias((prev) => ({ ...prev, [num]: next }));
    if (next === 2 && !franjasCustom[num]) {
      setFranjasCustom((fc) => (fc[num] ? fc : { ...fc, [num]: [{ inicio: "09:00", fin: "13:00" }] }));
    }
  }

  // Volver un día a usar el horario común (propio → común), sin ciclar por "apagado".
  // No pierde sus franjas propias.
  function usarHorarioComun(num: number) {
    setDias((prev) => ({ ...prev, [num]: 1 }));
  }

  function addFranjaBase() {
    setFranjasBase((prev) => [...prev, { inicio: "14:00", fin: "18:00" }]);
  }

  function removeFranjaBase(idx: number) {
    setFranjasBase((prev) => prev.filter((_, i) => i !== idx));
  }

  function addFranjaCustom(dia: number) {
    setFranjasCustom((prev) => ({
      ...prev,
      [dia]: [...(prev[dia] ?? []), { inicio: "14:00", fin: "18:00" }],
    }));
  }

  function removeFranjaCustom(dia: number, idx: number) {
    setFranjasCustom((prev) => ({
      ...prev,
      [dia]: (prev[dia] ?? []).filter((_, i) => i !== idx),
    }));
  }

  function updateFranjaBase(idx: number, field: "inicio" | "fin", val: string) {
    setFranjasBase((prev) => prev.map((f, i) => i === idx ? { ...f, [field]: val } : f));
  }

  function updateFranjaCustom(dia: number, idx: number, field: "inicio" | "fin", val: string) {
    setFranjasCustom((prev) => ({
      ...prev,
      [dia]: (prev[dia] ?? []).map((f, i) => i === idx ? { ...f, [field]: val } : f),
    }));
  }

  // Construye la lista de franjas a enviar según días seleccionados.
  function construirFranjas(): Franja[] {
    const diasSeleccionados = Object.entries(dias).filter(([, v]) => v > 0).map(([k]) => parseInt(k));
    const todasFranjas: Franja[] = [];
    for (const diaNum of diasSeleccionados) {
      const estado = dias[diaNum];
      const franjasDelDia = estado === 2 ? (franjasCustom[diaNum] ?? []) : franjasBase;
      for (const f of franjasDelDia) {
        todasFranjas.push({ dia_semana: diaNum, hora_inicio: f.inicio, hora_fin: f.fin });
      }
    }
    return todasFranjas;
  }

  // Validación pura: devuelve un mapa de errores por campo (vacío = todo OK).
  // Se reusa al Guardar y en la revalidación onChange post-primer-intento.
  function validar(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!nombre.trim()) errs.nombre = "Ingresá un nombre para el modelo.";
    if (!fechaInicio || !fechaFin) errs.fechas = "Seleccioná fechas de inicio y fin.";
    else if (fechaFin < fechaInicio) errs.fechas = "La fecha de fin debe ser igual o posterior a la de inicio.";

    const diasSeleccionados = Object.entries(dias).filter(([, v]) => v > 0);
    if (diasSeleccionados.length === 0) errs.dias = "Seleccioná al menos un día.";
    else if (construirFranjas().length === 0) errs.franjas = "Agregá al menos una franja horaria.";

    return errs;
  }

  // Lleva al primer campo con error (en orden visual), foco adentro.
  function enfocarPrimerError(errs: Record<string, string>) {
    const orden: [string, React.RefObject<HTMLElement | null>][] = [
      ["nombre", nombreRef],
      ["fechas", fechaInicioRef],
      ["dias", diasRef],
      ["franjas", franjasRef],
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

    startTransition(async () => {
      const result = await guardarModelo({
        nombre: nombre.trim(),
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        duracion_turno: duracionTurno,
        precio,
        franjas: construirFranjas(),
        canal_origen: soloConsultorioPrivado ? "consultorio_privado" : "clinica_virtual",
      });
      if (result?.error) {
        setErrorServer(result.error);
        setAvisoServer((result as { esAviso?: boolean })?.esAviso ?? false);
      }
    });
  }

  const inputClass = "rounded-lg bg-[#f8f9fa] px-3 py-2 text-[15px] md:text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#378ADD] min-h-[44px]";
  const selectClass = "appearance-none rounded-lg bg-[#f8f9fa] px-2 py-1.5 text-[15px] md:text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#378ADD] min-h-[44px]";
  const borderStyle = { border: "0.5px solid #e5e7eb" };
  const borderError = { border: "1px solid #E24B4A" };
  // Borde rojo si el campo tiene error, gris si no.
  const bordeDe = (campo: string) => (errores[campo] ? borderError : borderStyle);

  function FranjaRow({
    franja,
    onUpdate,
    onRemove,
    canRemove,
  }: {
    franja: { inicio: string; fin: string };
    onUpdate: (field: "inicio" | "fin", val: string) => void;
    onRemove: () => void;
    canRemove: boolean;
  }) {
    const [ih, im] = franja.inicio.split(":");
    const [fh, fm] = franja.fin.split(":");
    return (
      <div>
        {/* Mobile: 2 filas — Desde / Hasta */}
        <div className="md:hidden space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-gray-400 w-[44px] shrink-0">Desde</span>
            <select value={ih} onChange={(e) => onUpdate("inicio", `${e.target.value}:${im}`)} className={selectClass} style={borderStyle}>
              {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
            <span className="text-gray-300">:</span>
            <select value={im} onChange={(e) => onUpdate("inicio", `${ih}:${e.target.value}`)} className={selectClass} style={borderStyle}>
              {MINUTOS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-gray-400 w-[44px] shrink-0">Hasta</span>
            <select value={fh} onChange={(e) => onUpdate("fin", `${e.target.value}:${fm}`)} className={selectClass} style={borderStyle}>
              {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
            <span className="text-gray-300">:</span>
            <select value={fm} onChange={(e) => onUpdate("fin", `${fh}:${e.target.value}`)} className={selectClass} style={borderStyle}>
              {MINUTOS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            {canRemove && (
              <button onClick={onRemove} className="flex items-center justify-center min-w-[44px] min-h-[44px] text-gray-400 hover:text-red-500 text-[16px]"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg></button>
            )}
          </div>
        </div>

        {/* Desktop: 1 fila inline */}
        <div className="hidden md:flex items-center gap-2">
          <select value={ih} onChange={(e) => onUpdate("inicio", `${e.target.value}:${im}`)} className={selectClass} style={borderStyle}>
            {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
          <span className="text-gray-300">:</span>
          <select value={im} onChange={(e) => onUpdate("inicio", `${ih}:${e.target.value}`)} className={selectClass} style={borderStyle}>
            {MINUTOS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <span className="text-xs text-gray-400">a</span>
          <select value={fh} onChange={(e) => onUpdate("fin", `${e.target.value}:${fm}`)} className={selectClass} style={borderStyle}>
            {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
          <span className="text-gray-300">:</span>
          <select value={fm} onChange={(e) => onUpdate("fin", `${fh}:${e.target.value}`)} className={selectClass} style={borderStyle}>
            {MINUTOS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          {canRemove && (
            <button onClick={onRemove} className="text-xs text-gray-400 hover:text-red-500"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg></button>
          )}
        </div>
      </div>
    );
  }

  const NOMBRE_DIA = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  const diasComun = DIAS.filter((d) => dias[d.num] === 1); // azul lleno: comparten horario común
  const diasPropio = DIAS.filter((d) => dias[d.num] === 2); // azul borde: horario propio

  return (
    <div className="rounded-xl bg-white p-4 md:p-6" style={borderStyle}>
      <h2 className="text-sm font-medium text-gray-900">Nueva agenda</h2>

      {/* Nombre */}
      <div className="mt-4">
        <label className="text-xs text-gray-400">Nombre</label>
        <input
          ref={nombreRef}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: Semana laboral, Guardias, Vacaciones"
          className={`mt-1 w-full ${inputClass}`}
          style={bordeDe("nombre")}
        />
        {errores.nombre && <p className="mt-1 text-[13px]" style={{ color: "#E24B4A" }}>{errores.nombre}</p>}
      </div>

      {/* Duracion y precio */}
      <div className="mt-4 flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <label className="text-xs text-gray-400">Duracion del turno</label>
          <select value={duracionTurno} onChange={(e) => setDuracionTurno(parseInt(e.target.value))} className={`mt-1 w-full ${inputClass}`} style={borderStyle}>
            <option value={20}>20 minutos</option>
            <option value={30}>30 minutos</option>
            <option value={45}>45 minutos</option>
            <option value={60}>60 minutos</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-400">Valor de consulta</label>
          <div className="mt-1">
            <InputMoneda value={precio} onChange={setPrecio} className={`w-full ${inputClass}`} style={borderStyle} />
          </div>
        </div>
      </div>

      {/* Fechas */}
      <div className="mt-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="text-xs text-gray-400">Desde</label>
            <input ref={fechaInicioRef} type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className={`mt-1 w-full ${inputClass}`} style={bordeDe("fechas")} />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-400">Hasta</label>
            <input type="date" value={fechaFin} min={fechaInicio || undefined} onChange={(e) => setFechaFin(e.target.value)} className={`mt-1 w-full ${inputClass}`} style={bordeDe("fechas")} />
          </div>
        </div>
        {errores.fechas && <p className="mt-1 text-[13px]" style={{ color: "#E24B4A" }}>{errores.fechas}</p>}
      </div>

      {/* Selector de dias — tocar prende/apaga el día (horario común) */}
      <div className="mt-5">
        <label className="text-xs text-gray-400">Días de atención</label>
        <div
          ref={diasRef}
          tabIndex={-1}
          className="mt-2 flex flex-wrap gap-[6px] rounded-lg focus:outline-none"
          style={errores.dias ? { ...borderError, padding: "6px" } : undefined}
        >
          {DIAS.map((d) => {
            const estado = dias[d.num];
            return (
              <button
                key={d.num}
                onClick={() => toggleDia(d.num)}
                aria-label={`${NOMBRE_DIA[d.num]}${estado === 1 ? " — atiende" : estado === 2 ? " — horario propio" : ""}`}
                className="relative flex min-w-[44px] min-h-[44px] items-center justify-center rounded-lg text-xs font-medium transition-all duration-100 active:scale-95"
                style={
                  estado === 1
                    ? { background: "var(--color-primary)", color: "#fff" }
                    : estado === 2
                      ? { background: "var(--color-primary-soft)", color: "var(--color-brand-dark)", border: "2px solid var(--color-primary)" }
                      : { background: "var(--color-bg-tertiary)", color: "var(--color-muted)" }
                }
              >
                {d.label}
                {estado === 2 && (
                  <span
                    className="absolute -top-1 -right-1 h-[10px] w-[10px] rounded-full"
                    style={{ background: "var(--color-primary)", border: "2px solid #fff" }}
                  />
                )}
              </button>
            );
          })}
        </div>
        {/* Leyenda: qué SIGNIFICA cada color (no cómo se llega) */}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]" style={{ color: "var(--color-muted)" }}>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 shrink-0 rounded" style={{ background: "var(--color-primary)" }} />
            comparten el horario común
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 shrink-0 rounded" style={{ background: "var(--color-primary-soft)", border: "2px solid var(--color-primary)" }} />
            tiene su horario propio
          </span>
        </div>
        {errores.dias && <p className="mt-1 text-[13px]" style={{ color: "#E24B4A" }}>{errores.dias}</p>}
      </div>

      {/* Zona de franjas (base + personalizadas) — ancla de scroll/foco para error de franjas */}
      <div ref={franjasRef} tabIndex={-1} className="focus:outline-none">
        {/* Horario común — conecta con sus días (barra azul + las letras de los días) */}
        {diasComun.length > 0 && (
          <div className="mt-5 rounded-lg bg-white p-4" style={{ border: "0.5px solid #e5e7eb", borderLeft: "4px solid var(--color-primary)" }}>
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap items-baseline gap-x-1.5">
                <span className="text-[13px] font-medium" style={{ color: "var(--color-brand-dark)" }}>Horario común</span>
                <span className="text-[13px] font-semibold tracking-[0.12em]" style={{ color: "var(--color-primary)" }}>
                  {diasComun.map((d) => d.label).join(" ")}
                </span>
              </div>
              <button onClick={addFranjaBase} className="shrink-0 text-xs hover:underline min-h-[44px] md:min-h-0 px-2" style={{ color: "var(--color-text-link)" }}>+ Agregar franja</button>
            </div>
            <p className="mt-0.5 text-[12px]" style={{ color: "var(--color-muted)" }}>Estos días comparten este horario · {duracionTurno} min por turno</p>
            <div className="mt-2 space-y-3 md:space-y-2">
              {franjasBase.map((f, i) => (
                <FranjaRow
                  key={i}
                  franja={f}
                  onUpdate={(field, val) => updateFranjaBase(i, field, val)}
                  onRemove={() => removeFranjaBase(i)}
                  canRemove={franjasBase.length > 1}
                />
              ))}
            </div>
          </div>
        )}

        {/* Horario propio por día */}
        {diasPropio.map((d) => {
          const diaNum = d.num;
          const franjasDelDia = franjasCustom[diaNum] ?? [];
          return (
            <div key={diaNum} className="mt-4 rounded-lg p-4" style={{ background: "var(--color-primary-soft)", border: "1px solid var(--color-primary-border)" }}>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium" style={{ color: "var(--color-brand-dark)" }}>
                  {NOMBRE_DIA[diaNum]} · horario propio
                </label>
                <button onClick={() => addFranjaCustom(diaNum)} className="text-xs hover:underline min-h-[44px] md:min-h-0 px-2" style={{ color: "var(--color-text-link)" }}>+ Agregar franja</button>
              </div>
              <div className="mt-2 space-y-3 md:space-y-2">
                {franjasDelDia.map((f, i) => (
                  <FranjaRow
                    key={i}
                    franja={f}
                    onUpdate={(field, val) => updateFranjaCustom(diaNum, i, field, val)}
                    onRemove={() => removeFranjaCustom(diaNum, i)}
                    canRemove={franjasDelDia.length > 1}
                  />
                ))}
              </div>
              <button onClick={() => usarHorarioComun(diaNum)} className="mt-2 flex items-center min-h-[40px] text-[12px] hover:underline" style={{ color: "var(--color-muted)" }}>← Usar el horario común</button>
            </div>
          );
        })}

        {errores.franjas && <p className="mt-2 text-[13px]" style={{ color: "#E24B4A" }}>{errores.franjas}</p>}
      </div>

      {/* Canal */}
      <label className="mt-5 flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={soloConsultorioPrivado}
          onChange={(e) => setSoloConsultorioPrivado(e.target.checked)}
          className="h-5 w-5 shrink-0 rounded border-gray-300 text-[#378ADD] focus:ring-[#378ADD]"
        />
        <span className="text-sm text-gray-700">Estos turnos son solo para mi Consultorio Particular</span>
      </label>

      {/* Banner del server. Aviso resoluble (R1 / turnos reservados) → naranja alerta;
          error duro del sistema → rojo. */}
      {errorServer && (
        <div
          className="mt-6 rounded-lg p-3 text-sm"
          style={avisoServer
            ? { backgroundColor: "#FBEEE6", color: "#D85A30" }
            : { backgroundColor: "#FDECEC", color: "#E24B4A" }}
        >
          {errorServer}
        </div>
      )}

      {/* Acciones */}
      <div className="mt-6 flex flex-col md:flex-row gap-3">
        <a href="/medico/agenda" className="flex-1 flex items-center justify-center rounded-lg bg-gray-100 px-4 min-h-[48px] md:min-h-0 md:py-2.5 text-center text-sm text-gray-700 hover:bg-gray-200">
          Cancelar
        </a>
        <button
          onClick={handleGuardar}
          disabled={isPending}
          className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-[#378ADD] px-4 min-h-[48px] md:min-h-0 md:py-2.5 text-sm font-medium text-white hover:bg-[#2e6fb5] disabled:opacity-70 active:scale-95 active:opacity-80 transition-all duration-100"
        >
          {isPending && (
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
              <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          )}
          {isPending ? "Guardando..." : "Guardar modelo"}
        </button>
      </div>
    </div>
  );
}
