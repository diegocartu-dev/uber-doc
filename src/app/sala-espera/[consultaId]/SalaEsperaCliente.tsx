"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { soundConsultaAceptada, soundVideoLista, unlockAudio } from "@/lib/sounds";
import { Video, CheckCircle, CreditCard } from "lucide-react";
import EstudiosPaciente from "@/components/EstudiosPaciente";
import { formatNombreMedico } from "@/lib/utils/texto";
import { estadoPagoConsulta } from "@/lib/estado-pago-consulta";

const POLL_INTERVAL = 5000;

type Props = {
  consultaId: string;
  estado: string;
  mpStatus?: string | null;
  medicoNombre: string;
  precio: number;
  duracion: number;
  especialidad: string;
  posicion: number;
  tiempoEstimado: number;
  createdAt: string;
  /** "error" | "pendiente" — lo devuelve Mercado Pago en back_urls cuando el checkout no salió bien. */
  resultadoPago?: string | null;
  isDev?: boolean;
};

// A los 10 minutos sin aceptación se le dice al paciente la verdad (caso Lucas
// 04/08: esperó más de una hora sin ninguna señal ni forma de salir).
const MINUTOS_AVISO_DEMORA = 10;

function formatPrecio(precio: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(precio);
}

export default function SalaEsperaCliente({
  consultaId,
  estado: estadoInicial,
  mpStatus: mpStatusInicial = null,
  medicoNombre,
  precio,
  duracion,
  especialidad,
  posicion: posicionInicial,
  tiempoEstimado: tiempoInicial,
  createdAt,
  resultadoPago = null,
  isDev = false,
}: Props) {
  const [estado, setEstado] = useState(estadoInicial);
  const [mpStatus, setMpStatus] = useState<string | null>(mpStatusInicial);
  const [posicion, setPosicion] = useState(posicionInicial);
  const [tiempoEstimado, setTiempoEstimado] = useState(tiempoInicial);
  const [pagando, setPagando] = useState(false);
  const [errorPago, setErrorPago] = useState<string | null>(null);
  const [salaVideoUrl, setSalaVideoUrl] = useState<string | null>(null);
  const [minutosEspera, setMinutosEspera] = useState(0);
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [errorCancelar, setErrorCancelar] = useState<string | null>(null);
  const prevEstadoRef = useRef(estadoInicial);
  const salaVideoUrlRef = useRef<string | null>(null);

  // Desbloquear audio al primer gesto del usuario (iOS/Android requieren
  // interacción antes de reproducir sonido). Sin esto, soundConsultaAceptada
  // y soundVideoLista no suenan en mobile.
  useEffect(() => {
    const handler = () => unlockAudio();
    document.addEventListener("pointerdown", handler, { once: true });
    document.addEventListener("touchstart", handler, { once: true });
    // Intento inmediato por si ya hubo interacción previa en la página
    unlockAudio();
    return () => {
      document.removeEventListener("pointerdown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, []);

  // Polling: 5s interval contra /api/consulta-estado
  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/consulta-estado?consultaId=${consultaId}`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = await res.json() as {
        estado: string;
        sala_video_url: string | null;
        mp_status?: string | null;
      };

      if (
        (data.estado === "aceptada" || data.estado === "pagada" || data.estado === "en_curso") &&
        prevEstadoRef.current === "esperando"
      ) {
        soundConsultaAceptada();
        setPosicion(0);
        setTiempoEstimado(0);
      }
      if (data.sala_video_url && !salaVideoUrlRef.current) {
        soundVideoLista();
      }
      prevEstadoRef.current = data.estado;
      setEstado(data.estado);
      setMpStatus(data.mp_status ?? null);
      if (data.sala_video_url) {
        salaVideoUrlRef.current = data.sala_video_url;
        setSalaVideoUrl(data.sala_video_url);
      }
    } catch {
      // red error — próximo ciclo reintenta
    }
  }, [consultaId]);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [poll]);

  // Minutos desde la solicitud — para avisar la demora sin aceptación.
  useEffect(() => {
    if (!createdAt) return;
    const calcular = () =>
      setMinutosEspera(Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)));
    calcular();
    const interval = setInterval(calcular, 30000);
    return () => clearInterval(interval);
  }, [createdAt]);

  async function cancelarSolicitud() {
    setCancelando(true);
    setErrorCancelar(null);
    try {
      const res = await fetch("/api/consultas/cancelar-solicitud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ consultaId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setEstado((data as { estado?: string }).estado ?? "cancelada");
      } else {
        setErrorCancelar((data as { error?: string }).error ?? "No se pudo cancelar. Probá de nuevo.");
      }
    } catch {
      setErrorCancelar("No se pudo cancelar. Revisá tu conexión y probá de nuevo.");
    }
    setCancelando(false);
    setConfirmandoCancelar(false);
  }

  // Pago real (crear-v2) con fallback a simulación para cuentas de test.
  async function pagarConsulta() {
    setPagando(true);
    setErrorPago(null);
    try {
      // Intentar pago real con Mercado Pago
      const mpRes = await fetch("/api/pago/crear-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tipo: "consulta", id: consultaId }),
      });

      if (mpRes.ok) {
        const mpData = await mpRes.json();
        if (mpData.init_point) {
          // Redirigir al checkout de Mercado Pago
          window.location.href = mpData.init_point;
          return;
        }
      }

      // Si pago marketplace no está habilitado (503) o falla, intentar simulación
      const simRes = await fetch("/api/pago/simular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ consultaId }),
      });
      if (simRes.ok) {
        window.location.href = `/consulta/${consultaId}/info-medica?redirect=/consulta/${consultaId}/confirmacion`;
        return;
      }

      // Ambos fallaron — avisar SIEMPRE (antes fallaba en silencio y el
      // paciente no sabía si pagó o no)
      setErrorPago("No pudimos procesar el pago. Reintentá en unos segundos — si sigue fallando, escribinos a soporte@docto.com.ar.");
      setPagando(false);
    } catch {
      setErrorPago("No pudimos procesar el pago. Revisá tu conexión y reintentá.");
      setPagando(false);
    }
  }

  // El médico ya tomó la consulta (cualquiera sea la situación del pago): sirve
  // para dejar de mostrar la cola y el aviso de demora.
  const medicoAcepto = estado === "aceptada" || estado === "pagada" || estado === "en_curso";

  // Situación del pago. ANTES esto no existía: una única variable `aceptada`
  // mezclaba "aceptada sin pagar" con "pagada" y "en_curso", y por eso la
  // pantalla le decía al paciente que esperara al médico cuando en realidad el
  // sistema lo estaba esperando a él (caso real 07/08: veinte minutos parado
  // ahí, con tres intentos de pago).
  const pago = estadoPagoConsulta(estado, mpStatus);
  const faltaPagar = medicoAcepto && !salaVideoUrl && pago === "falta_pagar";
  const pagoEnCamino = medicoAcepto && !salaVideoUrl && pago === "en_camino";
  const pagoConfirmado = medicoAcepto && pago === "confirmado";

  // La solicitud murió (la canceló el paciente, el sistema o el médico no la tomó):
  // decirlo con todas las letras — antes esta pantalla seguía mostrando el spinner
  // de "sala de espera" para siempre (caso Lucas 04/08, esperó más de una hora).
  if ((estado === "cancelada" || estado === "rechazada") && !salaVideoUrl) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-orange-50">
          <span className="text-5xl">🕐</span>
        </div>
        <h1 className="mt-6 text-xl font-bold text-gray-900">
          Esta consulta no pudo concretarse
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          El médico no llegó a tomar tu consulta esta vez. <strong>No se te cobró nada.</strong>
        </p>
        <a
          href="/clinica"
          className="mt-6 block w-full rounded-xl bg-[#378ADD] px-6 py-3 text-center text-sm font-semibold text-white shadow-sm hover:bg-[#2e6fb5] active:scale-[0.97] transition-all duration-100"
        >
          Buscar otro médico
        </a>
      </div>
    );
  }

  return (
    <div className="text-center">
      {/* Ícono de estado. En "falta pagar" NO va spinner ni check verde: ambos
          le dicen al paciente "quedate quieto", que es justo lo contrario. */}
      <div
        className="mx-auto flex h-24 w-24 items-center justify-center rounded-full"
        style={{
          backgroundColor: faltaPagar ? "rgba(186,117,23,0.10)" : "var(--color-primary-soft)",
        }}
      >
        {salaVideoUrl ? (
          <Video size={40} strokeWidth={1.75} style={{ color: "var(--color-info)" }} />
        ) : faltaPagar ? (
          <CreditCard size={40} strokeWidth={1.75} style={{ color: "#BA7517" }} />
        ) : pagoConfirmado ? (
          <CheckCircle size={40} strokeWidth={1.75} style={{ color: "var(--color-success)" }} />
        ) : (
          <svg
            className="h-12 w-12 animate-spin"
            style={{ color: "var(--color-primary)" }}
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
        )}
      </div>

      <h1 className="mt-6 text-xl font-bold text-gray-900">
        {salaVideoUrl
          ? "¡El médico inició la videollamada!"
          : faltaPagar
            ? "Falta un paso: pagá tu consulta"
            : pagoEnCamino
              ? "Estamos confirmando tu pago"
              : pagoConfirmado
                ? "¡El médico aceptó tu consulta!"
                : "Estás en la sala de espera"}
      </h1>

      <p className="mt-2 text-sm text-gray-600">
        {salaVideoUrl
          ? "Ya podés unirte a la consulta"
          : faltaPagar
            ? `${formatNombreMedico(medicoNombre)} ya aceptó tu consulta y te atiende apenas se registre el pago.`
            : pagoEnCamino
              ? "Mercado Pago todavía no nos confirmó el pago. No hace falta que pagues de nuevo."
              : pagoConfirmado
                ? "Esperando que el médico inicie la videollamada..."
                : `Esperando que el ${formatNombreMedico(medicoNombre)} acepte tu consulta...`}
      </p>

      {/* EL botón de la pantalla cuando falta pagar: grande, arriba, azul.
          Antes vivía al final, chiquito y debajo del texto que pedía esperar. */}
      {faltaPagar && (
        <>
          {resultadoPago === "error" && (
            <div
              className="mt-6 rounded-xl p-4 text-left text-sm"
              style={{ backgroundColor: "rgba(186,117,23,0.08)", color: "#BA7517" }}
            >
              <p className="font-semibold">El pago anterior no se completó.</p>
              <p className="mt-1">No se te cobró nada. Podés intentarlo de nuevo acá abajo.</p>
            </div>
          )}
          <button
            disabled={pagando}
            onClick={pagarConsulta}
            className="mt-6 w-full rounded-xl bg-[#378ADD] px-6 py-4 text-base font-semibold text-white shadow-sm hover:bg-[#2e6fb5] active:scale-[0.98] transition-all duration-100 disabled:opacity-50"
            style={{ minHeight: 56 }}
          >
            {pagando ? "Abriendo el pago..." : `Pagar consulta · ${formatPrecio(precio)}`}
          </button>
          {errorPago && (
            <p className="mt-3 text-sm font-medium" style={{ color: "#E24B4A" }}>
              {errorPago}
            </p>
          )}
          <p className="mt-2 text-xs text-gray-500">
            Pago seguro con Mercado Pago. Hasta que no pagues, la consulta no arranca.
          </p>
        </>
      )}

      {/* Info card */}
      <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6 text-left shadow-sm">
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Médico</span>
            <span className="font-medium text-gray-900">{medicoNombre}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Precio</span>
            <span className="font-medium text-gray-900">
              {formatPrecio(precio)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Duración</span>
            <span className="font-medium text-gray-900">{duracion} min</span>
          </div>

          <div className="border-t border-gray-100 pt-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Estado</span>
              <span
                className={`font-medium ${
                  salaVideoUrl
                    ? "text-[#378ADD]"
                    : pagoConfirmado
                      ? "text-[#1D9E75]"
                      : "text-[#BA7517]"
                }`}
              >
                {salaVideoUrl
                  ? "Videollamada lista"
                  : faltaPagar
                    ? "Falta pagar"
                    : pagoEnCamino
                      ? "Pago en camino"
                      : pagoConfirmado
                        ? "Aceptada y pagada"
                        : "Esperando"}
              </span>
            </div>
          </div>

          {/* La cola y el tiempo estimado solo tienen sentido mientras el médico
              no aceptó. Con la consulta aceptada y sin pagar, lo único que
              importa es el pago. */}
          {!medicoAcepto && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Posición en la cola</span>
                <span className="font-medium text-gray-900">{posicion}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Tiempo estimado</span>
                <span className="font-medium text-gray-900">
                  ~{tiempoEstimado} min
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Botón para unirse a la videollamada — pasa por info-medica primero */}
      {salaVideoUrl && (
        <a
          href={`/consulta/${consultaId}/info-medica?redirect=/consulta/${consultaId}/confirmacion`}
          className="mt-6 block w-full rounded-[var(--radius-lg)] px-6 py-3 text-center text-sm font-semibold text-white shadow-sm active:scale-[0.97] transition-all duration-100"
          style={{ backgroundColor: "var(--color-primary)" }}
        >
          Unirse a la videollamada
        </a>
      )}

      {/* Estudios del paciente — solo después de que el médico acepte */}
      {medicoAcepto && <EstudiosPaciente consultaId={consultaId} />}

      {/* Aviso de demora: a los 10 min sin aceptación, decir la verdad y dar salida */}
      {!medicoAcepto && minutosEspera >= MINUTOS_AVISO_DEMORA && (
        <div
          className="mt-6 rounded-xl p-4 text-left text-sm"
          style={{ backgroundColor: "rgba(186,117,23,0.08)", color: "#BA7517" }}
        >
          <p className="font-semibold">El médico todavía no aceptó tu consulta.</p>
          <p className="mt-1">
            Podés seguir esperando, cancelar sin cargo, o{" "}
            <a href="/clinica" className="font-semibold underline">
              buscar otro médico disponible
            </a>
            . No se te cobra nada hasta que el médico acepte y pagues.
          </p>
        </div>
      )}

      {/* Cancelar solicitud — disponible mientras no haya pago ni videollamada.
          Confirmación inline (NUNCA window.confirm — Chrome lo suprime). */}
      {!salaVideoUrl && estado !== "pagada" && estado !== "en_curso" && (
        <div className="mt-5">
          {confirmandoCancelar ? (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-sm font-medium text-gray-800">
                ¿Cancelar la solicitud? No se te cobró nada.
              </p>
              <div className="mt-3 flex gap-3">
                <button
                  onClick={() => setConfirmandoCancelar(false)}
                  disabled={cancelando}
                  className="flex-1 rounded-xl bg-[#378ADD] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#2e6fb5] disabled:opacity-50"
                >
                  Seguir esperando
                </button>
                <button
                  onClick={cancelarSolicitud}
                  disabled={cancelando}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                  style={{ border: "1.5px solid #E24B4A", color: "#E24B4A", background: "transparent" }}
                >
                  {cancelando ? "Cancelando..." : "Sí, cancelar"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmandoCancelar(true)}
              className="text-sm font-medium underline"
              style={{ color: "#888780" }}
            >
              Cancelar solicitud
            </button>
          )}
          {errorCancelar && (
            <p className="mt-2 text-sm font-medium" style={{ color: "#E24B4A" }}>
              {errorCancelar}
            </p>
          )}
        </div>
      )}

      {/* "No cierres esta pestaña" es un mensaje de espera: no va cuando lo que
          hace falta es que el paciente actúe. */}
      {!faltaPagar && (
        <p className="mt-6 text-xs text-gray-400">
          No cierres esta pestaña
        </p>
      )}
    </div>
  );
}
