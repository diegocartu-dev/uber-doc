"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Stethoscope,
  ShieldCheck,
  ScanLine,
  Camera,
  BadgeCheck,
  Clock,
  Lock,
  RefreshCw,
  Loader2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import LogoutButton from "./LogoutButton";
import { CONSENTIMIENTO_IDENTIDAD_TEXTO } from "@/lib/didit/consentimiento";

// ─── Colores del design system ────────────────────────────────────────────────
const AZUL = "#378ADD";
const AZUL_BG = "rgba(55, 138, 221, 0.1)";
const AMARILLO = "#BA7517";
const AMARILLO_BG = "rgba(186, 117, 23, 0.1)";
const NARANJA = "#D85A30";
const NARANJA_BG = "rgba(216, 90, 48, 0.1)";
const VERDE = "#1D9E75";
const GRIS = "#888780";
const ROJO = "#E24B4A";

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

// ─── CTA principal sticky bottom (componente de módulo, estable) ───────────────
function CtaSticky({
  label,
  onClick,
  cargando,
  error,
  atenuado = false,
  hint,
  loadingLabel,
}: {
  label: string;
  onClick: () => void;
  cargando: boolean;
  error: string | null;
  atenuado?: boolean;
  hint?: string;
  loadingLabel?: string;
}) {
  return (
    <div
      className="sticky bottom-0 z-10 -mx-6 mt-8 border-t border-gray-100 px-6 pt-4"
      style={{
        background: "rgba(248, 249, 250, 0.95)",
        backdropFilter: "blur(8px)",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
    >
      {hint && (
        <p className="mb-2 text-center text-xs text-gray-500">{hint}</p>
      )}
      {/* El botón NUNCA se deshabilita por falta de checkbox (Safari iOS no
          dispara click en disabled → callejón sin salida). Se atenúa por estilo
          y la guarda vive en el onClick del caller. */}
      <button
        onClick={onClick}
        disabled={cargando}
        className="flex w-full items-center justify-center gap-2 rounded-lg py-3.5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
        style={{ background: AZUL, opacity: atenuado && !cargando ? 0.6 : undefined }}
      >
        {cargando ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            {loadingLabel ?? "Conectando con Didit…"}
          </>
        ) : (
          <>
            {label}
            <span aria-hidden>→</span>
          </>
        )}
      </button>
      {error && (
        <p className="mt-2 text-center text-xs" style={{ color: ROJO }}>
          {error}
        </p>
      )}
    </div>
  );
}

interface Props {
  diditStatus: string | null;
  recienVolvio: boolean;
  userId: string;
}

export default function PantallaIdentidad({
  diditStatus,
  recienVolvio,
  userId,
}: Props) {
  const router = useRouter();
  const estado = mapEstado(diditStatus, recienVolvio);

  const [paso, setPaso] = useState<"intro" | "consentimiento">("intro");
  const [aceptado, setAceptado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intentoSinAceptar, setIntentoSinAceptar] = useState(false);

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

  async function iniciarVerificacion() {
    setCargando(true);
    setError(null);
    try {
      const resp = await fetch("/api/didit/crear-sesion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consentimiento: true, origin: "identidad" }),
      });
      const data = await resp.json();
      if (data?.yaValidado) {
        router.refresh();
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
  } else if (estado === "rechazada") {
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
        <CtaSticky
          label="Volver a intentar"
          onClick={iniciarVerificacion}
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
  } else if (estado === "en_progreso") {
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
        <CtaSticky
          label="Continuar verificación"
          onClick={iniciarVerificacion}
          cargando={cargando}
          error={error}
        />
      </div>
    );
  } else if (paso === "consentimiento") {
    // SIN EMPEZAR — Paso 2: consentimiento
    contenido = (
      <div>
        <Header
          Icon={ShieldCheck}
          color={AZUL}
          bg={AZUL_BG}
          titulo="Cómo funciona la verificación"
          subtitulo="Leé y aceptá para continuar a Didit"
        />

        {/* Resumen escaneable */}
        <div
          className="mt-6 space-y-3 rounded-xl bg-white p-4 text-left"
          style={{ border: "1px solid #e5e7eb" }}
        >
          <div className="flex items-center gap-3 text-sm text-gray-700">
            <ScanLine size={20} style={{ color: AZUL }} className="shrink-0" />
            Escaneás tu documento (DNI)
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-700">
            <Camera size={20} style={{ color: AZUL }} className="shrink-0" />
            Te sacás una selfie para confirmar que sos vos
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-700">
            <BadgeCheck size={20} style={{ color: AZUL }} className="shrink-0" />
            Validamos tu identidad contra RENAPER
          </div>
        </div>

        {/* Microcopy de tranquilidad */}
        <p className="mt-4 text-left text-sm leading-relaxed text-gray-600">
          Tus datos biométricos los procesa Didit, un proveedor especializado —
          Docto nunca recibe ni guarda tu selfie. Solo conservamos el resultado
          de la verificación.
        </p>

        {/* Texto legal completo (scroll propio) */}
        <p className="mt-5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
          Consentimiento
        </p>
        <div className="mt-2 max-h-48 overflow-y-auto overscroll-contain whitespace-pre-line rounded-lg bg-white p-4 text-left text-xs leading-relaxed text-gray-600" style={{ border: "1px solid #e5e7eb" }}>
          {CONSENTIMIENTO_IDENTIDAD_TEXTO}
        </div>

        {/* Checkbox grande, fila completa clickeable */}
        <label
          className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg bg-white p-3"
          style={{ border: "1px solid #e5e7eb" }}
        >
          <input
            type="checkbox"
            checked={aceptado}
            onChange={(e) => {
              setAceptado(e.target.checked);
              if (e.target.checked) setIntentoSinAceptar(false);
            }}
            className="mt-0.5 h-6 w-6 shrink-0 rounded border-gray-300"
            style={{ accentColor: AZUL }}
          />
          <span className="text-left text-sm text-gray-700">
            Presto mi consentimiento expreso para verificar mi identidad con
            Didit, según el texto de arriba.
          </span>
        </label>

        <CtaSticky
          label="Aceptar y verificar"
          onClick={() => {
            if (!aceptado) {
              setIntentoSinAceptar(true);
              return;
            }
            iniciarVerificacion();
          }}
          cargando={cargando}
          error={error}
          atenuado={!aceptado}
          hint={
            intentoSinAceptar && !aceptado
              ? "Marcá la casilla para continuar"
              : undefined
          }
        />
      </div>
    );
  } else {
    // SIN EMPEZAR — Paso 1: intro
    contenido = (
      <div>
        <Header
          Icon={ShieldCheck}
          color={AZUL}
          bg={AZUL_BG}
          titulo="Verificá tu identidad"
          subtitulo="Un paso único para activar tu cuenta"
        />
        <p className="mt-5 text-left text-sm leading-relaxed text-gray-600">
          Validamos que sos el titular de la matrícula que registraste. Esto te
          protege contra la suplantación de identidad y le da confianza a tus
          pacientes.
        </p>
        <div
          className="mt-6 space-y-3 rounded-xl bg-white p-4 text-left"
          style={{ border: "1px solid #e5e7eb" }}
        >
          <div className="flex items-center gap-3 text-sm text-gray-700">
            <Clock size={18} style={{ color: GRIS }} className="shrink-0" />
            Toma menos de 2 minutos
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-700">
            <Lock size={18} style={{ color: GRIS }} className="shrink-0" />
            Una sola vez, para siempre
          </div>
        </div>
        <CtaSticky
          label="Comenzar"
          onClick={() => setPaso("consentimiento")}
          cargando={false}
          error={null}
        />
        <p className="mt-3 text-center text-xs text-gray-400">
          Vas a continuar en Didit, nuestro proveedor de verificación.
        </p>
      </div>
    );
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
      <div className="mx-auto max-w-lg px-6 pb-8 pt-12 sm:pt-16">{contenido}</div>
    </div>
  );
}
