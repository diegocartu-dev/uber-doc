"use client";

import { useEffect, useState, useRef } from "react";
import MenuAlternativas from "@/components/rescate/MenuAlternativas";
import { soundConsultaAceptada, soundVideoLista, unlockAudio } from "@/lib/sounds";
import { CheckCircle, XCircle, Video } from "lucide-react";
import { articuloMedico, formatNombreMedico } from "@/lib/utils/texto";

type Props = {
  turnoId: string;
  medicoNombre: string;
  // "Dr." / "Dra." elegido por el médico en su registro. Opcional: sin él la pantalla
  // muestra el nombre pelado y arma las frases sin artículo, en vez de adivinar género.
  medicoTitulo?: string | null;
  medicoEspecialidad: string;
  horaInicio: string;
  returnUrl?: string;
};

type Estado = "esperando" | "iniciando" | "redirigiendo" | "finalizado" | "cancelado" | "ausente";

export default function EsperaTurno({ turnoId, medicoNombre, medicoTitulo, medicoEspecialidad, horaInicio, returnUrl = "/dashboard" }: Props) {
  const nombreMedico = formatNombreMedico(medicoNombre, medicoTitulo);
  // Sujeto listo para arrancar una oración: "La Dra. García", "El Dr. López", o el
  // nombre solo si no sabemos el título. Nunca "El" a ciegas.
  const articulo = articuloMedico(medicoTitulo);
  const sujetoMedico = nombreMedico
    ? `${articulo ? `${articulo[0].toUpperCase()}${articulo.slice(1)} ` : ""}${nombreMedico}`
    // Sin nombre (dato faltante) cae al mismo genérico que usa el resto del copy legal.
    : "El profesional";
  const [estado, setEstado] = useState<Estado>("esperando");
  // El médico está atendiendo a OTRO paciente: la demora es legítima y hay que decírselo
  // al que espera (decisión Diego 08/07 — el motor de no-show tampoco resuelve mientras
  // el médico esté atendiendo).
  const [medicoOcupado, setMedicoOcupado] = useState(false);
  const estadoRef = useRef<Estado>("esperando");
  estadoRef.current = estado;

  function redirigirAVideo() {
    soundVideoLista();
    setEstado("redirigiendo");
    window.location.href = `/turno/${turnoId}/sala`;
  }

  // Desbloquear audio al primer gesto del usuario (iOS/Android)
  useEffect(() => {
    const handler = () => unlockAudio();
    document.addEventListener("pointerdown", handler, { once: true });
    document.addEventListener("touchstart", handler, { once: true });
    unlockAudio();
    return () => {
      document.removeEventListener("pointerdown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, []);

  // Polling cada 3s via API route
  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch(`/api/turno-estado?turnoId=${turnoId}`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.estado) return;

        setMedicoOcupado(data.medico_ocupado === true);

      // en_curso detectado
      if (data.estado === "en_curso" && estadoRef.current === "esperando") {
        setEstado("iniciando");
        soundConsultaAceptada();
        if (data.sala_video_url) {
          setTimeout(() => redirigirAVideo(), 1500);
        }
        return;
      }

      // sala_video_url disponible después de en_curso
      if (estadoRef.current === "iniciando" && data.sala_video_url) {
        setTimeout(() => redirigirAVideo(), 500);
        return;
      }

      // Estados terminales
      if (data.estado === "completado") {
        setEstado("finalizado");
        setTimeout(() => { window.location.href = returnUrl; }, 3000);
        return;
      }
      // Estados terminales con PLATA: sin auto-redirect (gate Sofía) — el paciente cierra
      // cuando terminó de entender qué pasó con su pago (botón "Volver al inicio").
      if (data.estado === "cancelado_medico") {
        setEstado("cancelado");
        return;
      }
      if (data.estado === "ausente_medico") {
        setEstado("ausente");
        return;
      }
      if (["cancelado_paciente", "ausente_paciente"].includes(data.estado)) {
        window.location.href = returnUrl;
      }
      } catch {}
    }

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [turnoId]);

  // Fallback: si después de 5s en "redirigiendo" no navegó, mostrar botón
  const [mostrarFallback, setMostrarFallback] = useState(false);
  useEffect(() => {
    if (estado !== "redirigiendo") return;
    const t = setTimeout(() => setMostrarFallback(true), 5000);
    return () => clearTimeout(t);
  }, [estado]);

  return (
    <div className="text-center">
      {/* Animación de estado */}
      <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full" style={{
        background: estado === "esperando" ? "#378ADD15"
          : estado === "cancelado" || estado === "ausente" ? "#E24B4A15"
          : "#1D9E7515"
      }}>
        {estado === "esperando" ? (
          <svg className="h-12 w-12 animate-spin" style={{ color: "#378ADD" }} viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        ) : estado === "iniciando" ? (
          <CheckCircle size={40} strokeWidth={1.75} style={{ color: "var(--color-success)" }} />
        ) : estado === "finalizado" ? (
          <CheckCircle size={40} strokeWidth={1.75} style={{ color: "var(--color-success)" }} />
        ) : estado === "cancelado" || estado === "ausente" ? (
          <XCircle size={40} strokeWidth={1.75} style={{ color: "var(--color-danger)" }} />
        ) : (
          <Video size={40} strokeWidth={1.75} style={{ color: "var(--color-info)" }} />
        )}
      </div>

      <h1 className="mt-6 text-xl font-bold text-gray-900">
        {/* Los títulos que hablaban de "el médico" ahora usan el título real cuando lo
            hay, y una frase sin género cuando no lo hay. */}
        {estado === "esperando" ? (medicoOcupado ? `${sujetoMedico} está atendiendo otra consulta` : "Esperando el inicio de tu consulta...")
          : estado === "iniciando" ? "¡Tu consulta está por empezar!"
          : estado === "finalizado" ? "Tu consulta ha finalizado"
          : estado === "cancelado" ? `${sujetoMedico} canceló el turno`
          : estado === "ausente" ? `${sujetoMedico} no pudo atenderte`
          : "Entrando a la videollamada..."}
      </h1>

      <p className="mt-2 text-sm text-gray-600">
        {estado === "esperando"
          ? (medicoOcupado
              // Sin nombre acá: ya está en el título y en la card de abajo (gate Sofía).
              // Frase sin género para no depender del título; lo que de verdad tranquiliza
              // es "tu turno sigue reservado".
              ? "Todavía hay otra consulta en curso. Tu turno sigue reservado y arranca apenas termine. Gracias por esperar."
              // El título ya dice que estamos esperando: acá va lo que el paciente
              // necesita saber (que no tiene que hacer nada), no la misma frase de nuevo.
              : "Ya avisamos que estás en la sala. Entrás automáticamente apenas se inicie la consulta.")
          : estado === "iniciando" ? "Preparando la videollamada..."
          : estado === "finalizado" ? "Los documentos están disponibles en tu perfil. Redirigiendo..."
          // Presente-neutro ("te devolvemos"): verdadero tanto si el refund ya procesó
          // como si quedó en cola de reintentos (no afirmar en pasado lo que puede no ser).
          : estado === "cancelado" ? "Te devolvemos el pago completo. Podés reservar un nuevo turno cuando quieras."
          : estado === "ausente" ? "Te devolvemos el pago completo. Podés reservar un nuevo turno cuando quieras."
          : "Redirigiendo..."}
      </p>

      {/* El CONTRATO del turno, visible mientras espera: la espera tiene techo
          y el desenlace es automático. La paciente del 30/08 miró este spinner
          sin ninguna promesa y terminó escribiendo a soporte — con el turno ya
          resuelto y reembolsado por el cron (GRACIA_MIN=20 en
          resolver-turnos-vencidos). Cuando el profesional está atendiendo otra
          consulta la espera es legítima y el plazo no corre: ahí habla el
          banner de arriba, no este. */}
      {estado === "esperando" && !medicoOcupado && (
        <p className="mx-auto mt-3 max-w-md text-[13px] leading-relaxed" style={{ color: "#888780" }}>
          Si {sujetoMedico} no se presenta, pasados 20 minutos de la hora del turno lo
          cancelamos y te devolvemos el 100% — sin que tengas que hacer nada.
        </p>
      )}

      {/* Info card */}
      <div className="mt-8 rounded-xl bg-white p-6 text-left" style={{ border: "0.5px solid #e5e7eb" }}>
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Médico</span>
            <span className="font-medium text-gray-900">{nombreMedico}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Especialidad</span>
            <span className="font-medium text-gray-900">{medicoEspecialidad}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Hora del turno</span>
            <span className="font-medium text-gray-900">{horaInicio.slice(0, 5)} hs</span>
          </div>
          <div className="border-t border-gray-100 pt-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Estado</span>
              <span
                className="font-medium"
                style={{
                  color:
                    estado === "esperando" ? "#378ADD"
                    : estado === "cancelado" || estado === "ausente" ? "#E24B4A"
                    : estado === "finalizado" ? "#888780"
                    : "#1D9E75",
                }}
              >
                {estado === "esperando"
                  ? (medicoOcupado ? "Atendiendo otra consulta" : "En espera")
                  : estado === "iniciando" ? "Consulta lista"
                  : estado === "ausente" ? "Cancelado — con reembolso"
                  : estado === "cancelado" ? "Cancelado"
                  : estado === "finalizado" ? "Finalizada"
                  : "Videollamada lista"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Botón fallback */}
      {mostrarFallback && (
        <a
          href={`/turno/${turnoId}/sala`}
          className="mt-6 block w-full rounded-xl px-6 py-3 text-center text-sm font-semibold text-white active:scale-95 active:opacity-80 transition-all duration-100"
          style={{ background: "#378ADD" }}
        >
          Unirse a la videollamada
        </a>
      )}

      {/* El menú de rescate, en bloque APARTE del cierre de la transacción
          (orden emocional, gate Sofía): primero "te devolvemos el 100%", después
          "¿necesitás atenderte hoy?". El que falló no aparece (lo excluye el
          servidor); si no hay nada vivo, el bloque no existe. */}
      {(estado === "cancelado" || estado === "ausente") && (
        <div className="mx-auto max-w-md text-left">
          <MenuAlternativas turnoId={turnoId} />
        </div>
      )}

      {/* Terminales con plata: el paciente se va cuando terminó de leer, no a los 4s. */}
      {(estado === "cancelado" || estado === "ausente") && (
        <a
          href={returnUrl}
          className="mt-6 block w-full rounded-xl px-6 py-3 text-center text-sm font-semibold text-white active:scale-95 active:opacity-80 transition-all duration-100"
          style={{ background: "#378ADD" }}
        >
          Volver al inicio
        </a>
      )}

      {(estado === "esperando" || estado === "iniciando" || estado === "redirigiendo") && (
        <p className="mt-6 text-xs text-gray-400">
          No cierres esta pestaña
        </p>
      )}
    </div>
  );
}
