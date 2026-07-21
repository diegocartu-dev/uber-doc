"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Stethoscope, ShieldCheck, Clock, RefreshCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import LogoutButton from "./LogoutButton";
import PasosDidit from "@/components/identidad/PasosDidit";
import ConsentimientoIdentidad from "@/components/identidad/ConsentimientoIdentidad";
import CtaSticky from "@/components/identidad/CtaSticky";

// ─── Colores del design system ────────────────────────────────────────────────
const AZUL = "#378ADD";
const AZUL_BG = "rgba(55, 138, 221, 0.1)";
const AMARILLO = "#BA7517";
const AMARILLO_BG = "rgba(186, 117, 23, 0.1)";
const NARANJA = "#D85A30";
const NARANJA_BG = "rgba(216, 90, 48, 0.1)";
const VERDE = "#1D9E75";
const GRIS = "#888780";

type Estado =
  | "sin_empezar"
  | "en_progreso"
  | "en_revision"
  | "rechazada"
  | "procesando";

function mapEstado(diditStatus: string | null, recienVolvio: boolean): Estado {
  const s = diditStatus ?? "Not Started";
  // Aprobado por Didit pero identidad_validada todavía en vuelo (webhook/cruce) →
  // "procesando". Esta pantalla solo se monta si !identidad_validada, así que un
  // "Approved" acá significa que falta el flip final, NO que tenga que empezar.
  if (s === "Approved") return "procesando";
  const terminal = ["In Review", "Resubmitted", "Declined"];
  // Volvió de Didit pero el webhook todavía no resolvió → mostrar "procesando".
  if (recienVolvio && !terminal.includes(s)) return "procesando";
  if (s === "In Progress" || s === "Abandoned" || s === "Expired")
    return "en_progreso";
  if (s === "In Review" || s === "Resubmitted") return "en_revision";
  if (s === "Declined") return "rechazada";
  return "sin_empezar";
}

// ─── Header común (componente de módulo, estable) ──────────────────────────────
function Header({
  Icon,
  color,
  bg,
  titulo,
  subtitulo,
}: {
  Icon: LucideIcon;
  color: string;
  bg: string;
  titulo: string;
  subtitulo: string;
}) {
  return (
    <>
      <div
        className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full"
        style={{ backgroundColor: bg }}
      >
        <Icon size={28} strokeWidth={1.75} style={{ color }} />
      </div>
      <h2 className="text-center text-xl font-semibold text-gray-900">
        {titulo}
      </h2>
      <p className="mt-2 text-center text-sm leading-relaxed text-gray-500">
        {subtitulo}
      </p>
    </>
  );
}

interface Props {
  diditStatus: string | null;
  recienVolvio: boolean;
  userId: string;
}

// Respec Sofía 20/07: se fusionaron las dos pantallas del flujo "sin empezar"
// (intro con "Comenzar" + pantalla de consentimiento) en UNA sola, idéntica al
// registro por construcción (componentes compartidos en src/components/identidad).
// El CTA nunca se atenúa: la guarda scrollea y resalta la casilla. Reintentos
// (rechazada / a medias) van DIRECTO amparados en el consentimiento registrado
// (dictamen Carolina 20/07); si el servidor no encuentra aceptación previa
// (consentimiento_requerido), se cae al flujo con checkbox.
export default function PantallaIdentidad({
  diditStatus,
  recienVolvio,
  userId,
}: Props) {
  const router = useRouter();
  const estado = mapEstado(diditStatus, recienVolvio);

  const [aceptado, setAceptado] = useState(false);
  const [guardActiva, setGuardActiva] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Un retry directo que el servidor rechazó por falta de aceptación previa
  // (caso borde) fuerza el flujo completo con checkbox.
  const [forzarConsentimiento, setForzarConsentimiento] = useState(false);
  const consentRef = useRef<HTMLDivElement>(null);

  // Polling: cuando el webhook marca validado o cambia el didit_status → refresh.
  const estadoInicialRef = useRef(diditStatus);
  useEffect(() => {
    const supabase = createClient();
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("medicos")
        .select("identidad_validada, didit_status")
        .eq("user_id", userId)
        .single();
      if (!data) return;
      if (data.identidad_validada) {
        router.refresh();
        return;
      }
      if (data.didit_status !== estadoInicialRef.current) {
        estadoInicialRef.current = data.didit_status;
        router.refresh();
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [userId, router]);

  async function iniciarVerificacion(conConsentimiento: boolean) {
    setCargando(true);
    setError(null);
    try {
      const resp = await fetch("/api/didit/crear-sesion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          conConsentimiento
            ? { consentimiento: true, origin: "identidad" }
            : { origin: "identidad" }
        ),
      });
      const data = await resp.json();
      if (data?.yaValidado) {
        router.refresh();
        return;
      }
      if (resp.status === 400 && data?.error === "consentimiento_requerido") {
        // Caso borde: no hay aceptación registrada → mostrar el flujo completo.
        setForzarConsentimiento(true);
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
      if (!resp.ok || !data?.url) {
        throw new Error(data?.error ?? "error");
      }
      // Redirect full a Didit (dominio externo).
      window.location.href = data.url;
    } catch {
      setError(
        "No pudimos iniciar la verificación. Probá de nuevo en un momento."
      );
      setCargando(false);
    }
  }

  // Guard del CTA de consentimiento: el botón nunca parece muerto — si falta la
  // casilla, lleva al médico hasta ella (scroll + resaltado).
  function onCtaConsentimiento() {
    if (!aceptado) {
      setGuardActiva(true);
      consentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    iniciarVerificacion(true);
  }

  // Pantalla única de inicio/consentimiento (compartida con el registro).
  const pantallaConsentimiento = (
    <div>
      <span
        className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full"
        style={{ background: AZUL_BG }}
      >
        <ShieldCheck size={22} strokeWidth={1.75} style={{ color: AZUL }} />
      </span>
      <h2 className="text-center text-xl font-semibold text-gray-900">
        Verificá tu identidad
      </h2>
      <p className="mt-2 text-center text-sm leading-relaxed text-gray-500">
        Confirmamos que quien atiende sos realmente vos.
      </p>

      <PasosDidit />

      <ConsentimientoIdentidad
        ref={consentRef}
        aceptado={aceptado}
        onAceptadoChange={(v) => {
          setAceptado(v);
          if (v) setGuardActiva(false);
        }}
        guardActiva={guardActiva}
      />

      <CtaSticky
        label="Verificar mi identidad"
        onClick={onCtaConsentimiento}
        cargando={cargando}
        error={error}
        aviso="Al continuar, seguís en Didit, nuestro proveedor de verificación."
      />
    </div>
  );

  // ─── Contenido por estado (JSX calculado, NO componente anidado) ────────────
  let contenido: React.ReactNode;

  if (estado === "procesando") {
    contenido = (
      <div className="text-center">
        <div
          className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-[3px]"
          style={{ borderColor: AZUL_BG, borderTopColor: AZUL }}
          role="status"
          aria-label="Procesando"
        />
        <h2 className="text-xl font-semibold text-gray-900">
          Procesando tu verificación…
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-gray-500">
          Estamos procesando tu verificación. No cierres esta pantalla.
        </p>
      </div>
    );
  } else if (estado === "en_revision") {
    contenido = (
      <div>
        <Header
          Icon={Clock}
          color={AZUL}
          bg={AZUL_BG}
          titulo="Estamos revisando tu verificación"
          subtitulo="Casi listo. Te avisamos por email."
        />
        <p className="mt-5 text-left text-sm leading-relaxed text-gray-600">
          Verificamos tu identidad correctamente. Solo nos falta confirmar tu
          matrícula profesional. Es un paso manual — te avisamos por email
          apenas esté lista.
        </p>
        <div
          className="mt-6 space-y-3 rounded-xl bg-white p-4 text-left"
          style={{ border: "1px solid #e5e7eb" }}
        >
          <div className="flex items-center gap-3 text-sm text-gray-700">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: VERDE }}
            />
            Identidad verificada
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: AMARILLO }}
            />
            Matrícula en revisión
          </div>
        </div>
        <button
          onClick={() => router.refresh()}
          className="mt-6 w-full py-3 text-center text-sm transition hover:underline"
          style={{ color: GRIS }}
        >
          Actualizar estado
        </button>
      </div>
    );
  } else if (estado === "rechazada" && !forzarConsentimiento) {
    contenido = (
      <div>
        <Header
          Icon={RefreshCw}
          color={NARANJA}
          bg={NARANJA_BG}
          titulo="No pudimos verificarte esta vez"
          subtitulo="Probá de nuevo, suele resolverse"
        />
        <p className="mt-5 text-left text-sm leading-relaxed text-gray-600">
          La verificación no salió esta vez. Suele pasar por una foto borrosa,
          poca luz o un documento difícil de leer.
        </p>
        <div
          className="mt-5 rounded-xl bg-white p-4 text-left"
          style={{ border: "1px solid #e5e7eb" }}
        >
          <p className="text-sm font-medium text-gray-900">
            Para que salga bien:
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-gray-600">
            <li>• Buena luz, sin reflejos en el DNI</li>
            <li>• Documento vigente y completo</li>
            <li>• Tu cara despejada, sin lentes oscuros</li>
          </ul>
        </div>
        <PasosDidit />
        <CtaSticky
          label="Volver a intentar"
          onClick={() => iniciarVerificacion(false)}
          cargando={cargando}
          error={error}
        />
        <p className="mt-3 text-center text-xs text-gray-400">
          ¿Seguís con problemas? Escribinos a{" "}
          <a
            href="mailto:soporte@docto.com.ar"
            className="hover:underline"
            style={{ color: AZUL }}
          >
            soporte@docto.com.ar
          </a>
        </p>
      </div>
    );
  } else if (estado === "en_progreso" && !forzarConsentimiento) {
    contenido = (
      <div>
        <Header
          Icon={Clock}
          color={AMARILLO}
          bg={AMARILLO_BG}
          titulo="Te quedó la verificación a medias"
          subtitulo="Podés retomarla donde la dejaste"
        />
        <p className="mt-5 text-left text-sm leading-relaxed text-gray-600">
          Empezaste a verificar tu identidad pero no llegaste a terminar. No te
          preocupes, no perdiste nada.
        </p>
        <PasosDidit />
        <CtaSticky
          label="Continuar verificación"
          onClick={() => iniciarVerificacion(false)}
          cargando={cargando}
          error={error}
        />
      </div>
    );
  } else {
    // SIN EMPEZAR (o retry sin aceptación previa registrada) — pantalla única.
    contenido = pantallaConsentimiento;
  }

  return (
    <div className="min-h-full bg-[#f8f9fa]">
      <nav className="bg-white" style={{ borderBottom: "0.5px solid #e5e7eb" }}>
        <div className="mx-auto max-w-7xl px-4 lg:px-6">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-2">
              <Stethoscope size={24} strokeWidth={2} color={AZUL} />
              <span className="text-lg font-bold lowercase text-gray-900">
                docto
              </span>
            </div>
            {/* Salida SIEMPRE visible (gate Sofía #263): como página dedicada,
                sin este link se reconstruye el callejón sin salida del muro. */}
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="text-sm transition hover:underline"
                style={{ color: GRIS }}
              >
                ← Volver al panel
              </Link>
              <LogoutButton />
            </div>
          </div>
        </div>
      </nav>
      <div className="mx-auto max-w-lg px-6 pb-8 pt-6 sm:pt-10">{contenido}</div>
    </div>
  );
}
