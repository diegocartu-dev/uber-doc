"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Stethoscope,
  ShieldCheck,
  ScanLine,
  Camera,
  Check,
  RefreshCw,
  Clock,
  Loader2,
} from "lucide-react";
import { CONSENTIMIENTO_IDENTIDAD_TEXTO } from "@/lib/didit/consentimiento";

// ─── Design system ─────────────────────────────────────────────────────────
const AZUL = "#378ADD";
const NARANJA = "#D85A30";
const VERDE = "#1D9E75";
const GRIS = "#888780";
const ROJO = "#E24B4A";

type Fase = "intro" | "completo" | "rechazada";

// REGLA DE ORO (spec 14/07): ninguna pantalla del registro espera a un proveedor
// externo. Volver del escaneo = registro completo, AL INSTANTE, sin spinner. El
// resultado fino de Didit viaja por atrás al panel del admin.
function faseInicial(diditStatus: string | null, yaHabilitado: boolean, recienVolvio: boolean): Fase {
  if (yaHabilitado) return "completo";
  if (recienVolvio) return "completo"; // acaba de volver del escaneo → completo
  const s = diditStatus ?? "Not Started";
  if (["Approved", "In Review", "In Progress", "Resubmitted"].includes(s)) return "completo";
  if (["Declined", "Expired", "Abandoned"].includes(s)) return "rechazada";
  return "intro";
}

interface Props {
  diditStatus: string | null;
  yaHabilitado: boolean;
  recienVolvio: boolean;
}

export default function RegistroIdentidad({ diditStatus, yaHabilitado, recienVolvio }: Props) {
  const [fase, setFase] = useState<Fase>(() => faseInicial(diditStatus, yaHabilitado, recienVolvio));
  const [aceptado, setAceptado] = useState(false);
  const [intentoSinAceptar, setIntentoSinAceptar] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function iniciarVerificacion() {
    if (!aceptado) {
      setIntentoSinAceptar(true);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const resp = await fetch("/api/didit/crear-sesion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consentimiento: true, origin: "registro" }),
      });
      const data = await resp.json();
      if (data?.yaValidado) {
        setFase("completo");
        return;
      }
      if (!resp.ok || !data?.url) throw new Error(data?.error ?? "error");
      window.location.href = data.url; // redirect full a Didit (dominio externo)
    } catch {
      setError("No pudimos iniciar la verificación. Probá de nuevo en un momento.");
      setCargando(false);
    }
  }

  let contenido: React.ReactNode;

  if (fase === "completo") {
    contenido = (
      <div className="text-center">
        <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(29,158,117,0.12)" }}>
          <Check size={30} style={{ color: VERDE }} strokeWidth={2.5} />
        </span>
        <h2 className="text-xl font-semibold text-gray-900">¡Tu registro está completo!</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          Recibimos tus datos, tu credencial y tu verificación de identidad.
        </p>
        <div className="mt-5 rounded-xl border p-3 text-left" style={{ borderColor: "#e5e7eb" }}>
          {["Datos profesionales", "Credencial recibida", "Identidad verificada"].map((t) => (
            <div key={t} className="flex items-center gap-2 py-1">
              <Check size={16} style={{ color: VERDE }} />
              <span className="text-sm text-gray-800">{t}</span>
            </div>
          ))}
        </div>
        {/* Estado PENDIENTE (revisión) = amarillo #BA7517, no naranja (alerta).
            Consistente con PantallaIdentidad. Gate Sofía #269. */}
        <div className="mt-4 rounded-xl px-4 py-3 text-left" style={{ background: "rgba(186,117,23,0.08)" }}>
          <p className="text-sm leading-relaxed" style={{ color: "#BA7517" }}>
            <Clock size={15} className="mr-1 inline align-[-2px]" />
            Ahora Docto revisa tu cuenta. Te avisamos por email cuando esté aprobada.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex w-full items-center justify-center rounded-lg py-3.5 text-sm font-semibold text-white"
          style={{ background: AZUL }}
        >
          Ir a mi panel
        </Link>
      </div>
    );
  } else if (fase === "rechazada") {
    contenido = (
      <div className="text-center">
        <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(216,90,48,0.12)" }}>
          <RefreshCw size={26} style={{ color: NARANJA }} />
        </span>
        <h2 className="text-xl font-semibold text-gray-900">Tenemos que repetir tu verificación</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          La foto del DNI o la selfie no salieron bien. Suele resolverse con buena
          luz y el documento sin reflejos.
        </p>
        <button
          onClick={() => { setFase("intro"); setAceptado(false); setIntentoSinAceptar(false); }}
          className="mt-6 inline-flex w-full items-center justify-center rounded-lg py-3.5 text-sm font-semibold text-white"
          style={{ background: AZUL }}
        >
          Repetir verificación
        </button>
      </div>
    );
  } else {
    contenido = (
      <div>
        <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "rgba(55,138,221,0.1)" }}>
          <ShieldCheck size={28} strokeWidth={1.75} style={{ color: AZUL }} />
        </span>
        <h2 className="text-center text-xl font-semibold text-gray-900">Verificá tu identidad</h2>
        <p className="mt-2 text-center text-sm leading-relaxed text-gray-500">
          El último paso. Por la seguridad de tus pacientes, confirmamos que quien
          atiende sos realmente vos.
        </p>

        <div className="mt-5 rounded-xl border p-3.5" style={{ borderColor: "#e5e7eb", background: "#f8f9fa" }}>
          <p className="text-sm font-medium text-gray-900">Vas a necesitar</p>
          <div className="mt-2 space-y-2">
            {[
              { Icon: ScanLine, t: "Tu DNI físico a mano" },
              { Icon: Camera, t: "La cámara, para una selfie" },
            ].map(({ Icon, t }) => (
              <div key={t} className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "rgba(55,138,221,0.1)", color: AZUL }}>
                  <Icon size={17} />
                </span>
                <span className="text-sm text-gray-800">{t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Consentimiento — dato biométrico = sensible (art. 7 Ley 25.326) →
            consentimiento EXPRESO con el texto completo a la vista (Carolina). */}
        <p className="mt-5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">Consentimiento</p>
        <div className="mt-2 max-h-52 overflow-y-auto overscroll-contain whitespace-pre-line rounded-lg bg-white p-4 text-left text-xs leading-relaxed text-gray-600" style={{ border: "1px solid #e5e7eb" }}>
          {CONSENTIMIENTO_IDENTIDAD_TEXTO}
        </div>
        <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg bg-white p-3" style={{ border: `1px solid ${intentoSinAceptar && !aceptado ? ROJO : "#e5e7eb"}` }}>
          <input
            type="checkbox"
            checked={aceptado}
            onChange={(e) => { setAceptado(e.target.checked); if (e.target.checked) setIntentoSinAceptar(false); }}
            className="mt-0.5 h-6 w-6 shrink-0 rounded border-gray-300"
            style={{ accentColor: AZUL }}
          />
          <span className="text-left text-sm text-gray-700">
            Presto mi consentimiento expreso para verificar mi identidad con Didit, según el texto de arriba.
          </span>
        </label>
        {intentoSinAceptar && !aceptado && (
          <p className="mt-1.5 text-xs" style={{ color: ROJO }}>Marcá la casilla para continuar.</p>
        )}

        <button
          onClick={iniciarVerificacion}
          disabled={cargando}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg py-3.5 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: AZUL, opacity: !aceptado && !cargando ? 0.6 : undefined }}
        >
          {cargando ? (
            <><Loader2 size={18} className="animate-spin" /> Conectando…</>
          ) : (
            <>Aceptar y verificar <span aria-hidden>→</span></>
          )}
        </button>
        {error && <p className="mt-2 text-center text-xs" style={{ color: ROJO }}>{error}</p>}
        <p className="mt-2 text-center text-[11px]" style={{ color: GRIS }}>
          Vas a continuar en Didit, nuestro proveedor de verificación.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#f8f9fa]">
      <nav className="bg-white" style={{ borderBottom: "0.5px solid #e5e7eb" }}>
        <div className="mx-auto flex h-14 max-w-lg items-center gap-2 px-4">
          <Stethoscope size={22} strokeWidth={2} color={AZUL} />
          <span className="text-lg font-bold lowercase text-gray-900">docto</span>
        </div>
      </nav>
      <div className="mx-auto max-w-md px-6 pb-10 pt-10">{contenido}</div>
    </div>
  );
}
