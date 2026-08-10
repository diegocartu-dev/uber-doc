"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useRef, useEffect, useTransition, Suspense } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { crearConsulta, cambiarDeProfesional } from "@/app/clinica/actions";
import type { EncuentroActivo } from "@/lib/consultas/encuentro-activo";
import DoctoLogo from "@/components/DoctoLogo";
import LoadingButton from "@/components/ui/LoadingButton";
import TerminosContent from "@/app/terminos/TerminosContent";

const SINTOMAS_EMERGENCIA = [
  "Dolor de pecho",
  "Dificultad para respirar",
  "Pérdida de consciencia",
];

const SINTOMAS_OPCIONES = [
  "Fiebre",
  "Dolor de cabeza",
  "Dolor de pecho",
  "Dolor abdominal",
  "Náuseas o vómitos",
  "Diarrea",
  "Tos",
  "Dificultad para respirar",
  "Dolor de garganta",
  "Congestión nasal",
  "Dolor muscular o articular",
  "Fatiga o cansancio",
  "Mareos",
  "Pérdida de consciencia",
  "Erupción cutánea",
  "Problemas para dormir",
  "Ansiedad o estrés",
  "Dolor de espalda",
  "Problemas digestivos",
  "Otro",
];

const TIEMPO_OPCIONES = [
  "Menos de 24 horas",
  "1-3 días",
  "4-7 días",
  "1-2 semanas",
  "Más de 2 semanas",
  "Más de 1 mes",
];

export default function TriagePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full items-center justify-center bg-gray-50">
          <p className="text-sm text-gray-500">Cargando...</p>
        </div>
      }
    >
      <TriageContent />
    </Suspense>
  );
}

function TriageContent() {
  const searchParams = useSearchParams();
  const medicoId = searchParams.get("medicoId") ?? "";
  const especialidad = searchParams.get("especialidad") ?? "";
  const canalOrigen = searchParams.get("canal") === "consultorio_privado" ? "consultorio_privado" as const : "clinica_virtual" as const;
  const fromRaw = searchParams.get("from");
  const fromUrl = fromRaw && fromRaw.startsWith("/") && !fromRaw.includes("://") ? fromRaw : null;

  const [paso, setPaso] = useState(1);

  // Paso 1: Términos
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollCompleto, setScrollCompleto] = useState(false);
  const [checkTerminos, setCheckTerminos] = useState(false);
  const [checkMayorEdad, setCheckMayorEdad] = useState(false);

  // Paso 2: Triage
  const [motivo, setMotivo] = useState("");
  const [sintomas, setSintomas] = useState<string[]>([]);
  const [tiempo, setTiempo] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Atención paga en curso: no se abre otra (regla del Uber, Diego 09/08).
  const [encuentroPagado, setEncuentroPagado] = useState<EncuentroActivo | null>(null);
  // Solicitud impaga con otro profesional: se puede abandonar, pero preguntando.
  const [cambioPendiente, setCambioPendiente] = useState<EncuentroActivo | null>(null);
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);

  const tieneEmergencia = sintomas.some((s) => SINTOMAS_EMERGENCIA.includes(s));

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const llegaAlFinal = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
    if (llegaAlFinal) setScrollCompleto(true);
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Si el contenido no hace scroll (ya se ve todo), habilitar directamente
    if (el.scrollHeight <= el.clientHeight + 20) {
      setScrollCompleto(true);
    }
  }, []);

  function toggleSintoma(s: string) {
    setSintomas((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  function handleEnviarTriage() {
    if (!motivo.trim()) {
      setError("El motivo de consulta es obligatorio.");
      return;
    }
    if (sintomas.length === 0) {
      setError("Seleccioná al menos un síntoma.");
      return;
    }
    if (!tiempo) {
      setError("Indicá hace cuánto tiempo tenés los síntomas.");
      return;
    }
    if (tieneEmergencia) return;

    setError(null);
    setMostrarConfirmacion(true);
  }

  // Tres respuestas posibles del servidor, además del alta normal:
  //   · error              → el cartel de siempre
  //   · encuentroPagado    → ya tiene una atención paga: no se abre otra
  //   · cambioDeProfesional→ tiene una solicitud SIN pagar con otro profesional;
  //                          se le pregunta antes de cancelarla
  function procesarRespuesta(result: Awaited<ReturnType<typeof crearConsulta>>) {
    if (!result) return;
    if ("encuentroPagado" in result && result.encuentroPagado) {
      setEncuentroPagado(result.encuentroPagado);
      return;
    }
    if ("cambioDeProfesional" in result && result.cambioDeProfesional) {
      setCambioPendiente(result.cambioDeProfesional);
      return;
    }
    if ("error" in result && result.error) {
      setError(result.error);
    }
  }

  function handleConfirmarConsulta() {
    setMostrarConfirmacion(false);
    startTransition(async () => {
      procesarRespuesta(
        await crearConsulta(medicoId, especialidad, motivo, sintomas, tiempo, canalOrigen)
      );
    });
  }

  // El paciente confirmó que deja al profesional anterior. Recién acá se cancela
  // la solicitud vieja y se le avisa a ese profesional.
  function handleConfirmarCambio() {
    const anterior = cambioPendiente;
    if (!anterior) return;
    setCambioPendiente(null);
    startTransition(async () => {
      procesarRespuesta(
        await cambiarDeProfesional(
          anterior.id,
          medicoId,
          especialidad,
          motivo,
          sintomas,
          tiempo,
          canalOrigen
        )
      );
    });
  }

  const inputClass =
    "mt-1 block w-full rounded-[var(--radius-md)] border px-3 py-2 text-[15px] shadow-sm focus:outline-none";

  return (
    <div className="min-h-full bg-gray-50">
      <nav
        className="sticky top-0 z-50 bg-white"
        style={{ borderBottom: "1px solid var(--color-border-default)", height: 56 }}
      >
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 lg:px-6">
          <DoctoLogo />
          <Link
            href={fromUrl ?? "/clinica"}
            className="text-sm transition-colors"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {fromUrl ? "Volver al consultorio" : "Volver a la clínica"}
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-2xl px-4 py-10">
        {/* Indicador de pasos */}
        <div className="mb-8 flex items-center justify-center gap-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{ backgroundColor: paso === 1 ? "var(--color-primary)" : "var(--color-success)" }}
          >
            {paso > 1 ? <Check size={16} strokeWidth={2} /> : "1"}
          </div>
          <div className="h-px w-12" style={{ backgroundColor: "var(--color-border-default)" }} />
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold"
            style={{
              backgroundColor: paso === 2 ? "var(--color-primary)" : "var(--color-bg-tertiary)",
              color: paso === 2 ? "white" : "var(--color-text-tertiary)",
            }}
          >
            2
          </div>
        </div>

        {/* PASO 1: Términos y condiciones */}
        {paso === 1 && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h1 className="text-xl font-bold text-gray-900">
              Términos y condiciones
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Leé los términos completos antes de continuar
            </p>

            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="mt-4 h-96 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-5 text-sm leading-relaxed text-gray-700"
            >
              {/* Fuente ÚNICA de TyC: el mismo componente que /terminos.
                  No duplicar el texto acá — se desincroniza (lección aprendida). */}
              <TerminosContent hideTitle />

              <div className="mt-6 rounded-[var(--radius-md)] p-4 text-center text-xs" style={{ backgroundColor: "var(--color-primary-soft)", color: "var(--color-brand-dark)" }}>
                — Fin de los Términos y Condiciones —
              </div>
            </div>

            {!scrollCompleto && (
              <p className="mt-2 text-center text-xs text-amber-600">
                Desplazá hacia abajo para leer todos los términos
              </p>
            )}

            <div className="mt-5 space-y-3">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  disabled={!scrollCompleto}
                  checked={checkTerminos}
                  onChange={(e) => setCheckTerminos(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)] disabled:opacity-40"
                />
                <span
                  className={`text-sm ${
                    scrollCompleto ? "text-gray-700" : "text-gray-400"
                  }`}
                >
                  Leí y acepto los términos y condiciones
                </span>
              </label>

              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  disabled={!scrollCompleto}
                  checked={checkMayorEdad}
                  onChange={(e) => setCheckMayorEdad(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)] disabled:opacity-40"
                />
                <span
                  className={`text-sm ${
                    scrollCompleto ? "text-gray-700" : "text-gray-400"
                  }`}
                >
                  Soy mayor de edad y mis datos son verídicos
                </span>
              </label>
            </div>

            <button
              disabled={!checkTerminos || !checkMayorEdad}
              onClick={() => setPaso(2)}
              className="mt-6 w-full rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.97] transition-all duration-100"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              Continuar
            </button>
          </div>
        )}

        {/* PASO 2: Triage médico */}
        {paso === 2 && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h1 className="text-xl font-bold text-gray-900">Triage médico</h1>
            <p className="mt-1 text-sm text-gray-500">
              Contanos sobre tu consulta para que el médico pueda prepararse
            </p>

            {error && (
              <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            {/* Alerta de emergencia */}
            {tieneEmergencia && (
              <div className="mt-4 rounded-xl border-2 border-red-500 bg-red-50 p-5">
                <div className="flex items-center gap-2 text-lg font-bold" style={{ color: "var(--color-danger)" }}>
                  <AlertTriangle size={24} strokeWidth={1.75} />
                  EMERGENCIA MEDICA
                </div>
                <p className="mt-2 text-sm font-medium text-red-700">
                  Los síntomas que seleccionaste pueden indicar una emergencia
                  médica que requiere atención presencial inmediata.
                </p>
                <div className="mt-3 rounded-lg bg-red-100 p-4">
                  <p className="text-center text-lg font-bold text-red-800">
                    Llamá al 107 (SAME) o 911 de inmediato
                  </p>
                </div>
                <p className="mt-3 text-xs text-red-600">
                  Docto no es un servicio de emergencias. No podemos
                  continuar con la consulta virtual si presentás estos síntomas.
                </p>
              </div>
            )}

            <div className="mt-6 space-y-5">
              {/* Motivo de consulta */}
              <div>
                <label htmlFor="motivo" className="block text-sm font-medium text-gray-700">
                  Motivo de consulta *
                </label>
                <textarea
                  id="motivo"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  required
                  rows={3}
                  className={inputClass + " resize-none"}
                  placeholder="Describí brevemente por qué querés consultar..."
                />
              </div>

              {/* Síntomas */}
              <div>
                <p className="block text-sm font-medium text-gray-700">
                  Síntomas principales *
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Seleccioná todos los que apliquen
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {SINTOMAS_OPCIONES.map((s) => {
                    const seleccionado = sintomas.includes(s);
                    const esEmergencia = SINTOMAS_EMERGENCIA.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleSintoma(s)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          seleccionado
                            ? esEmergencia
                              ? "border-red-300 bg-red-100 text-red-700"
                              : "border-[var(--color-primary-border)] bg-[var(--color-primary-soft)] text-[var(--color-brand-dark)]"
                            : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tiempo */}
              <div>
                <label htmlFor="tiempo" className="block text-sm font-medium text-gray-700">
                  ¿Hace cuánto tiempo tenés estos síntomas? *
                </label>
                <select
                  id="tiempo"
                  value={tiempo}
                  onChange={(e) => setTiempo(e.target.value)}
                  required
                  className={inputClass}
                >
                  <option value="" disabled>
                    Seleccioná una opción
                  </option>
                  {TIEMPO_OPCIONES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setPaso(1)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Atrás
              </button>
              <LoadingButton
                isLoading={isPending}
                disabled={tieneEmergencia}
                onClick={handleEnviarTriage}
                className="flex-1 rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.97] transition-all duration-100"
                style={{ backgroundColor: "var(--color-primary)" }}
              >
                Entrar a la sala de espera
              </LoadingButton>
            </div>
          </div>
        )}
      </main>

      {/* Ya tiene una atención PAGA en curso: no se abre otra, se lo lleva a la
          suya. "Como usar un Uber y querer pedir otro" (Diego, 09/08). Antes
          esto era un texto rojo arriba del formulario que el paciente no
          llegaba a ver y que además no ofrecía ninguna salida. */}
      {encuentroPagado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900">
              {encuentroPagado.canal === "turno"
                ? "Ya tenés un turno activo"
                : "Ya tenés una consulta activa"}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-700">
              {encuentroPagado.canal === "turno"
                ? `Estás en el turno con ${encuentroPagado.medicoNombre}. `
                : `Tenés una consulta en curso con ${encuentroPagado.medicoNombre}. `}
              Ya está paga, así que no hace falta pedir otra: te llevamos ahí.
            </p>
            <div className="mt-6 space-y-3">
              <Link
                href={encuentroPagado.href}
                className="block w-full rounded-[var(--radius-md)] px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm hover:opacity-90 active:scale-[0.97] transition-all duration-100"
                style={{ backgroundColor: "var(--color-primary)" }}
              >
                {encuentroPagado.canal === "turno" ? "Ir a mi turno" : "Ir a mi consulta"}
              </Link>
              <Link
                href="/mis-consultas"
                className="block w-full rounded-lg border border-gray-300 px-4 py-2 text-center text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Ver mis atenciones
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Tiene una solicitud SIN PAGAR con otro profesional. Puede dejarla, pero
          se le pregunta: es su consulta y puede haber entrado acá por error. Si
          confirma, se cancela la anterior y a ese profesional se le avisa. */}
      {cambioPendiente && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900">
              Tenés una consulta pendiente con {cambioPendiente.medicoNombre}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-700">
              Todavía no la pagaste, así que podés dejarla y consultar con otro
              profesional. Si seguís, cancelamos esa solicitud y le avisamos para
              que no te siga esperando.
            </p>
            <div className="mt-6 space-y-3">
              <LoadingButton
                isLoading={isPending}
                onClick={handleConfirmarCambio}
                className="w-full rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50 active:scale-[0.97] transition-all duration-100"
                style={{ backgroundColor: "var(--color-primary)" }}
              >
                Sí, quiero consultar con este profesional
              </LoadingButton>
              <Link
                href={cambioPendiente.href}
                className="block w-full rounded-lg border border-gray-300 px-4 py-2 text-center text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Volver a mi consulta con {cambioPendiente.medicoNombre}
              </Link>
              <button
                onClick={() => setCambioPendiente(null)}
                className="w-full px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup de confirmación */}
      {mostrarConfirmacion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="text-center">
              <AlertTriangle size={40} strokeWidth={1.75} style={{ color: "var(--color-warning)" }} />
              <h2 className="mt-3 text-lg font-bold text-gray-900">
                Antes de continuar
              </h2>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-gray-700">
              Docto <strong>NO</strong> es un servicio de emergencias
              médicas. Si tu situación es urgente o sentís que empeora, no
              esperes — llamá al <strong>107</strong> (SAME) o al{" "}
              <strong>911</strong> de inmediato.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-gray-700">
              Este servicio es para consultas médicas no urgentes que pueden
              atenderse de forma virtual.
            </p>
            <p className="mt-3 text-sm font-medium text-gray-900">
              ¿Tu consulta es no urgente y podés esperar la atención del médico?
            </p>

            <div className="mt-6 space-y-3">
              <LoadingButton
                isLoading={isPending}
                onClick={handleConfirmarConsulta}
                className="w-full rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50 active:scale-[0.97] transition-all duration-100"
                style={{ backgroundColor: "var(--color-primary)" }}
              >
                Sí, es una consulta no urgente — continuar
              </LoadingButton>
              <a
                href="tel:107"
                className="block w-full rounded-lg bg-red-600 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm hover:bg-red-700 active:scale-95 active:opacity-80 transition-all duration-100"
              >
                Es una urgencia — llamar al 107
              </a>
              <button
                onClick={() => setMostrarConfirmacion(false)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Volver al triage
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
