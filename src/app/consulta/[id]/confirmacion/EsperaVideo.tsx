"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import BotonPush from "@/components/BotonPush";
import { articuloMedico, formatNombreMedico } from "@/lib/utils/texto";
import { estadoPagoConsulta } from "@/lib/estado-pago-consulta";

// Boton reutilizable "Volver"
function VolverAlInicio({ returnUrl = "/dashboard" }: { returnUrl?: string }) {
  return (
    <div className="mt-4">
      <Link
        href={returnUrl}
        className="block w-full rounded-xl border border-gray-300 px-6 py-3 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all duration-300"
      >
        {returnUrl.startsWith("/dr/") ? "Volver al consultorio" : "Volver al inicio"}
      </Link>
    </div>
  );
}

export default function EsperaVideo({
  consultaId,
  salaVideoUrlInicial,
  estadoInicial,
  mpStatusInicial = null,
  medicoNombre,
  medicoTitulo,
  especialidad,
  duracionConsulta,
  createdAt,
  returnUrl,
}: {
  consultaId: string;
  salaVideoUrlInicial: string | null;
  estadoInicial?: string;
  mpStatusInicial?: string | null;
  medicoNombre: string;
  /**
   * Título profesional elegido por el médico en su registro (`medicos.titulo`:
   * "Dr." o "Dra."). Sin él el nombre se muestra pelado — mejor eso que decirle
   * "Dr." a una médica, que es lo que pasaba en casi toda la plataforma.
   */
  medicoTitulo?: string | null;
  especialidad: string;
  duracionConsulta: number;
  createdAt: string;
  returnUrl?: string;
}) {
  const returnUrlFinal = returnUrl ?? "/dashboard";
  // `null` cuando la page no pudo traer al médico: el copy de abajo se arma
  // distinto en ese caso, sin inventar "el médico".
  const nombreMedico = medicoNombre ? formatNombreMedico(medicoNombre, medicoTitulo) : null;
  // "" si no sabemos el título → la frase se arma sin artículo en vez de arriesgar
  // un "el" equivocado.
  const articulo = articuloMedico(medicoTitulo);
  const [salaUrl, setSalaUrl] = useState(salaVideoUrlInicial);
  const [estado, setEstado] = useState<string>(estadoInicial ?? "aceptada");
  const [mpStatus, setMpStatus] = useState<string | null>(mpStatusInicial);
  const [minutosEspera, setMinutosEspera] = useState(0);
  const [reintentando, setReintentando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  // Cronómetro de la pantalla "Procesando pago": arranca cuando ESTA vista se
  // muestra (no desde created_at — un pago legítimo con webhook demorado unos
  // segundos no debe ver "no se completó" por culpa de una consulta vieja).
  const [procesandoDesde, setProcesandoDesde] = useState<number | null>(null);
  const [ahora, setAhora] = useState(0);
  const enProcesandoPago =
    !salaUrl &&
    estado !== "cancelada" &&
    estado !== "rechazada" &&
    estado !== "completada" &&
    estado !== "en_curso" &&
    estado !== "pagada";
  useEffect(() => {
    if (enProcesandoPago && procesandoDesde === null) {
      setProcesandoDesde(Date.now());
      setAhora(Date.now());
    }
  }, [enProcesandoPago, procesandoDesde]);
  useEffect(() => {
    if (!enProcesandoPago) return;
    const i = setInterval(() => setAhora(Date.now()), 15000);
    return () => clearInterval(i);
  }, [enProcesandoPago]);

  // Reintentar el pago de una consulta aceptada cuyo checkout quedó a medias
  // (caso de un paciente 04/08: "Procesando pago..." eterno sin ninguna salida).
  //
  // Mismo camino que `pagarConsulta` de la sala de espera, fallback incluido:
  // `crear-v2` devuelve 503 cuando el paciente o el médico es cuenta de test
  // (guard `es_cuenta_test`) y ahí el pago se simula por `/api/pago/simular`.
  // Sin ese fallback este botón fallaba SIEMPRE en cuentas de test —
  // justamente las que se usan para probar esta pantalla— y quedaba en
  // "No pudimos abrir el pago".
  async function reintentarPago() {
    setReintentando(true);
    setErrorAccion(null);
    try {
      const res = await fetch("/api/pago/crear-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tipo: "consulta", id: consultaId }),
      });
      if (res.ok) {
        const data = (await res.json()) as { init_point?: string };
        if (data.init_point) {
          window.location.href = data.init_point;
          return;
        }
      }

      // Pago simulado (cuentas de test). El endpoint se defiende solo: con el
      // cobro real ON responde 404 a cualquiera que no sea cuenta de test.
      const sim = await fetch("/api/pago/simular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ consultaId }),
      });
      if (sim.ok) {
        window.location.href = `/consulta/${consultaId}/info-medica?redirect=/consulta/${consultaId}/confirmacion`;
        return;
      }

      setErrorAccion("No pudimos abrir el pago. Reintentá en unos segundos.");
    } catch {
      setErrorAccion("No pudimos abrir el pago. Revisá tu conexión y reintentá.");
    }
    setReintentando(false);
  }

  async function cancelarSolicitud() {
    setCancelando(true);
    setErrorAccion(null);
    try {
      const res = await fetch("/api/consultas/cancelar-solicitud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ consultaId }),
      });
      const data = (await res.json().catch(() => ({}))) as { estado?: string; error?: string };
      if (res.ok) setEstado(data.estado ?? "cancelada");
      else setErrorAccion(data.error ?? "No se pudo cancelar. Probá de nuevo.");
    } catch {
      setErrorAccion("No se pudo cancelar. Revisá tu conexión y probá de nuevo.");
    }
    setCancelando(false);
  }

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
      if (data.estado) setEstado(data.estado);
      if (data.sala_video_url) setSalaUrl(data.sala_video_url);
      setMpStatus(data.mp_status ?? null);
    } catch {
      // red error — próximo ciclo reintenta
    }
  }, [consultaId]);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [poll]);

  // Timer de espera para estado pagada
  useEffect(() => {
    if (!createdAt) return;

    function calcular() {
      const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
      setMinutosEspera(Math.max(0, mins));
    }

    calcular();
    const interval = setInterval(calcular, 60000);
    return () => clearInterval(interval);
  }, [createdAt]);

  // ---- ESTADO: cancelada / rechazada ----
  // `rechazada` no tenía rama propia y caía al bloque de pago de abajo: a los
  // 3 minutos le ofrecía "Pagar consulta" sobre una consulta que ya estaba
  // muerta, y el botón devolvía 400 (`crear-v2` exige estado `aceptada`).
  if (estado === "cancelada" || estado === "rechazada") {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-red-50">
          <span className="text-4xl" style={{ color: "#E24B4A" }}>X</span>
        </div>
        <h1 className="mt-6 text-2xl font-bold text-gray-900">
          {estado === "rechazada" ? "Esta consulta no se concretó" : "Consulta cancelada"}
        </h1>
        <p className="mt-2 text-gray-600">
          {estado === "rechazada"
            ? nombreMedico
              ? `${nombreMedico} no llegó a tomarla. Si habías pagado, el reintegro se procesa completo.`
              : "Nadie llegó a tomarla. Si habías pagado, el reintegro se procesa completo."
            : "Esta consulta no se concretó. Si habías pagado, el reintegro se procesa completo."}
        </p>

        <InfoCard medicoNombre={nombreMedico} especialidad={especialidad} duracionConsulta={duracionConsulta} />

        <div className="mt-6 rounded-xl border px-6 py-4 text-center" style={{ borderColor: "#E24B4A", background: "rgba(226,75,74,0.06)" }}>
          <span className="text-sm font-medium" style={{ color: "#E24B4A" }}>
            {estado === "rechazada" ? "No concretada" : "Cancelada"}
          </span>
        </div>

        <VolverAlInicio returnUrl={returnUrl} />
      </div>
    );
  }

  // ---- ESTADO: completada (la consulta ya terminó) ----
  // NO tenía rama: una consulta CERRADA caía al bloque de pago de abajo y, con
  // la sala nunca creada, terminaba mostrándole "Falta un paso: pagá tu
  // consulta / todavía no se te cobró nada" a alguien que YA PAGÓ — encima con
  // un botón que devolvía 400. Dos caminos reales llegan acá:
  //  1. `/consulta/[id]/sala` redirige a esta pantalla con CUALQUIER estado
  //     distinto de `en_curso`, o sea cada vez que el paciente vuelve a abrir
  //     la sala después de que la llamada terminó.
  //  2. El médico nunca abrió la videollamada y el cron `cerrar-huerfanas`
  //     cerró la consulta a las 4 h sin que se creara la sala.
  if (estado === "completada") {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[#1D9E75]/10">
          <span className="text-4xl font-bold" style={{ color: "#1D9E75" }}>&#10003;</span>
        </div>

        <h1 className="mt-6 text-2xl font-bold text-gray-900">Consulta finalizada</h1>
        <p className="mt-2 text-gray-600">
          {nombreMedico
            ? `Tu consulta con ${nombreMedico} ya terminó.`
            : "Tu consulta ya terminó."}
        </p>
        {/* Sin promesas: si el cierre lo hizo el sistema puede no haber ningún
            documento, y prometerlo sería otra mentira más de esta pantalla. */}
        <p className="mt-3 text-sm text-gray-500">
          {nombreMedico
            ? `Si ${nombreMedico} te dejó recetas u órdenes, las encontrás en Mis documentos.`
            : "Si te dejaron recetas u órdenes, las encontrás en Mis documentos."}
        </p>

        <InfoCard medicoNombre={nombreMedico} especialidad={especialidad} duracionConsulta={duracionConsulta}>
          <div className="border-t border-gray-100 pt-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Estado</span>
              <span className="font-medium" style={{ color: "#1D9E75" }}>Finalizada</span>
            </div>
          </div>
        </InfoCard>

        <a
          href="/documentos"
          className="mt-6 block w-full rounded-xl bg-[#378ADD] px-6 py-4 text-center text-base font-semibold text-white shadow-sm hover:bg-[#2e6fb5] active:scale-[0.98] transition-all duration-100"
          style={{ minHeight: 56 }}
        >
          Ver mis documentos
        </a>

        <VolverAlInicio returnUrl={returnUrl} />
      </div>
    );
  }

  // ---- ESTADO: esperando (ningún médico la tomó todavía) ----
  // También caía al bloque de pago: a los 3 minutos le pedía pagar una consulta
  // que nadie aceptó (400 asegurado). La pantalla de espera con cola, aviso de
  // demora y cancelación es la sala de espera; acá lo único útil es volver.
  if (estado === "esperando") {
    return (
      <div className="text-center">
        <div
          className="mx-auto flex h-24 w-24 items-center justify-center rounded-full"
          style={{ backgroundColor: "rgba(186,117,23,0.10)" }}
        >
          <span className="text-5xl">⏳</span>
        </div>

        <h1 className="mt-6 text-2xl font-bold text-gray-900">
          Tu consulta está esperando
        </h1>
        <p className="mt-2 text-gray-600">
          Todavía no la aceptó nadie. <strong>No se te cobró nada.</strong>
        </p>

        <InfoCard medicoNombre={nombreMedico} especialidad={especialidad} duracionConsulta={duracionConsulta}>
          <div className="border-t border-gray-100 pt-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Estado</span>
              <span className="font-medium" style={{ color: "#BA7517" }}>Esperando</span>
            </div>
          </div>
        </InfoCard>

        <a
          href={`/sala-espera/${consultaId}`}
          className="mt-6 block w-full rounded-xl bg-[#378ADD] px-6 py-4 text-center text-base font-semibold text-white shadow-sm hover:bg-[#2e6fb5] active:scale-[0.98] transition-all duration-100"
          style={{ minHeight: 56 }}
        >
          Ir a la sala de espera
        </a>

        <VolverAlInicio returnUrl={returnUrl} />
      </div>
    );
  }

  // ---- ESTADO: en_curso (medico ya inicio) ----
  if (estado === "en_curso") {
    return (
      <div className="text-center">
        {/* Icono check verde con pulse */}
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[#1D9E75] animate-[pulse_2s_ease-in-out_infinite]">
          <span className="text-4xl font-bold text-white">&#10003;</span>
        </div>

        <h1 className="mt-6 text-2xl font-bold text-gray-900">
          {nombreMedico ? `¡${nombreMedico} te está esperando!` : "¡Te están esperando!"}
        </h1>
        <p className="mt-2 text-gray-600">
          Tu videollamada ya está lista
        </p>

        <InfoCard medicoNombre={nombreMedico} especialidad={especialidad} duracionConsulta={duracionConsulta}>
          <div className="border-t border-gray-100 pt-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Estado</span>
              <span className="font-medium" style={{ color: "#1D9E75" }}>En curso</span>
            </div>
          </div>
        </InfoCard>

        {/* Boton ENORME */}
        <a
          href={`/consulta/${consultaId}/sala`}
          className="mt-8 block w-full rounded-xl py-4 px-8 text-center text-lg font-semibold text-white shadow-sm transition-all duration-300 active:scale-95 animate-[softPulse_2s_ease-in-out_infinite]"
          style={{ backgroundColor: "#378ADD", minHeight: "44px" }}
        >
          Entrar a la videollamada
        </a>

        {/* Custom keyframes inline */}
        <style>{`
          @keyframes softPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.9; }
          }
        `}</style>
      </div>
    );
  }

  // ---- ESTADO: pagada (esperando al medico) ----
  if (estado === "pagada") {
    return (
      <div className="text-center">
        {/* Check verde (no emoji) */}
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full" style={{ backgroundColor: "#1D9E75" }}>
          <span className="text-4xl font-bold text-white">&#10003;</span>
        </div>

        <h1 className="mt-6 text-2xl font-bold text-gray-900">Pago confirmado!</h1>
        <p className="mt-2 text-gray-600">
          {nombreMedico
            ? `Estás en la sala de espera. ${nombreMedico} te llama en breve.`
            : "Estás en la sala de espera. La videollamada empieza en breve."}
        </p>

        <InfoCard medicoNombre={nombreMedico} especialidad={especialidad} duracionConsulta={duracionConsulta}>
          <div className="border-t border-gray-100 pt-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Estado</span>
              <span className="font-medium" style={{ color: "#1D9E75" }}>Pagada</span>
            </div>
          </div>
        </InfoCard>

        {/* Bloque estado espera */}
        <div
          className="mt-6 rounded-xl border px-6 py-5"
          style={{ borderColor: "#1D9E75", background: "#E1F5EE" }}
        >
          <div className="flex items-center justify-center gap-3">
            {/* Spinner CSS */}
            <svg className="h-5 w-5 animate-spin" style={{ color: "#1D9E75" }} viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <p className="text-sm font-medium" style={{ color: "#1D9E75" }}>
              Tiempo de espera: {minutosEspera} min
            </p>
          </div>
        </div>

        {/* Info block estudios */}
        <div
          className="mt-6 rounded-xl border border-[#378ADD]/30 bg-[#378ADD]/5 px-5 py-4 text-left"
        >
          <p className="text-sm font-medium text-gray-900">
            ¿Tenés estudios para mostrar en la consulta?
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Podés subirlos cuando estés en la sala de espera antes de tu consulta.
          </p>
        </div>

        <BotonPush rol="paciente" variante="popup" />

        <VolverAlInicio returnUrl={returnUrl} />
      </div>
    );
  }

  // ---- ESTADO: aceptada (el médico aceptó, falta el pago) ----
  // Mismo defecto que en la sala de espera (caso 07/08): esta pantalla mostraba
  // "Procesando pago…" con spinner aunque no hubiera ningún pago en curso, o sea
  // le pedía esperar a quien tenía que actuar.
  //
  // Tres situaciones distintas, tres pantallas distintas:
  //  1. MP tiene el pago pero no lo acreditó (cupón / revisión / autorizado):
  //     esperar es correcto y pedir otro pago sería cobrarle dos veces.
  //  2. MP lo rechazó: lo sabemos ya, no hay nada que esperar.
  //  3. Ni noticias: se mantiene la ventana de gracia de 3 min por si el webhook
  //     está por llegar (protege contra el pago duplicado); pasada la gracia, la
  //     pantalla pide el pago con todas las letras.
  const situacionPago = estadoPagoConsulta(estado, mpStatus);
  const pagoConfirmado = situacionPago === "confirmado";
  const pagoEnCamino = situacionPago === "en_camino";
  const pagoRechazado = !pagoConfirmado && (mpStatus === "rejected" || mpStatus === "cancelled");
  const graciaVencida =
    procesandoDesde !== null && ahora - procesandoDesde >= 3 * 60 * 1000;
  // Pedir el pago SOLO si de verdad falta pagar. Dos candados, los dos
  // imprescindibles:
  //  - `!pagoConfirmado`: el guard nuevo se calculaba y NO se usaba, así que a
  //    una consulta con `mp_status='approved'` (pagada con plata real) esta
  //    pantalla igual le decía "Falta un paso: pagá tu consulta / todavía no se
  //    te cobró nada". Mentir sobre la plata es peor que el bug original.
  //  - `estado === "aceptada"`: es el único estado que `crear-v2` acepta
  //    (`obtenerConsulta` devuelve 400 en cualquier otro), así que ofrecer el
  //    botón fuera de ahí es un callejón sin salida garantizado.
  const faltaPagar =
    !pagoConfirmado &&
    !pagoEnCamino &&
    estado === "aceptada" &&
    (pagoRechazado || graciaVencida);

  return (
    <div className="text-center">
      <div
        className="mx-auto flex h-24 w-24 items-center justify-center rounded-full"
        style={{
          backgroundColor: pagoConfirmado ? "rgba(29,158,117,0.10)" : "rgba(186,117,23,0.10)",
        }}
      >
        {pagoConfirmado ? (
          <span className="text-4xl font-bold" style={{ color: "#1D9E75" }}>&#10003;</span>
        ) : (
          <span className="text-5xl">{faltaPagar ? "💳" : "⏳"}</span>
        )}
      </div>
      <h1 className="mt-6 text-2xl font-bold text-gray-900">
        {faltaPagar
          ? "Falta un paso: pagá tu consulta"
          : pagoConfirmado
            ? "Pago confirmado"
            : pagoEnCamino
              ? "Estamos confirmando tu pago"
              : "Procesando pago..."}
      </h1>
      <p className="mt-2 text-gray-600">
        {faltaPagar
          ? nombreMedico
            ? `${nombreMedico} ya aceptó tu consulta y te atiende apenas se registre el pago. Todavía no se te cobró nada.`
            : "Tu consulta ya fue aceptada: te atienden apenas se registre el pago. Todavía no se te cobró nada."
          : pagoConfirmado
            ? nombreMedico
              ? `Tu pago está acreditado. ${nombreMedico} inicia la videollamada en un momento.`
              : "Tu pago está acreditado. La videollamada empieza en un momento."
            : pagoEnCamino
              ? `Mercado Pago todavía no acreditó el pago. No hace falta que pagues de nuevo — apenas se acredite, ${nombreMedico ? `${nombreMedico} te atiende` : "te atienden"}.`
              : "Estamos verificando tu pago con Mercado Pago"}
      </p>

      {/* Con el pago pendiente, el botón es lo primero y lo más grande. */}
      {faltaPagar && (
        <button
          onClick={reintentarPago}
          disabled={reintentando || cancelando}
          className="mt-6 w-full rounded-xl bg-[#378ADD] px-6 py-4 text-base font-semibold text-white shadow-sm hover:bg-[#2e6fb5] active:scale-[0.98] transition-all duration-100 disabled:opacity-50"
          style={{ minHeight: 56 }}
        >
          {reintentando ? "Abriendo el pago..." : "Pagar consulta"}
        </button>
      )}

      <InfoCard medicoNombre={nombreMedico} especialidad={especialidad} duracionConsulta={duracionConsulta}>
        <div className="border-t border-gray-100 pt-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Estado</span>
            <span
              className="font-medium"
              style={{ color: pagoConfirmado ? "#1D9E75" : "#BA7517" }}
            >
              {faltaPagar
                ? "Falta pagar"
                : pagoConfirmado
                  ? "Pagada"
                  : pagoEnCamino
                    ? "Pago en camino"
                    : "Pendiente"}
            </span>
          </div>
        </div>
      </InfoCard>

      {faltaPagar ? (
        <div className="mt-6 space-y-3">
          <button
            onClick={cancelarSolicitud}
            disabled={reintentando || cancelando}
            className="w-full rounded-xl px-6 py-3 text-sm font-semibold disabled:opacity-50"
            style={{ border: "1.5px solid #E24B4A", color: "#E24B4A", background: "transparent" }}
          >
            {cancelando ? "Cancelando..." : "Cancelar solicitud (sin cargo)"}
          </button>
          {errorAccion && (
            <p className="text-sm font-medium" style={{ color: "#E24B4A" }}>
              {errorAccion}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50 px-6 py-4">
          <div className="flex items-center justify-center gap-2">
            <svg className="h-4 w-4 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <p className="text-sm text-gray-500">
              {pagoConfirmado
                ? nombreMedico
                  // `articulo` sale vacío si no sabemos el título: la frase queda
                  // "Esperando que Ana García inicie…", correcta y sin género inventado.
                  ? `Esperando que ${articulo ? `${articulo} ` : ""}${nombreMedico} inicie la videollamada...`
                  : "Esperando el inicio de la videollamada..."
                : "Esperando confirmación de pago..."}
            </p>
          </div>
        </div>
      )}

      <VolverAlInicio returnUrl={returnUrl} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// InfoCard reutilizable
// ---------------------------------------------------------------------------

function InfoCard({
  medicoNombre,
  especialidad,
  duracionConsulta,
  children,
}: {
  /** Ya viene formateado con el título del médico (o `null` si no lo trajimos). */
  medicoNombre: string | null;
  especialidad: string;
  duracionConsulta: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="space-y-3">
        {medicoNombre && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Medico</span>
            <span className="font-medium text-gray-900">{medicoNombre}</span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Especialidad</span>
          <span className="font-medium text-gray-900">{especialidad}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Duracion</span>
          <span className="font-medium text-gray-900">{duracionConsulta} min</span>
        </div>
        {children}
      </div>
    </div>
  );
}
