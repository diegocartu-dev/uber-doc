"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { BarraTabla, CabezaTabla, useVistaTabla, type Columna } from "@/components/tabla/TablaDatos";

interface Pedido {
  medico: string;
  desenlace: string;
  acepto: boolean;
  certeza: "hito" | "inferido" | "no";
}

interface Busqueda {
  cuando: number;
  paciente: string;
  provincia: string | null;
  vistas: number;
  medicosProvincia: number;
  ciOnline: number;
  exacto: boolean;
  pedidos: Pedido[];
  resultado: string;
  matchHabia: boolean;
}

interface Data {
  dias: number;
  etapas: { busquedas: number; eligieron: number; pagaron: number; seAtendieron: number; sinMatch: number };
  porProvincia: { provincia: string; busquedas: number; sinMatch: number; medicosHoy: number }[];
  busquedas: Busqueda[];
}

const RESULTADO_COLOR: Record<string, string> = {
  "se atendió": "#1D9E75",
  "pagó": "#1D9E75",
  "eligió médico, no pagó": "#BA7517",
  "había oferta, no eligió": "#888780",
  "eligió, nadie lo aceptó": "#D85A30",
  "eligió, el paciente se retiró": "#888780",
  "eligió turno, no reservó": "#888780",
  "eligió, no llegó a pedir": "#888780",
  "esperando que lo tomen": "#BA7517",
  "había médicos pero ninguno en línea": "#D85A30",
  "sin médicos para su provincia": "#E24B4A",
  "sin provincia cargada": "#888780",
};

/** Los desenlaces de una búsqueda, de lo peor a lo mejor. Manda el orden del embudo:
 *  no se ordenan por su inicial. Es el mismo orden que RESULTADO_COLOR. */
const CICLO_RESULTADO = Object.keys(RESULTADO_COLOR).reverse();

function horaDe(ms: number) {
  return new Date(ms).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    hour12: false, timeZone: "America/Argentina/Buenos_Aires",
  });
}

export default function FunnelClient() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [dias, setDias] = useState(30);
  const sp = useSearchParams();
  const real = sp.get("real") !== "0";

  const [error, setError] = useState(false);

  const busquedas = useMemo(() => data?.busquedas ?? [], [data]);
  const COLUMNAS: Columna<Busqueda>[] = useMemo(() => [
    { k: "cuando", t: "Cuándo", val: (b) => b.cuando, tipo: "numero", porEvento: true, busca: (b) => horaDe(b.cuando),
      ayuda: "Una búsqueda es una visita a la clínica. Dos entradas del mismo paciente con menos de 30 minutos cuentan como una" },
    { k: "paciente", t: "Paciente", val: (b) => b.paciente },
    { k: "provincia", t: "Provincia", val: (b) => b.provincia ?? "" },
    { k: "medprov", t: "Méd. p/su prov.", val: (b) => b.medicosProvincia, num: true, porEvento: true,
      ayuda: "Profesionales habilitados para su provincia en ese momento. El asterisco marca los estimados con la oferta de hoy: desde el 28/07 cada búsqueda guarda la foto exacta" },
    { k: "cionline", t: "CI en línea", val: (b) => b.ciOnline, num: true, porEvento: true,
      ayuda: "De esos, cuántos estaban en línea para consulta inmediata en ese instante" },
    { k: "elegido", t: "A quién eligió", val: (b) => b.pedidos.map((x) => x.medico).join(", "),
      ayuda: "Se puede filtrar por profesional: acá se ve a quién eligieron y quién no lo tomó" },
    { k: "resultado", t: "Qué pasó", val: (b) => b.resultado, rango: CICLO_RESULTADO },
  ], []);
  const vista = useVistaTabla(busquedas, COLUMNAS, {
    clave: (b) => `${b.cuando}-${b.paciente}`,
    defecto: (a, b) => b.cuando - a.cuando,
    tono: "oscuro",
  });

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetch(`/api/insights/funnel?dias=${dias}&real=${real ? 1 : 0}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [dias, real]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Demanda</h1>
          <p className="text-sm text-white/50">
            Quién buscó atención, cuándo, y si el match estaba: cuánta oferta había para su provincia en ese momento.
          </p>
        </div>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDias(d)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                dias === d ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
              }`}
            >
              {d}D
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-white/10 bg-[#1E293B] p-12 text-center">
          <p className="text-sm text-white/50">No se pudieron cargar los datos.</p>
          <button onClick={() => window.location.reload()} className="mt-3 rounded-lg bg-white/10 px-4 py-1.5 text-xs text-white hover:bg-white/20">
            Reintentar
          </button>
        </div>
      ) : loading || !data ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-white/30" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { l: "Búsquedas", v: data.etapas.busquedas, c: "text-white" },
              { l: "Eligieron médico", v: data.etapas.eligieron, c: "text-white" },
              { l: "Pagaron", v: data.etapas.pagaron, c: "text-white" },
              { l: "Se atendieron", v: data.etapas.seAtendieron, c: "text-[#1D9E75]" },
              { l: "Sin match", v: data.etapas.sinMatch, c: data.etapas.sinMatch > 0 ? "text-[#E24B4A]" : "text-white/40" },
            ].map((k) => (
              <div key={k.l} className="rounded-xl border border-white/10 bg-[#1E293B] p-4">
                <div className={`text-2xl font-bold ${k.c}`}>{k.v}</div>
                <div className="text-xs text-white/40">{k.l}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-white/10 bg-[#1E293B] p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-white/30">Demanda por provincia</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {data.porProvincia.map((p) => (
                <div
                  key={p.provincia}
                  className={`rounded-lg border px-3 py-1.5 text-xs ${
                    p.sinMatch > 0 ? "border-[#E24B4A]/40 bg-[#E24B4A]/10" : "border-white/10 bg-white/[0.03]"
                  }`}
                >
                  <span className="font-medium text-white/80">{p.provincia}</span>
                  <span className="ml-2 text-white/50">{p.busquedas} búsq.</span>
                  <span className="ml-2 text-white/35">{p.medicosHoy} méd. hoy</span>
                  {p.sinMatch > 0 && <span className="ml-2 font-medium text-[#E24B4A]">{p.sinMatch} sin match</span>}
                </div>
              ))}
              {data.porProvincia.length === 0 && <p className="text-xs text-white/30">Sin búsquedas en el período.</p>}
            </div>
          </div>

          <div>
          <BarraTabla vista={vista} placeholder="Buscar paciente, provincia o profesional…" cuenta="búsquedas" />
          <div className="rounded-xl border border-white/10 bg-[#1E293B]">
            <div className="overflow-auto max-h-[68vh]">
            <table className="w-full min-w-[880px] border-separate border-spacing-0 text-left text-sm">
              <CabezaTabla vista={vista} />
              <tbody>
                {vista.filas.length === 0 && (
                  <tr>
                    <td colSpan={COLUMNAS.length} className="px-4 py-10 text-center text-white/40">
                      {vista.hay ? "Ninguna búsqueda con esos filtros." : "Sin búsquedas en el período."}
                    </td>
                  </tr>
                )}
                {vista.filas.map((b, i) => {
                  const c = RESULTADO_COLOR[b.resultado] ?? "#888780";
                  return (
                    <tr key={i} className="border-b border-white/5 last:border-0">
                      <td className="whitespace-nowrap px-4 py-3 text-white/70">
                        {horaDe(b.cuando)}
                        {b.vistas > 1 && <span className="ml-1 text-[10px] text-white/30">×{b.vistas}</span>}
                      </td>
                      <td className="px-3 py-3 text-white/90">{b.paciente}</td>
                      <td className="px-3 py-3 text-white/60">{b.provincia ?? <span className="text-white/25">—</span>}</td>
                      <td className="px-3 py-3 text-right text-white/70">
                        {b.medicosProvincia}
                        {!b.exacto && <span className="ml-0.5 text-white/25" title="Reconstruido con la oferta actual (el evento no guardó la foto)">*</span>}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span className={b.ciOnline > 0 ? "text-white/70" : "text-[#D85A30]"}>{b.ciOnline}</span>
                      </td>
                      <td className="px-3 py-3">
                        {b.pedidos.length === 0 ? (
                          <span className="text-white/25">—</span>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            {b.pedidos.map((p, j) => (
                              <span key={j} className="whitespace-nowrap text-[12px] text-white/80">
                                {p.medico}
                                {p.desenlace === "sin_respuesta" && (
                                  <span
                                    className="ml-1 text-[#D85A30]"
                                    title={
                                      p.certeza === "no"
                                        ? "No hay registro de que lo tomara. Antes del 20/08 el sistema no guardaba el hito de aceptación: no alcanza como prueba."
                                        : "No lo aceptó."
                                    }
                                  >
                                    no lo aceptó{p.certeza === "no" ? " ?" : ""}
                                  </span>
                                )}
                                {p.desenlace === "no_reservo" && (
                                  <span className="ml-1 text-white/35" title="Abrió su agenda de turnos y no reservó. En un turno no hay nada que aceptar: el paciente reserva y paga.">
                                    no reservó el turno
                                  </span>
                                )}
                                {p.desenlace === "no_pidio" && (
                                  <span className="ml-1 text-white/35" title="Lo eligió y no llegó a mandar el pedido. Del otro lado nunca llegó nada.">
                                    no llegó a pedirle
                                  </span>
                                )}
                                {p.desenlace === "retirado" && (
                                  <span className="ml-1 text-white/35" title="El paciente retiró el pedido antes de que nadie lo tomara.">
                                    lo retiró el paciente
                                  </span>
                                )}
                                {p.acepto && (
                                  <span
                                    className="ml-1 text-[#1D9E75]"
                                    title={p.certeza === "inferido" ? "Aceptación deducida del pago o de la sala de video (fila anterior al registro del hito)." : "Aceptación registrada."}
                                  >
                                    aceptó{p.certeza === "inferido" ? "*" : ""}
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: c + "22", color: c }}>
                          {b.resultado}
                        </span>
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
            Solo <span className="text-[#D85A30]">no lo aceptó</span> es imputable a un profesional: en un turno nadie acepta nada,
            y si el paciente no llegó a pedir, del otro lado nunca sonó el teléfono.
            El resto de las salvedades está en el globo de cada columna y de cada marca.
          </p>
        </>
      )}
    </div>
  );
}
