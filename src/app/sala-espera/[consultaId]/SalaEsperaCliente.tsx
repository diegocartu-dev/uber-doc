"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { soundConsultaAceptada, soundVideoLista, unlockAudio } from "@/lib/sounds";
import { Video, CheckCircle, CreditCard } from "lucide-react";
import EstudiosPaciente from "@/components/EstudiosPaciente";
import { articuloMedico, formatNombreMedico } from "@/lib/utils/texto";
import { estadoPagoConsulta } from "@/lib/estado-pago-consulta";
import MenuAlternativas from "@/components/rescate/MenuAlternativas";

const POLL_INTERVAL = 5000;

type Props = {
  consultaId: string;
  estado: string;
  mpStatus?: string | null;
  medicoNombre: string;
  /**
   * Título profesional elegido por el médico en su registro (`medicos.titulo`:
   * "Dr." o "Dra."). Componente cliente → tiene que viajar como prop. Si no
   * llega, el nombre va pelado en vez de arriesgar el género equivocado.
   */
  medicoTitulo?: string | null;
  precio: number;
  duracion: number;
  especialidad: string;
  posicion: number;
  tiempoEstimado: number;
  createdAt: string;
  /**
   * "error" | "pendiente" — lo devuelve Mercado Pago en back_urls.
   * "error": el checkout falló y no se cobró nada.
   * "pendiente": el pago existe pero no está acreditado (cupón, revisión).
   */
  resultadoPago?: string | null;
  isDev?: boolean;
};

// A los 10 minutos sin aceptación se le dice al paciente la verdad (caso de un
// paciente 04/08: esperó más de una hora sin ninguna señal ni forma de salir).
// El plazo REAL de la solicitud sin aceptar. Tiene que coincidir con
// PLAZO_SIN_ACEPTAR_MIN (src/lib/consultas/sin-respuesta.ts, con test que lo
// fija en 10): es el número que esta pantalla le PROMETE al paciente. No se
// importa de ahí porque ese módulo arrastra dependencias de servidor y esto es
// un client component.
const MINUTOS_PLAZO_ACEPTAR = 10;

// Cuánto le creemos al `?pago=pendiente` de Mercado Pago mientras el webhook no
// escribe `mp_status`. Acotado a propósito: si MP no confirma nada en ese rato,
// volvemos a ofrecer el pago en vez de dejar al paciente sin ninguna salida.
const MS_CONFIANZA_PAGO_PENDIENTE = 3 * 60 * 1000;

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
  medicoTitulo,
  precio,
  duracion,
  especialidad,
  posicion: posicionInicial,
  tiempoEstimado: tiempoInicial,
  // `createdAt` sigue en Props (lo pasa el server) pero ya no se destructura:
  // alimentaba el reloj del banner del minuto 10, que murió con el contrato fijo.
  resultadoPago = null,
  isDev = false,
}: Props) {
  // Nombre con el título que eligió el médico, calculado una sola vez: esta
  // pantalla lo nombra en seis estados distintos.
  const nombreMedico = formatNombreMedico(medicoNombre, medicoTitulo);
  // "" si no sabemos el título → la frase se arma sin artículo.
  const articulo = articuloMedico(medicoTitulo);

  const [estado, setEstado] = useState(estadoInicial);
  const [mpStatus, setMpStatus] = useState<string | null>(mpStatusInicial);
  const [posicion, setPosicion] = useState(posicionInicial);
  const [tiempoEstimado, setTiempoEstimado] = useState(tiempoInicial);
  const [pagando, setPagando] = useState(false);
  const [errorPago, setErrorPago] = useState<string | null>(null);
  const [salaVideoUrl, setSalaVideoUrl] = useState<string | null>(null);
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [errorCancelar, setErrorCancelar] = useState<string | null>(null);
  const prevEstadoRef = useRef(estadoInicial);
  const salaVideoUrlRef = useRef<string | null>(null);

  // `?pago=pendiente` lo devuelve Mercado Pago (back_url `redirectPending` de
  // crear-v2) cuando el pago EXISTE pero todavía no está acreditado: cupón de
  // Rapipago / Pago Fácil, pago en revisión, tarjeta autorizada sin capturar.
  // Se recibía, se tipaba… y se tiraba: hasta que el webhook escribiera
  // `mp_status` la pantalla clasificaba la consulta como "falta pagar" y le
  // ofrecía el botón grande de pagar — o sea, riesgo de pago DOBLE, justo lo
  // que esta pantalla vino a evitar. Es la única señal que tenemos antes del
  // webhook, así que le creemos, pero por un rato acotado.
  const [confiarEnPagoPendienteUrl, setConfiarEnPagoPendienteUrl] = useState(
    resultadoPago === "pendiente"
  );
  useEffect(() => {
    if (!confiarEnPagoPendienteUrl) return;
    const t = setTimeout(() => setConfiarEnPagoPendienteUrl(false), MS_CONFIANZA_PAGO_PENDIENTE);
    return () => clearTimeout(t);
  }, [confiarEnPagoPendienteUrl]);

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
  const pagoSegunDb = estadoPagoConsulta(estado, mpStatus);
  // Si la DB todavía no sabe NADA del pago (`mp_status` null) pero MP nos mandó
  // de vuelta con `?pago=pendiente`, mandamos la señal de MP: esperar es lo
  // correcto y volver a pedir el pago sería pedirle que pague dos veces. Se
  // autocorrige solo: apenas el poll (5 s) trae un `mp_status`, manda la DB.
  const pago =
    pagoSegunDb === "falta_pagar" && mpStatus == null && confiarEnPagoPendienteUrl
      ? "en_camino"
      : pagoSegunDb;
  const faltaPagar = medicoAcepto && !salaVideoUrl && pago === "falta_pagar";
  const pagoEnCamino = medicoAcepto && !salaVideoUrl && pago === "en_camino";
  const pagoConfirmado = medicoAcepto && pago === "confirmado";

  // ── Venció el plazo de 30 minutos (cron resolver-consultas-vencidas) ───────
  // El profesional no entró: la plata vuelve entera y el paciente queda libre.
  // Lo importante es que las dos cosas se digan JUNTAS — "te devolvemos todo" y
  // "podés elegir otro" —: sin la segunda, el paciente se queda mirando una
  // pantalla que le informa una pérdida y no le ofrece salida.
  if (estado === "medico_ausente") {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[#1D9E75]/10">
          <span className="text-5xl">💚</span>
        </div>
        <h1 className="mt-6 text-xl font-bold text-gray-900">Te devolvemos el 100%</h1>
        <p className="mt-2 text-sm text-gray-600">
          {nombreMedico ? `${nombreMedico} no llegó` : "El profesional no llegó"} a tomar tu consulta
          dentro de los 30 minutos. <strong>Ya iniciamos la devolución total</strong> del importe al
          mismo medio con el que pagaste.
        </p>
        {/* El menú de rescate: A QUIÉN puede elegir, con nombres — no un link
            frío a la clínica. En los casos históricos, la mitad de las veces
            había alguien de la misma jurisdicción online y no se lo mostramos. */}
        <MenuAlternativas consultaId={consultaId} />
      </div>
    );
  }

  // El paciente no llegó a entrar. Se dice el HECHO que el sistema puede probar
  // —no registramos tu ingreso— y no una acusación, con la regla, la salida y el
  // recurso. Mismo criterio que el aviso de turnos (gate Sofía).
  if (estado === "no_show_paciente") {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-orange-50">
          <span className="text-5xl">🕐</span>
        </div>
        <h1 className="mt-6 text-xl font-bold text-gray-900">Tu consulta venció</h1>
        <p className="mt-2 text-sm text-gray-600">
          Pasaron 30 minutos sin que registráramos tu ingreso a la consulta. Las consultas que no se
          usan <strong>no tienen reintegro</strong>.
        </p>
        <p className="mt-2 text-sm text-gray-600">
          Podés pedir una nueva cuando quieras. Si creés que hubo un error, escribinos a{" "}
          <a href="mailto:soporte@docto.com.ar" className="text-[#378ADD] underline">
            soporte@docto.com.ar
          </a>
          .
        </p>
        <a
          href="/clinica"
          className="mt-6 block w-full rounded-xl bg-[#378ADD] px-6 py-3 text-center text-sm font-semibold text-white shadow-sm hover:bg-[#2e6fb5] active:scale-[0.97] transition-all duration-100"
        >
          Pedir una nueva consulta
        </a>
      </div>
    );
  }

  // La solicitud murió (la canceló el paciente, el sistema o el médico no la tomó):
  // decirlo con todas las letras — antes esta pantalla seguía mostrando el spinner
  // de "sala de espera" para siempre (caso 04/08: un paciente esperó más de una hora).
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
          {nombreMedico ? `${nombreMedico} no llegó` : "No llegaron"} a tomar tu consulta esta vez.{" "}
          <strong>No se te cobró nada.</strong>
        </p>
        <MenuAlternativas consultaId={consultaId} />
      </div>
    );
  }

  // La consulta YA TERMINÓ. Sin esta rama, `completada` no matcheaba ninguna
  // condición (`medicoAcepto` no la incluye) y esta pantalla mostraba spinner +
  // "Esperando que el médico acepte tu consulta..." + posición en la cola +
  // "No cierres esta pestaña" sobre una consulta cerrada. Se llega apretando
  // "atrás" al terminar, o desde el historial del navegador.
  if (estado === "completada") {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[#1D9E75]/10">
          <CheckCircle size={40} strokeWidth={1.75} style={{ color: "#1D9E75" }} />
        </div>
        <h1 className="mt-6 text-xl font-bold text-gray-900">Consulta finalizada</h1>
        <p className="mt-2 text-sm text-gray-600">
          Tu consulta con {nombreMedico} ya terminó.
        </p>
        {/* Sin prometer documentos: si la cerró el sistema puede no haber ninguno. */}
        <p className="mt-3 text-xs text-gray-500">
          Si {nombreMedico} te dejó recetas u órdenes, las encontrás en Mis documentos.
        </p>
        <a
          href="/documentos"
          className="mt-6 block w-full rounded-xl bg-[#378ADD] px-6 py-3 text-center text-sm font-semibold text-white shadow-sm hover:bg-[#2e6fb5] active:scale-[0.97] transition-all duration-100"
        >
          Ver mis documentos
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
          ? "¡Ya empezó la videollamada!"
          : faltaPagar
            ? "Falta un paso: pagá tu consulta"
            : pagoEnCamino
              ? "Estamos confirmando tu pago"
              : pagoConfirmado
                ? `¡${nombreMedico} aceptó tu consulta!`
                : "Estás en la sala de espera"}
      </h1>

      <p className="mt-2 text-sm text-gray-600">
        {salaVideoUrl
          ? "Ya podés unirte a la consulta"
          : faltaPagar
            ? `${nombreMedico} ya aceptó tu consulta y te atiende apenas se registre el pago.`
            : pagoEnCamino
              ? "Mercado Pago todavía no nos confirmó el pago. No hace falta que pagues de nuevo."
              : pagoConfirmado
                // `articulo` sale vacío si no sabemos el título: queda "Esperando
                // que Ana García inicie…", correcto y sin género inventado. Antes
                // acá había un "el" fijo delante del nombre.
                ? `Esperando que ${articulo ? `${articulo} ` : ""}${nombreMedico} inicie la videollamada...`
                : `Esperando que ${articulo ? `${articulo} ` : ""}${nombreMedico} acepte tu consulta...`}
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
            <span className="font-medium text-gray-900">{nombreMedico}</span>
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

      {/* El CONTRATO de la espera, visible desde el minuto uno: la espera tiene
          techo y el desenlace es conocido. Reemplaza al banner que aparecía al
          minuto 10 — el MISMO minuto en que el cron cancela la solicitud
          (PLAZO_SIN_ACEPTAR_MIN): el paciente esperaba a ciegas y el aviso
          nacía muerto. Una espera con tope conocido se tolera; una sin tope
          termina en mail a soporte (caso 30/08). */}
      {!medicoAcepto && (
        <p className="mt-6 text-center text-[13px] leading-relaxed" style={{ color: "#888780" }}>
          Si {nombreMedico} no acepta tu consulta en {MINUTOS_PLAZO_ACEPTAR} minutos, la
          cancelamos sin cargo y te ayudamos a elegir otro profesional. No se te
          cobra nada hasta que acepten y pagues.
        </p>
      )}

      {/* Mismo contrato para la etapa PAGA: si el profesional no inicia, el
          plazo de 30 min (PLAZO_CI_MIN, resolver-vencidas) devuelve el 100%
          solo. La paciente del 30/08 no lo sabía y escribió a soporte con el
          reembolso ya hecho. */}
      {medicoAcepto && !salaVideoUrl && (estado === "pagada" || estado === "en_curso") && (
        <p className="mt-6 text-center text-[13px] leading-relaxed" style={{ color: "#888780" }}>
          Si {nombreMedico} no inicia tu consulta dentro de los 30 minutos del pago,
          la cancelamos y te devolvemos el 100% — sin que tengas que hacer nada.
        </p>
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
