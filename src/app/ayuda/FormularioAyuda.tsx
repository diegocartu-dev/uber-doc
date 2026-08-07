"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Stethoscope, CheckCircle2, AlertCircle, Copy, Check, ArrowLeft } from "lucide-react";
import { enviarPedidoAyuda } from "./actions";

const AZUL = "#378ADD";
const VERDE = "#1D9E75";
const ROJO = "#E24B4A";
const SOPORTE = "soporte@docto.com.ar";

interface Props {
  emailSesion: string | null;
  asuntoInicial: string;
}

export default function FormularioAyuda({ emailSesion, asuntoInicial }: Props) {
  const router = useRouter();
  const [asunto, setAsunto] = useState(asuntoInicial);
  const [mensaje, setMensaje] = useState("");
  const [emailContacto, setEmailContacto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  const emailRespuesta = emailSesion || emailContacto.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setError(null);
    setEnviando(true);
    try {
      const r = await enviarPedidoAyuda({
        mensaje,
        asunto,
        emailContacto,
        origen: typeof document !== "undefined" ? document.referrer : "",
      });
      if (r.ok) setEnviado(true);
      else setError(r.error ?? "No pudimos enviar tu mensaje. Probá de nuevo.");
    } catch {
      setError(
        `No pudimos enviar tu mensaje. Fijate que tengas internet y probá de nuevo, o escribinos a ${SOPORTE}.`
      );
    } finally {
      setEnviando(false);
    }
  }

  function volver() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  }

  return (
    <div className="min-h-full bg-white px-5 pb-12 pt-6">
      <div className="mx-auto w-full max-w-lg">
        <button
          type="button"
          onClick={volver}
          className="-ml-2 flex items-center gap-1.5 rounded-lg px-2 text-sm text-gray-500 transition hover:bg-gray-50"
          style={{ minHeight: 44 }}
        >
          <ArrowLeft size={18} strokeWidth={1.75} />
          Volver
        </button>

        <div className="mt-2 flex items-center justify-center gap-2">
          <Stethoscope size={26} strokeWidth={2} color={AZUL} />
          <span className="text-2xl font-bold text-gray-900">docto</span>
        </div>

        {enviado ? (
          <Confirmacion email={emailRespuesta} onVolver={volver} />
        ) : (
          <>
            <h1 className="mt-7 text-center text-2xl font-bold text-gray-900">
              ¿Necesitás ayuda?
            </h1>
            <p className="mx-auto mt-3 max-w-sm text-center text-base leading-relaxed text-gray-600">
              Escribinos qué te pasó y te respondemos por mail. Si es por una consulta, contanos
              el día y el nombre del profesional.
            </p>

            <form onSubmit={handleSubmit} className="mt-7">
              {emailSesion ? (
                <p className="text-sm text-gray-500">
                  Te respondemos a{" "}
                  <span className="font-medium text-gray-900">{emailSesion}</span>
                </p>
              ) : (
                <div>
                  <label htmlFor="ayuda-email" className="block text-sm font-medium text-gray-900">
                    Tu email
                  </label>
                  <input
                    id="ayuda-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    required
                    value={emailContacto}
                    onChange={(e) => setEmailContacto(e.target.value)}
                    placeholder="nombre@ejemplo.com"
                    className="mt-1.5 w-full rounded-xl border border-gray-300 px-4 py-3 text-base text-gray-900 outline-none transition focus:border-[#378ADD]"
                  />
                  <p className="mt-1.5 text-xs text-gray-500">Ahí te mandamos la respuesta.</p>
                </div>
              )}

              <div className="mt-5">
                <label htmlFor="ayuda-asunto" className="block text-sm font-medium text-gray-900">
                  Asunto <span className="font-normal text-gray-400">(opcional)</span>
                </label>
                <input
                  id="ayuda-asunto"
                  type="text"
                  maxLength={120}
                  value={asunto}
                  onChange={(e) => setAsunto(e.target.value)}
                  placeholder="Por ejemplo: no me llegó la receta"
                  className="mt-1.5 w-full rounded-xl border border-gray-300 px-4 py-3 text-base text-gray-900 outline-none transition focus:border-[#378ADD]"
                />
              </div>

              <div className="mt-5">
                <label htmlFor="ayuda-mensaje" className="block text-sm font-medium text-gray-900">
                  Tu mensaje
                </label>
                <textarea
                  id="ayuda-mensaje"
                  required
                  rows={7}
                  maxLength={4000}
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                  placeholder="Contanos con tus palabras qué necesitás."
                  className="mt-1.5 w-full resize-y rounded-xl border border-gray-300 px-4 py-3 text-base leading-relaxed text-gray-900 outline-none transition focus:border-[#378ADD]"
                />
              </div>

              {error && (
                <div
                  role="alert"
                  className="mt-4 flex items-start gap-2 rounded-xl p-4"
                  style={{ backgroundColor: "#FEF2F2", border: `1px solid ${ROJO}33` }}
                >
                  <AlertCircle size={18} strokeWidth={1.75} color={ROJO} className="mt-0.5 shrink-0" />
                  <p className="text-sm leading-relaxed text-gray-700">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={enviando}
                className="mt-6 w-full rounded-xl px-6 py-3.5 text-base font-medium text-white transition-all duration-100 active:scale-[0.98] disabled:opacity-60"
                style={{ backgroundColor: AZUL, minHeight: 52 }}
              >
                {enviando ? "Enviando…" : "Enviar mensaje"}
              </button>
            </form>
          </>
        )}

        <BloqueCorreo />
      </div>
    </div>
  );
}

function Confirmacion({ email, onVolver }: { email: string; onVolver: () => void }) {
  return (
    <div className="mt-8 text-center">
      <div
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
        style={{ backgroundColor: "rgba(29, 158, 117, 0.1)" }}
      >
        <CheckCircle2 size={30} strokeWidth={1.75} color={VERDE} />
      </div>
      <h1 className="mt-5 text-2xl font-bold text-gray-900">Recibimos tu mensaje</h1>
      <p className="mx-auto mt-3 max-w-sm text-base leading-relaxed text-gray-600">
        Te respondemos por mail{email ? " a " : ""}
        {email && <span className="font-medium text-gray-900">{email}</span>}. Revisá también la
        carpeta de correo no deseado.
      </p>
      <button
        type="button"
        onClick={onVolver}
        className="mt-7 w-full rounded-xl px-6 py-3.5 text-base font-medium text-white transition-all duration-100 active:scale-[0.98]"
        style={{ backgroundColor: AZUL, minHeight: 52 }}
      >
        Volver
      </button>
    </div>
  );
}

/**
 * La dirección SIEMPRE visible y copiable. A propósito NO es un `mailto:`:
 * en un celular sin cliente de correo configurado el mailto no hace nada, y
 * ese fue justamente el problema que este cambio viene a resolver.
 */
function BloqueCorreo() {
  const [copiado, setCopiado] = useState(false);
  const [fallo, setFallo] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(SOPORTE);
      setCopiado(true);
      setFallo(false);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setFallo(true);
    }
  }

  return (
    <div
      className="mt-8 rounded-xl p-4"
      style={{ backgroundColor: "#F9FAFB", border: "1px solid #e5e7eb" }}
    >
      <p className="text-sm font-medium text-gray-900">
        ¿Preferís escribirnos desde tu correo?
      </p>
      <p className="mt-1 text-sm leading-relaxed text-gray-600">
        Mandanos un mail a esta dirección y te contestamos igual:
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className="select-all break-all rounded-lg bg-white px-3 py-2.5 text-base font-medium text-gray-900"
          style={{ border: "1px solid #e5e7eb" }}
        >
          {SOPORTE}
        </span>
        <button
          type="button"
          onClick={copiar}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition hover:bg-white"
          style={{ border: `1px solid ${AZUL}`, color: AZUL, minHeight: 44 }}
        >
          {copiado ? (
            <>
              <Check size={16} strokeWidth={2} color={VERDE} />
              Copiado
            </>
          ) : (
            <>
              <Copy size={16} strokeWidth={1.75} />
              Copiar
            </>
          )}
        </button>
      </div>
      {fallo && (
        <p className="mt-2 text-xs text-gray-500">
          No pudimos copiarla sola: mantené el dedo sobre la dirección y elegí Copiar.
        </p>
      )}
    </div>
  );
}
