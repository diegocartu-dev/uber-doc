"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { TouchButton } from "@/components/TouchButton";
import { useDashboardMedico } from "./DashboardMedicoProvider";
import { capitalizarNombre } from "@/lib/utils/texto";

// ── La ventana del paciente que ya fue aceptado (Diego, 10/09/2026) ─────────
//
// Medido sobre las 12 CI aceptadas desde el 19/08: 6 se pagaron y 6 no, y CINCO
// de esas 6 las canceló el profesional a mano. A dos pacientes les cancelaron la
// consulta 24 y 30 segundos después de aceptarla — menos que el pago más rápido
// de la historia (23 s) y muy lejos del más lento (137 s). Eso no es un paciente
// que no paga: es una ventana que no existió.
//
// El motivo era esta pantalla. Al aceptar, el sistema mandaba al profesional a la
// sala de video, la sala rebotaba (solo abre pagada/en_curso) y lo devolvía acá,
// donde lo único que podía apretar era un botón rojo.
//
// Ahora: durante los primeros minutos no hay botón de cancelar, hay un reloj y la
// promesa de que el sistema lo libera solo.
const MINUTOS_SIN_CANCELAR = 3;

// El plazo tras el cual el sistema cierra la consulta y libera al profesional
// (cron `ci-aceptada-sin-pago`). Es el número que esta pantalla le PROMETE al
// profesional: tiene que coincidir con PLAZO_PAGO_MIN de
// src/lib/consultas/aceptada-sin-pago.ts, que lo fija con un test.
const PLAZO_PAGO_MIN = 10;

// Margen para arrepentirse (Diego: "si tocó el botón por error"). La cancelación
// NO se ejecuta y después se revierte: se DEMORA. Revertirla sería imposible —
// dispara el reembolso si hubo pago, y al paciente le aparece "esta consulta no
// pudo concretarse" en menos de 5 segundos, con el menú para irse con otro
// profesional. Acá no pasa nada hasta que el contador llega a cero.
const SEGUNDOS_DESHACER = 8;

type Consulta = {
  id: string;
  especialidad: string;
  estado: string;
  paciente_nombre: string;
  paciente_tabla_id: string | null;
  sala_video_url: string | null;
  motivo_consulta: string | null;
  sintomas: string[] | null;
  created_at: string;
  aceptada_at?: string | null;
  fecha_nacimiento: string | null;
};

/** Segundos desde una fecha ISO. `null` si no hay fecha o es inválida. */
function segundosDesde(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 1000));
}

/** "2:45" — lo que le queda al paciente, en minutos y segundos. */
function mmss(segundos: number): string {
  const s = Math.max(0, segundos);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function calcularEdad(fechaNac: string | null): string {
  if (!fechaNac) return "";
  const hoy = new Date();
  const nac = new Date(fechaNac);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return `${edad} años`;
}

function tiempoTranscurrido(fecha: string): string {
  if (!fecha) return "";
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "recién iniciada";
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

export default function ConsultasEnCurso({ medicoId }: { medicoId: string }) {
  const { enCurso: consultas, flashConsultaId } = useDashboardMedico();
  const router = useRouter();
  const [cancelando, setCancelando] = useState<string | null>(null);
  // El error va ATADO a su consulta: el cartel se pinta adentro del map, así que
  // un string suelto hacía aparecer el fallo de una consulta en TODAS las tarjetas.
  const [error, setError] = useState<{ id: string; msg: string } | null>(null);
  // Confirmación de cancelación — dialog React inline.
  // window.confirm() lo suprime Chrome en páginas con iframes cross-origin.
  const [confirmandoCancelar, setConfirmandoCancelar] = useState<string | null>(null);

  // Reloj de la pantalla: un tick por segundo para el tiempo del paciente y para
  // que el botón de cancelar aparezca solo cuando corresponde, sin recargar.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Cancelación DEMORADA: mientras esto tenga valor, no se canceló nada todavía.
  const [porCancelar, setPorCancelar] = useState<{ id: string; restan: number; estadoAlConfirmar: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // La lista viva, para que el disparo diferido revalide contra lo último que
  // llegó del poll y no contra lo que había cuando arrancó la cuenta regresiva.
  const consultasRef = useRef(consultas);
  consultasRef.current = consultas;

  function abortarCuentaRegresiva() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }
  // Si el profesional se va de la pantalla con una cancelación en curso, NO se
  // cancela: nunca destruimos una atención por una intención a medio confirmar.
  // El plazo del sistema la resuelve igual unos minutos después.
  useEffect(() => abortarCuentaRegresiva, []);

  function handleIniciar(consultaId: string) {
    router.push(`/medico/consulta/${consultaId}/workspace`);
  }

  /** Confirmó en el diálogo: arranca la cuenta regresiva, no cancela nada aún. */
  function iniciarCancelacion(consultaId: string) {
    setConfirmandoCancelar(null);
    setError(null);
    // Una cancelación por vez. Sin esto, confirmar una segunda tarjeta mataba en
    // silencio la cuenta regresiva de la primera: esa consulta no se cancelaba
    // nunca y el profesional se quedaba creyendo que sí.
    if (porCancelar) return;
    abortarCuentaRegresiva();
    // El estado de AHORA. Si cambia durante los 8 segundos (el caso esperable es
    // que el paciente pague y el webhook la pase a `en_curso`) la cancelación se
    // aborta: cancelar ahí dispararía el reembolso de un pago recién hecho.
    const estadoAlConfirmar = consultas.find((x) => x.id === consultaId)?.estado ?? "";
    setPorCancelar({ id: consultaId, restan: SEGUNDOS_DESHACER, estadoAlConfirmar });
    timerRef.current = setInterval(() => {
      setPorCancelar((prev) => {
        if (!prev) return null;
        if (prev.restan > 1) return { ...prev, restan: prev.restan - 1 };
        // Llegó a cero: recién ACÁ se cancela de verdad.
        abortarCuentaRegresiva();
        void cancelarDeVerdad(prev.id, prev.estadoAlConfirmar);
        return null;
      });
    }, 1000);
  }

  function deshacerCancelacion() {
    abortarCuentaRegresiva();
    setPorCancelar(null);
  }

  async function cancelarDeVerdad(consultaId: string, estadoAlConfirmar: string) {
    // Revalidación contra lo último que trajo el panel (poll de 5 s). El choque no
    // es marginal: el aviso de los 90 segundos existe justamente para que el
    // paciente vuelva y pague, y el botón recién aparece a los 3 minutos.
    const actual = consultasRef.current.find((x) => x.id === consultaId);
    if (!actual) return; // Ya no está en el panel: se resolvió sola.
    if (actual.estado !== estadoAlConfirmar) {
      setError({
        id: consultaId,
        msg:
          actual.estado === "en_curso" || actual.estado === "pagada"
            ? "No se canceló: el paciente pagó mientras tanto."
            : "No se canceló: la consulta cambió de estado.",
      });
      return;
    }
    setCancelando(consultaId);
    try {
      const res = await fetch(`/api/consulta/${consultaId}/cancelar-medico`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!data.ok) {
        setError({ id: consultaId, msg: data.error || "Error al cancelar la consulta." });
      }
    } catch {
      setError({ id: consultaId, msg: "Error de conexión." });
    } finally {
      setCancelando(null);
    }
  }

  if (consultas.length === 0) return null;

  return (
    <div className="space-y-4">
      {consultas.map((c) => {
        const edad = calcularEdad(c.fecha_nacimiento);
        const transcurrido = tiempoTranscurrido(c.created_at);
        const puedeVideo = c.estado === "pagada" || c.estado === "en_curso";
        const esperandoPago = c.estado === "aceptada";

        // Reloj del paciente. `aceptada_at` no existe en las consultas anteriores
        // al 19/08; ahí cae a `created_at`, que en una CI está a un minuto o dos
        // de distancia y alcanza para lo único que decide: si ya pasó el margen.
        const desdeAcept = segundosDesde(c.aceptada_at ?? c.created_at) ?? 0;
        const restanPago = PLAZO_PAGO_MIN * 60 - desdeAcept;
        // El botón de cancelar aparece recién a los 3 minutos, y SOLO se esconde
        // mientras el paciente está en la ventana de pago. Con la consulta ya
        // pagada o en curso el profesional cancela cuando quiera, como siempre.
        const puedeCancelar = !esperandoPago || desdeAcept >= MINUTOS_SIN_CANCELAR * 60;
        const cancelacionEnCurso = porCancelar?.id === c.id;

        const flash = flashConsultaId === c.id;

        return (
          <div
            key={c.id}
            className="rounded-xl border-l-4 border-[#378ADD] bg-white p-6"
            style={{
              borderTop: "0.5px solid #e5e7eb",
              borderRight: "0.5px solid #e5e7eb",
              borderBottom: "0.5px solid #e5e7eb",
              boxShadow: flash ? "0 0 0 3px #378ADD" : "none",
              transition: "box-shadow 0.3s ease",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    esperandoPago ? "bg-[#D85A30]" : "animate-pulse bg-[#1D9E75]"
                  }`}
                />
                <span
                  className="text-xs font-medium tracking-wide"
                  style={{ color: esperandoPago ? "#D85A30" : "#1D9E75" }}
                >
                  {esperandoPago ? "ESPERANDO PAGO" : c.estado === "en_curso" ? "EN CURSO" : "LISTA PARA ATENDER"}
                </span>
              </div>
              {transcurrido && (
                <span className="text-xs text-gray-400">{transcurrido}</span>
              )}
            </div>

            {/* Patient info */}
            {c.paciente_tabla_id ? (
              <a href={`/medico/paciente/${c.paciente_tabla_id}`} className="mt-4 block text-2xl font-medium text-gray-900 hover:text-[#378ADD]" style={{ fontSize: "28px", lineHeight: "34px" }}>
                {capitalizarNombre(c.paciente_nombre)}
              </a>
            ) : (
              <p className="mt-4 text-2xl font-medium text-gray-900" style={{ fontSize: "28px", lineHeight: "34px" }}>
                {capitalizarNombre(c.paciente_nombre)}
              </p>
            )}
            <p className="mt-1 text-sm text-gray-400">
              {[edad, c.especialidad].filter(Boolean).join(" · ")}
            </p>

            {/* Sintomas */}
            {c.sintomas && c.sintomas.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {c.sintomas.map((s) => (
                  <span
                    key={s}
                    className="rounded-lg bg-gray-50 px-3 py-1.5 text-sm text-gray-500"
                    style={{ border: "0.5px solid #e5e7eb" }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}

            {/* Motivo */}
            {c.motivo_consulta && (
              <p className="mt-3 text-sm text-gray-600">
                {c.motivo_consulta}
              </p>
            )}

            {/* Error */}
            {error?.id === c.id && (
              <p className="mt-3 text-xs text-red-500">{error.msg}</p>
            )}

            {/* La cancelación ya se confirmó pero TODAVÍA no pasó nada: 8 segundos
                para arrepentirse. Ocupa el lugar de las acciones para que no haya
                dos cosas que apretar al mismo tiempo. */}
            {cancelacionEnCurso ? (
              <div
                className="mt-5 flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-center sm:justify-between"
                style={{ backgroundColor: "rgba(226,75,74,0.08)", border: "1px solid #E24B4A" }}
              >
                <p className="text-sm font-medium" style={{ color: "#E24B4A" }}>
                  Cancelando en {porCancelar?.restan}…
                </p>
                <TouchButton
                  onClick={deshacerCancelacion}
                  className="shrink-0 rounded-lg bg-[#378ADD] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2e6fb5] min-h-[44px]"
                >
                  Deshacer
                </TouchButton>
              </div>
            ) : (
            <>
            {/* Lo que está pasando mientras el paciente paga. Antes acá decía
                "Esperando pago del paciente..." en itálica y el único botón de la
                tarjeta era Cancelar. */}
            {esperandoPago && (
              <div
                className="mt-5 rounded-xl p-4 text-left"
                style={{ backgroundColor: "rgba(216,90,48,0.06)", border: "0.5px solid #e5e7eb" }}
              >
                <p className="text-sm font-medium text-gray-800">
                  {desdeAcept < 60
                    ? "Aceptaste la consulta recién. El paciente está completando el pago."
                    : `El paciente está completando el pago (hace ${mmss(desdeAcept)}).`}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Le avisamos por mail y por WhatsApp.{" "}
                  {restanPago > 0
                    ? `Si no paga en ${mmss(restanPago)}, cerramos la consulta y quedás libre — no hace falta que hagas nada.`
                    : "Estamos cerrando la consulta para dejarte libre."}
                </p>
                {!puedeCancelar && (
                  <p className="mt-2 text-xs" style={{ color: "#888780" }}>
                    Podés cancelar a partir de los {MINUTOS_SIN_CANCELAR} minutos.
                  </p>
                )}
              </div>
            )}

            {/* Action */}
            <div className="mt-5 flex flex-col items-end gap-2">
              {esperandoPago ? null : puedeVideo ? (
                c.estado === "en_curso" ? (
                  <TouchButton
                    onClick={() => handleIniciar(c.id)}
                    className="rounded-lg bg-[#378ADD] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#2e6fb5]"
                  >
                    Continuar consulta
                  </TouchButton>
                ) : (
                  <TouchButton
                    onClick={() => handleIniciar(c.id)}
                    className="rounded-lg bg-[#378ADD] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#2e6fb5]"
                  >
                    Iniciar consulta
                  </TouchButton>
                )
              ) : null}

              {/* Cancelar consulta. Escondido durante los primeros minutos de la
                  ventana de pago: era la única acción de la tarjeta y se llevó
                  puestas dos consultas antes de que el paciente pudiera pagar. */}
              {puedeCancelar && (
                <button
                  disabled={cancelando === c.id}
                  onClick={() => setConfirmandoCancelar(c.id)}
                  className="rounded-lg border text-sm font-medium disabled:opacity-50 px-5 py-2.5"
                  style={{ color: "#E24B4A", borderColor: "#E24B4A", background: "transparent", minHeight: "44px", fontSize: "14px" }}
                >
                  {cancelando === c.id ? "Cancelando..." : "Cancelar consulta"}
                </button>
              )}
            </div>
            </>
            )}
          </div>
        );
      })}

      {/* Dialog de confirmación de cancelación — reemplaza window.confirm() que
          Chrome suprime en páginas con iframes cross-origin. */}
      {confirmandoCancelar && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "360px",
              width: "100%",
            }}
          >
            <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#111", marginBottom: "8px" }}>
              Cancelar consulta
            </h3>
            {/* El texto lo fijó Diego (10/09): lo que está en juego es el paciente,
                no el trámite del reembolso. Eso va abajo, en chico. */}
            <p style={{ fontSize: "14px", color: "#666", marginBottom: "8px" }}>
              ¿Estás seguro? El paciente no podrá realizar la consulta.
            </p>
            <p style={{ fontSize: "13px", color: "#888780", marginBottom: "24px" }}>
              Si ya pagó, se le devuelve el 100%. Vas a tener unos segundos para
              arrepentirte antes de que se cancele.
            </p>
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => setConfirmandoCancelar(null)}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: "10px",
                  border: "1px solid #e5e7eb",
                  background: "white",
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                Volver
              </button>
              <button
                onClick={() => iniciarCancelacion(confirmandoCancelar)}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: "10px",
                  border: "1px solid #E24B4A",
                  background: "transparent",
                  color: "#E24B4A",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Cancelar consulta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
