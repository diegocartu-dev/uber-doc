"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Loader2, Paperclip, Reply } from "lucide-react";
import { enviarCorreo, marcarAtendido } from "../actions";

interface Correo {
  id: string;
  creadoEn: string;
  direccion: "entrada" | "salida";
  de: string;
  para: string;
  asunto: string;
  cuerpo: string;
  atendido: boolean;
  errorEnvio: string | null;
  adjuntos: string[];
}

interface Respuesta {
  id: string;
  creadoEn: string;
  asunto: string;
  errorEnvio: string | null;
}

function fechaLarga(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    hour12: false, timeZone: "America/Argentina/Buenos_Aires",
  });
}

export default function DetalleCorreoClient({ correo, respuestas }: { correo: Correo; respuestas: Respuesta[] }) {
  const router = useRouter();
  const [responder, setResponder] = useState(false);
  const [cuerpo, setCuerpo] = useState("");
  const [asunto, setAsunto] = useState(
    correo.asunto.toLowerCase().startsWith("re:") ? correo.asunto : `Re: ${correo.asunto}`
  );
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function enviarRespuesta() {
    setError(null);
    startTransition(async () => {
      const r = await enviarCorreo({
        para: correo.de,
        asunto,
        cuerpo,
        enRespuestaA: correo.id,
      });
      if (!r.ok) {
        setError(r.error ?? "No se pudo enviar.");
        return;
      }
      setResponder(false);
      setCuerpo("");
      router.refresh();
    });
  }

  function toggleAtendido() {
    startTransition(async () => {
      await marcarAtendido(correo.id, !correo.atendido);
      router.refresh();
    });
  }

  return (
    <div className="p-6 lg:p-8">
      <Link href="/admin/bandeja" className="inline-flex items-center gap-1 text-sm text-[#378ADD] hover:underline">
        <ArrowLeft size={14} /> Volver a la Bandeja
      </Link>

      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-gray-900">{correo.asunto}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {correo.direccion === "entrada" ? "De" : "Para"}:{" "}
              <span className="font-medium text-gray-700">{correo.direccion === "entrada" ? correo.de : correo.para}</span>
              {" · "}{fechaLarga(correo.creadoEn)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {correo.errorEnvio && (
              <span className="rounded-full bg-[#E24B4A]/15 px-2 py-0.5 text-[10px] font-bold text-[#E24B4A]" title={correo.errorEnvio}>
                NO SALIÓ
              </span>
            )}
            {correo.direccion === "entrada" && (
              <button
                onClick={toggleAtendido}
                disabled={pendiente}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
                  correo.atendido
                    ? "bg-[#1D9E75]/15 text-[#1D9E75]"
                    : "border border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                <CheckCircle2 size={14} />
                {correo.atendido ? "Atendido" : "Marcar atendido"}
              </button>
            )}
          </div>
        </div>

        {correo.errorEnvio && (
          <p className="mt-3 rounded-lg bg-[#E24B4A]/10 px-3 py-2 text-xs text-[#E24B4A]">
            El envío falló: {correo.errorEnvio}
          </p>
        )}

        <div className="mt-4 whitespace-pre-wrap border-t border-gray-100 pt-4 text-[15px] leading-relaxed text-gray-800">
          {correo.cuerpo}
        </div>

        {correo.adjuntos.length > 0 && (
          <div className="mt-4 border-t border-gray-100 pt-3">
            {correo.adjuntos.map((a) => (
              <span key={a} className="mr-2 inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">
                <Paperclip size={12} /> {a}
              </span>
            ))}
            <p className="mt-1 text-[11px] text-gray-400">Los adjuntos solo se listan por ahora (descarga: próxima versión).</p>
          </div>
        )}
      </div>

      {respuestas.length > 0 && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Respuestas enviadas</p>
          <ul className="mt-2 space-y-1">
            {respuestas.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-sm">
                <Reply size={13} className="text-gray-400" />
                <Link href={`/admin/bandeja/${r.id}`} className="text-[#378ADD] hover:underline">{r.asunto}</Link>
                <span className="text-xs text-gray-400">{fechaLarga(r.creadoEn)}</span>
                {r.errorEnvio && <span className="text-[10px] font-bold text-[#E24B4A]">NO SALIÓ</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {correo.direccion === "entrada" && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
          {!responder ? (
            <button
              onClick={() => setResponder(true)}
              className="flex items-center gap-1.5 rounded-lg bg-[#378ADD] px-4 py-2 text-sm font-medium text-white"
            >
              <Reply size={15} /> Responder
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                Para: <span className="font-medium text-gray-700">{correo.de}</span>
              </p>
              <input
                type="text"
                value={asunto}
                onChange={(e) => setAsunto(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#378ADD]"
              />
              <textarea
                value={cuerpo}
                onChange={(e) => setCuerpo(e.target.value)}
                placeholder="Tu respuesta…"
                rows={6}
                autoFocus
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#378ADD]"
              />
              {error && <p className="text-sm font-medium text-[#E24B4A]">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={enviarRespuesta}
                  disabled={pendiente}
                  className="flex items-center gap-2 rounded-lg bg-[#378ADD] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {pendiente && <Loader2 size={14} className="animate-spin" />}
                  Enviar respuesta
                </button>
                <button
                  onClick={() => setResponder(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
