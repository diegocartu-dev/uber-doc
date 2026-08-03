"use client";

import { useMemo, useState, useTransition } from "react";
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

export default function BandejaClient({ correos }: { correos: Correo[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<"entrada" | "salida">("entrada");
  const [verSistemas, setVerSistemas] = useState(false);
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
  const deSistema = useMemo(() => entradas.filter((c) => c.sistema), [entradas]);
  const recibidos = useMemo(
    () => (verSistemas ? entradas : entradas.filter((c) => !c.sistema)),
    [entradas, verSistemas]
  );
  const enviados = useMemo(() => correos.filter((c) => c.direccion === "salida"), [correos]);
  const sinLeer = entradas.filter((c) => !c.leido && !c.sistema).length;
  const visibles = tab === "entrada" ? recibidos : enviados;

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
        {tab === "entrada" && deSistema.length > 0 && (
          <button
            onClick={() => setVerSistemas(!verSistemas)}
            className={`rounded-lg px-3 py-2 text-xs font-medium ${
              verSistemas ? "bg-gray-200 text-gray-700" : "text-gray-400 hover:text-gray-600"
            }`}
            title="Notificaciones automáticas de plataformas (LinkedIn, etc.). Guardadas pero fuera de la vista."
          >
            Sistemas ({deSistema.length})
          </button>
        )}
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

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {visibles.length === 0 ? (
          <p className="p-10 text-center text-sm text-gray-400">
            {tab === "entrada" ? "Todavía no llegó ningún correo." : "Todavía no enviaste ningún correo."}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {visibles.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/bandeja/${c.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`truncate text-sm ${!c.leido && c.direccion === "entrada" ? "font-bold text-gray-900" : "text-gray-700"}`}>
                        {c.direccion === "entrada" ? c.de : c.para}
                      </span>
                      {c.esRespuesta && <span className="text-[10px] text-gray-400">respuesta</span>}
                      {c.direccion === "entrada" && (
                        <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                          {(c.para || "").toLowerCase().includes("soporte@") ? "soporte@" : "contacto@"}
                        </span>
                      )}
                    </div>
                    <p className={`truncate text-sm ${!c.leido && c.direccion === "entrada" ? "font-semibold text-gray-800" : "text-gray-500"}`}>
                      {c.asunto}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {c.direccion === "entrada" && !c.atendido && (
                      <span className="rounded-full bg-[#BA7517]/15 px-2 py-0.5 text-[10px] font-bold text-[#BA7517]">SIN ATENDER</span>
                    )}
                    {c.errorEnvio && (
                      <span className="rounded-full bg-[#E24B4A]/15 px-2 py-0.5 text-[10px] font-bold text-[#E24B4A]">NO SALIÓ</span>
                    )}
                    <span className="text-xs text-gray-400">{fechaCorta(c.creadoEn)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
