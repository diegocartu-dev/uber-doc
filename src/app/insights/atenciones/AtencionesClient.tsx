"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { BarraTabla, CabezaTabla, useVistaTabla, type Columna } from "@/components/tabla/TablaDatos";

interface Cobro {
  pagado: boolean;
  monto: number | null;
}
interface Atencion {
  /** el instante, para ordenar. La API ya lo manda; el cliente no lo declaraba. */
  cuandoSort: number;
  cuando: string;
  tipo: "CI" | "Turno";
  canal: "clinica_virtual" | "consultorio_privado" | null;
  medico: string;
  paciente: string;
  provincia: string | null;
  estado: string;
  estadoLabel: string;
  nivel: "intento" | "consulta";
  desenlace: string;
  desenlaceLabel: string;
  deducido: boolean;
  atendida: boolean;
  duracionMin: number | null;
  cobro: Cobro | null;
  docs: string[];
}
interface Data {
  dias: number;
  atenciones: Atencion[];
  resumen: {
    total: number;
    intentos: number;
    tasaAceptacion: number | null;
    sinRespuesta: number;
    atendidas: number;
    cobradas: number;
    conDoc: number;
  };
}

const fmtMonto = (n: number | null) => (n == null ? "" : "$" + n.toLocaleString("es-AR"));

// Color por DESENLACE, no por estado: "cancelada" no dice nada: lo que importa
// es si no la aceptó nadie (falla nuestra, naranja de alerta) o si el paciente
// se retiró solo (gris, ruido normal).
const DESENLACE_COLOR: Record<string, string> = {
  atendida: "#1D9E75",
  en_progreso: "#378ADD",
  abandono: "#BA7517",
  retirado: "#888780",
  sin_datos: "#888780",
  sin_respuesta: "#D85A30",
  medico_se_fue: "#E24B4A",
  paciente_se_fue: "#E24B4A",
};

/** El camino de una atención, de lo peor para nosotros a lo mejor. Manda el orden del
 *  embudo: un desenlace no se ordena por su inicial. */
const CICLO_DESENLACE = [
  "No la aceptó nadie",
  "El profesional no sostuvo",
  "El paciente no llegó",
  "Aceptada, sin pagar",
  "El paciente se retiró",
  "Cancelada (sin registro)",
  "En curso",
  "Atendida",
];

/** CI, turno de clínica y turno de consultorio particular: tres categorías (Diego 28/07). */
function tipoLabel(a: Atencion): string {
  if (a.tipo === "CI") return "CI";
  return a.canal === "consultorio_privado" ? "Turno consult." : "Turno clínica";
}

const ESTADO_COLOR: Record<string, string> = {
  completada: "#1D9E75",
  completado: "#1D9E75",
  en_curso: "#378ADD",
  confirmado: "#378ADD",
  esperando: "#BA7517",
  cancelada: "#E24B4A",
  cancelado_paciente: "#E24B4A",
  cancelado_medico: "#E24B4A",
};

export default function AtencionesClient() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [dias, setDias] = useState(30);
  const sp = useSearchParams();
  const real = sp.get("real") !== "0";

  useEffect(() => {
    setLoading(true);
    fetch(`/api/insights/atenciones?dias=${dias}&real=${real ? 1 : 0}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [dias, real]);

  // El filtro es de LECTURA: la API manda todo y acá se decide qué mirar. Así
  // los KPIs de arriba siguen contando el total del período aunque la tabla
  // esté filtrada — si el filtro recortara los datos, "Aceptación" se leería
  // como 100% al mirar solo consultas.
  const atenciones = useMemo(() => data?.atenciones ?? [], [data]);

  const COLUMNAS: Columna<Atencion>[] = useMemo(() => [
    { k: "cuando", t: "Cuándo", val: (a) => a.cuandoSort, tipo: "numero", porEvento: true, busca: (a) => a.cuando },
    { k: "tipo", t: "Tipo", val: tipoLabel, rango: ["CI", "Turno clínica", "Turno consult."] },
    { k: "nivel", t: "Nivel", val: (a) => (a.nivel === "consulta" ? "Consulta" : "Intento"), rango: ["Consulta", "Intento"],
      ayuda: "Un pedido es consulta recién cuando un profesional lo acepta" },
    { k: "medico", t: "Médico", val: (a) => a.medico },
    { k: "paciente", t: "Paciente", val: (a) => a.paciente },
    { k: "provincia", t: "Provincia", val: (a) => a.provincia ?? "" },
    { k: "desenlace", t: "Desenlace", val: (a) => a.desenlaceLabel, rango: CICLO_DESENLACE },
    { k: "duro", t: "Duró", val: (a) => a.duracionMin, num: true, porEvento: true,
      ayuda: "Del inicio al cierre. Vacío cuando el cierre no quedó registrado" },
    { k: "docs", t: "Documentó", val: (a) => a.docs.join(", ") },
    { k: "cobro", t: "Cobró", val: (a) => (a.cobro?.pagado ? a.cobro.monto : a.cobro ? 0 : null), num: true, porEvento: true,
      busca: (a) => (a.cobro?.pagado ? fmtMonto(a.cobro.monto) : a.cobro ? "pendiente" : "") },
  ], []);
  const vista = useVistaTabla(atenciones, COLUMNAS, {
    clave: (a) => `${a.cuandoSort}-${a.medico}-${a.paciente}`,
    defecto: (a, b) => b.cuandoSort - a.cuandoSort,
    tono: "oscuro",
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Atenciones</h1>
          <p className="text-sm text-white/50">
            Un pedido es una <strong className="text-white/70">consulta</strong> recién cuando un
            profesional lo acepta. Antes es un <strong className="text-white/70">intento</strong>: el
            paciente buscó y pidió, pero del otro lado no hubo nadie todavía.
          </p>
        </div>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDias(d)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                dias === d ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
              }`}
            >
              {d}D
            </button>
          ))}
        </div>
      </div>

      {loading || !data ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-white/30" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { l: "Consultas", v: data.resumen.total, hint: "las que un profesional aceptó" },
              { l: "Intentos", v: data.resumen.intentos, hint: "pedidos que no llegaron a consulta" },
              {
                l: "Aceptación",
                v: data.resumen.tasaAceptacion == null ? "—" : `${data.resumen.tasaAceptacion}%`,
                hint: "de cada pedido, cuántos toma alguien",
              },
              {
                l: "Sin respuesta",
                v: data.resumen.sinRespuesta,
                hint: "no los aceptó nadie",
                alerta: data.resumen.sinRespuesta > 0,
              },
            ].map((k) => (
              <div key={k.l} className="rounded-xl border border-white/10 bg-[#1E293B] p-4">
                <div className={`text-2xl font-bold ${k.alerta ? "text-[#D85A30]" : "text-white"}`}>{k.v}</div>
                <div className="text-xs text-white/40">{k.l}</div>
                <div className="mt-0.5 text-[10px] leading-tight text-white/25">{k.hint}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { l: "Atendidas", v: data.resumen.atendidas },
              { l: "Cobradas", v: data.resumen.cobradas },
              { l: "Con documento", v: data.resumen.conDoc },
            ].map((k) => (
              <div key={k.l} className="rounded-xl border border-white/10 bg-[#1E293B] p-3">
                <div className="text-lg font-bold text-white">{k.v}</div>
                <div className="text-xs text-white/40">{k.l}</div>
              </div>
            ))}
          </div>

          <div>
          <BarraTabla vista={vista} placeholder="Buscar médico, paciente o provincia…" cuenta="atenciones" />
          <div className="rounded-xl border border-white/10 bg-[#1E293B]">
            <div className="overflow-auto max-h-[68vh]">
            <table className="w-full min-w-[840px] border-separate border-spacing-0 text-left text-sm">
              <CabezaTabla vista={vista} />
              <tbody>
                {vista.filas.length === 0 && (
                  <tr>
                    <td colSpan={COLUMNAS.length} className="px-4 py-10 text-center text-white/40">
                      {vista.hay ? "Ninguna atención con esos filtros." : "Sin atenciones en el período."}
                    </td>
                  </tr>
                )}
                {vista.filas.map((a, i) => {
                  const ec = DESENLACE_COLOR[a.desenlace] ?? ESTADO_COLOR[a.estado] ?? "#888780";
                  // Tres categorías (Diego 28/07): CI azul, turno clínica gris,
                  // turno consultorio particular ámbar. Verde es solo para estados.
                  const esConsultorio = a.tipo === "Turno" && a.canal === "consultorio_privado";
                  const tc = a.tipo === "CI" ? "#378ADD" : esConsultorio ? "#BA7517" : "#888780";
                  return (
                    <tr key={i} className="border-b border-white/5 last:border-0">
                      <td className="whitespace-nowrap px-4 py-3 text-white/70">{a.cuando}</td>
                      <td className="px-3 py-3">
                        <span className="whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: tc + "22", color: tc }}>
                          {tipoLabel(a)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-white/60">
                        {a.nivel === "consulta" ? "Consulta" : "Intento"}
                      </td>
                      <td className="px-3 py-3 text-white/90">{a.medico}</td>
                      <td className="px-3 py-3 text-white/90">{a.paciente}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-white/70">
                        {a.provincia ?? <span className="text-white/25">—</span>}
                      </td>
                      <td className="px-3 py-3">
                        <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: ec + "22", color: ec }}>
                          {a.desenlaceLabel}
                        </span>
                        {/* Sin el hito registrado el desenlace es una deducción, no
                            un hecho. Se marca para no leerlo como certeza. */}
                        {a.deducido && a.nivel === "intento" && (
                          <span className="ml-1 text-[10px] text-white/25" title="Deducido: esta atención es anterior al registro del hito de aceptación">
                            ·&nbsp;deducido
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-white/70">
                        {a.duracionMin != null ? `${a.duracionMin} min` : <span className="text-white/25">—</span>}
                      </td>
                      <td className="px-3 py-3">
                        {a.docs.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {a.docs.map((d) => (
                              <span key={d} className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/70">
                                {d}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-white/25">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right">
                        {a.cobro?.pagado ? (
                          <span className="font-semibold text-[#1D9E75]">{fmtMonto(a.cobro.monto)}</span>
                        ) : a.cobro ? (
                          <span className="text-[#BA7517]">Pendiente</span>
                        ) : (
                          <span className="text-white/25">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
          </div>

          <p className="text-center text-[11px] text-white/25">
            Solo atenciones reales: no incluye los lugares libres de agenda.
          </p>
        </>
      )}
    </div>
  );
}
