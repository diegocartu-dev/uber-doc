"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Stethoscope, ShieldCheck, Check, RefreshCw, Clock } from "lucide-react";
import PasosDidit from "@/components/identidad/PasosDidit";
import ConsentimientoIdentidad from "@/components/identidad/ConsentimientoIdentidad";
import CtaSticky from "@/components/identidad/CtaSticky";

// ─── Design system ─────────────────────────────────────────────────────────
const AZUL = "#378ADD";
const NARANJA = "#D85A30";
const VERDE = "#1D9E75";

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

// Respec Sofía 20/07: la pantalla anterior ponía la burocracia antes que la
// acción (pared legal de 200px, checkbox perdido, CTA al 60% de opacidad abajo
// del fold) — las 2 primeras médicas reales que llegaron acá abandonaron sin
// crear sesión. Ahora: acción visible desde el primer paint (CTA sólido sticky),
// legal compacto expandible, y preparación explícita para los 2 pasos de Didit.
// Criterio de aceptación: en un iPhone SE se ve título + pasos + consentimiento
// con su casilla + CTA sin scrollear.
export default function RegistroIdentidad({ diditStatus, yaHabilitado, recienVolvio }: Props) {
  const [fase, setFase] = useState<Fase>(() => faseInicial(diditStatus, yaHabilitado, recienVolvio));
  const [aceptado, setAceptado] = useState(false);
  const [guardActiva, setGuardActiva] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const consentRef = useRef<HTMLDivElement>(null);

  // Reintentos (rechazada) van DIRECTO sin re-consentir, amparados en la
  // aceptación registrada (dictamen Carolina 20/07 — el consentimiento cubre la
  // finalidad, no cada intento). Si el servidor no encuentra aceptación previa
  // (consentimiento_requerido, caso borde), se cae al flujo con checkbox.
  async function iniciarVerificacion(conConsentimiento: boolean) {
    setCargando(true);
    setError(null);
    try {
      const resp = await fetch("/api/didit/crear-sesion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          conConsentimiento
            ? { consentimiento: true, origin: "registro" }
            : { origin: "registro" }
        ),
      });
      const data = await resp.json();
      if (data?.yaValidado) {
        setFase("completo");
        return;
      }
      if (resp.status === 400 && data?.error === "consentimiento_requerido") {
        setFase("intro");
        setCargando(false);
        return;
      }
      if (!resp.ok && typeof data?.mensaje === "string") {
        // Mensaje honesto del server (ej. Didit sin créditos): mostrarlo tal
        // cual en vez del genérico "probá de nuevo" que no ayuda.
        setError(data.mensaje);
        setCargando(false);
        return;
      }
      if (!resp.ok || !data?.url) throw new Error(data?.error ?? "error");
      window.location.href = data.url; // redirect full a Didit (dominio externo)
    } catch {
      setError("No pudimos iniciar la verificación. Probá de nuevo en un momento.");
      setCargando(false);
    }
  }

  // Guard del CTA: el botón NUNCA parece muerto — si falta la casilla, lleva al
  // médico hasta ella (scroll + resaltado) en el momento exacto de intención.
  function onCtaClick() {
    if (!aceptado) {
      setGuardActiva(true);
      consentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    iniciarVerificacion(true);
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
          Recibimos tus datos, tu credencial, tu firma y tu verificación de identidad.
        </p>
        <div className="mt-5 rounded-xl border p-3 text-left" style={{ borderColor: "#e5e7eb" }}>
          {["Datos profesionales", "Credencial recibida", "Firma registrada", "Identidad verificada"].map((t) => (
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
          onClick={() => iniciarVerificacion(false)}
          disabled={cargando}
          className="mt-6 inline-flex w-full items-center justify-center rounded-lg py-3.5 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: AZUL }}
        >
          {cargando ? "Conectando con Didit…" : "Repetir verificación"}
        </button>
        {error && <p className="mt-2 text-center text-xs" style={{ color: "#E24B4A" }}>{error}</p>}
      </div>
    );
  } else {
    contenido = (
      <div>
        <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full" style={{ background: "rgba(55,138,221,0.1)" }}>
          <ShieldCheck size={22} strokeWidth={1.75} style={{ color: AZUL }} />
        </span>
        <h2 className="text-center text-xl font-semibold text-gray-900">Verificá tu identidad</h2>
        <p className="mt-2 text-center text-sm leading-relaxed text-gray-500">
          Último paso: confirmamos que quien atiende sos realmente vos.
        </p>

        <PasosDidit />

        <ConsentimientoIdentidad
          ref={consentRef}
          aceptado={aceptado}
          onAceptadoChange={(v) => { setAceptado(v); if (v) setGuardActiva(false); }}
          guardActiva={guardActiva}
        />

        <CtaSticky
          label="Verificar mi identidad"
          onClick={onCtaClick}
          cargando={cargando}
          error={error}
          aviso="Al continuar, seguís en Didit, nuestro proveedor de verificación."
          loadingLabel="Conectando con Didit…"
        />
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
      <div className="mx-auto max-w-md px-6 pb-10 pt-6">{contenido}</div>
    </div>
  );
}
