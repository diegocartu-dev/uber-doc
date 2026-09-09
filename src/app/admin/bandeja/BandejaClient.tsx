"use client";

import { useMemo, useState, useTransition } from "react";
import { BarraTabla, CabezaTabla, useVistaTabla, type Columna } from "@/components/tabla/TablaDatos";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Inbox, Send, PenLine, Loader2 } from "lucide-react";
import { enviarCorreo } from "./actions";

interface Correo {
  id: string;
  creadoEn: string;
  direccion: "entrada" | "salida";
  sistema?: boolean;
  de: string;
  para: string;
  asunto: string;
  leido: boolean;
  atendido: boolean;
  errorEnvio: string | null;
  esRespuesta: boolean;
}

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    hour12: false, timeZone: "America/Argentina/Buenos_Aires",
  });
}

// El estado en UNA palabra, que es lo que se busca, se ordena y se filtra. El ciclo va de
// lo que reclama atención a lo que ya está cerrado.
const CICLO_ESTADO = ["No salió", "Sin atender", "Sin leer", "Atendido", "Leído"];
function estadoDe(c: Correo): string {
  if (c.errorEnvio) return "No salió";
  if (c.direccion === "salida") return "Enviado";
  if (!c.atendido) return "Sin atender";
  return c.leido ? "Atendido" : "Sin leer";
}

export default function BandejaClient({ correos }: { correos: Correo[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<"entrada" | "salida">("entrada");
  const [redactar, setRedactar] = useState(false);
  const [para, setPara] = useState("");
  const [desde, setDesde] = useState<"contacto" | "soporte">("contacto");
  const [asunto, setAsunto] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [pendiente, startTransition] = useTransition();

  const entradas = useMemo(() => correos.filter((c) => c.direccion === "entrada"), [correos]);
  // Notificaciones automáticas (LinkedIn etc.): guardadas pero fuera de la vista
  // por defecto — ensuciaban la Bandeja (Diego 03/08).
  const enviados = useMemo(() => correos.filter((c) => c.direccion === "salida"), [correos]);
  const sinLeer = entradas.filter((c) => !c.leido && !c.sistema).length;
  const visibles = useMemo(() => (tab === "entrada" ? entradas : enviados), [tab, entradas, enviados]);

  // Las notificaciones automáticas (LinkedIn y parecidas) ya no se esconden detrás de un
  // interruptor: son un VALOR de la columna Tipo, con su embudo. Se ven cuántas son, se
  // sacan de un clic, y el buscador las encuentra igual — antes quedaban invisibles y el
  // buscador habría mentido sobre ellas (Diego 03/08 las quiso fuera de la vista; el
  // embudo cumple lo mismo sin ocultarlas del buscador).
  const COLUMNAS: Columna<Correo>[] = useMemo(() => [
    { k: "quien", t: tab === "entrada" ? "De" : "Para", val: (c) => (c.direccion === "entrada" ? c.de : c.para) },
    { k: "asunto", t: "Asunto", val: (c) => c.asunto, porEvento: true },
    { k: "buzon", t: "Buzón", val: (c) => ((c.para || "").toLowerCase().includes("soporte@") ? "soporte@" : "contacto@") },
    { k: "tipo", t: "Tipo", val: (c) => (c.sistema ? "Automático" : "De una persona") },
    { k: "estado", t: "Estado", val: (c) => estadoDe(c), rango: CICLO_ESTADO },
    { k: "fecha", t: tab === "entrada" ? "Recibido" : "Enviado", val: (c) => c.creadoEn, tipo: "fecha", porEvento: true },
  ], [tab]);

  const vista = useVistaTabla(visibles, COLUMNAS, {
    clave: (c) => c.id,
    // Lo más nuevo arriba. El id es un uuid, así que el desempate va por fecha y clave.
    defecto: (a, b) => Date.parse(b.creadoEn) - Date.parse(a.creadoEn),
  });

  function enviar() {
    setError(null);
    setEnviado(false);
    startTransition(async () => {
      const r = await enviarCorreo({ para, asunto, cuerpo, desde });
      if (!r.ok) {
        setError(r.error ?? "No se pudo enviar.");
        return;
      }
      setEnviado(true);
      setPara(""); setAsunto(""); setCuerpo("");
      setTab("salida");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setTab("entrada")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${
            tab === "entrada" ? "bg-[#378ADD] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <Inbox size={15} /> Recibidos
          {sinLeer > 0 && (
            <span className="rounded-full bg-white/20 px-1.5 text-xs font-bold">{sinLeer}</span>
          )}
        </button>
        <button
          onClick={() => setTab("salida")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${
            tab === "salida" ? "bg-[#378ADD] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <Send size={15} /> Enviados
        </button>
        <button
          onClick={() => setRedactar(!redactar)}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-[#378ADD] px-3 py-2 text-sm font-medium text-[#378ADD] hover:bg-blue-50"
        >
          <PenLine size={15} /> Redactar
        </button>
      </div>

      {redactar && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">Desde:</span>
              {(["contacto", "soporte"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDesde(d)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                    desde === d ? "bg-[#378ADD] text-white" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {d}@docto.com.ar
                </button>
              ))}
            </div>
            <input
              type="email"
              value={para}
              onChange={(e) => setPara(e.target.value)}
              placeholder="Para (email)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#378ADD]"
            />
            <input
              type="text"
              value={asunto}
              onChange={(e) => setAsunto(e.target.value)}
              placeholder="Asunto"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#378ADD]"
            />
            <textarea
              value={cuerpo}
              onChange={(e) => setCuerpo(e.target.value)}
              placeholder="Mensaje…"
              rows={7}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#378ADD]"
            />
            <p className="text-xs text-gray-400">
              Sale como Docto &lt;{desde}@docto.com.ar&gt; con la firma sobria al pie.
            </p>
            {error && <p className="text-sm font-medium text-[#E24B4A]">{error}</p>}
            {enviado && <p className="text-sm font-medium text-[#1D9E75]">Enviado ✓</p>}
            <button
              onClick={enviar}
              disabled={pendiente}
              className="flex items-center gap-2 rounded-lg bg-[#378ADD] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {pendiente && <Loader2 size={14} className="animate-spin" />}
              Enviar
            </button>
          </div>
        </div>
      )}

      <BarraTabla
        vista={vista}
        placeholder={tab === "entrada" ? "Buscar en lo recibido…" : "Buscar en lo enviado…"}
        cuenta="correos"
      />

      {/* El scroll vive acá, con tope de alto: la cabecera se pega al borde de ESTE cuadro
          y los títulos no se pierden al scrollear la página. */}
      <div className="overflow-auto rounded-xl border border-gray-200 bg-white max-h-[72vh]">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <CabezaTabla vista={vista} />
          <tbody>
            {vista.filas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                  {vista.hay
                    ? "Nada coincide con lo buscado."
                    : tab === "entrada"
                      ? "Todavía no llegó ningún correo."
                      : "Todavía no enviaste ningún correo."}
                </td>
              </tr>
            )}
            {vista.filas.map((c) => {
              const sinLeerEste = !c.leido && c.direccion === "entrada";
              const estado = estadoDe(c);
              return (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/bandeja/${c.id}`} className="block">
                      <span className={"block truncate " + (sinLeerEste ? "font-bold text-gray-900" : "text-gray-700")}>
                        {c.direccion === "entrada" ? c.de : c.para}
                      </span>
                      {c.esRespuesta && <span className="text-[10px] text-gray-400">respuesta</span>}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/bandeja/${c.id}`}
                      className={"block truncate " + (sinLeerEste ? "font-semibold text-gray-800" : "text-gray-500")}
                    >
                      {c.asunto}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                      {(c.para || "").toLowerCase().includes("soporte@") ? "soporte@" : "contacto@"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-gray-500">
                    {c.sistema ? "Automático" : "De una persona"}
                  </td>
                  <td className="px-4 py-3">
                    {/* Punto de color + texto: el color acompaña, la palabra informa. */}
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] text-gray-700">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: estado === "No salió" ? "#E24B4A" : estado === "Sin atender" ? "#BA7517" : estado === "Sin leer" ? "#378ADD" : "#1D9E75" }}
                      />
                      {estado}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-400">{fechaCorta(c.creadoEn)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
