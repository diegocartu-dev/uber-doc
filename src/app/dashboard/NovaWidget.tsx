"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { formatNombreMedico } from "@/lib/utils/texto";

// ── POR QUÉ ESTE WIDGET CAMBIÓ (medición del 20/09/2026) ─────────────────────
// De los profesionales aprobados, más de la mitad NUNCA abrió Nova. Y no es que
// no entren: de esos, casi dos tercios entraron a Docto en los últimos 30 días.
// O sea que ven esta tarjeta, ven el botón, y no lo tocan.
//
// Antes el botón decía "Hablar con Nova": ofrece una CHARLA, no un trabajo. Un
// profesional que entra a ver su día no tiene ningún motivo para querer charlar.
// Ahora la tarjeta ofrece EL TRABAJO QUE LE FALTA A CADA UNO —el dashboard ya
// sabe cuál es— y el botón lleva a Nova con la frase escrita, lista para mandar.
//
// Es una hipótesis, no una certeza: por eso se instrumenta (visto / clickeado).
// Sin eso, en un mes volvemos a discutirlo sin datos.

function getSaludo(): string {
  const hora = new Date(
    new Date().toLocaleString("en-US", {
      timeZone: "America/Argentina/Buenos_Aires",
    })
  ).getHours();

  if (hora >= 6 && hora < 12) return "Buenos dias";
  if (hora >= 12 && hora < 19) return "Buenas tardes";
  return "Buenas noches";
}

/** Best-effort: si el registro falla, el profesional no se entera de nada. */
function marcar(evento: string, estado: string) {
  try {
    fetch("/api/funnel/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evento, metadata: { estado } }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* nunca puede romper el dashboard */
  }
}

type Oferta = { texto: string; boton: string; pregunta: string; estado: string };

export default function NovaWidget({
  nombreMedico,
  tituloMedico,
  turnosHoy,
  tieneAgenda,
  disponibleAhora,
}: {
  nombreMedico: string;
  /** Título que la médica eligió en su registro (`medicos.titulo`). Sin esto el
   *  saludo del propio dashboard la trataba de "Dr." — el primer texto que ve
   *  al entrar. */
  tituloMedico?: string | null;
  turnosHoy: number;
  /** ¿Tiene lugares publicados a futuro? Define qué le falta. */
  tieneAgenda: boolean;
  /** Consulta inmediata prendida. Es el canal que más consultas trae. */
  disponibleAhora: boolean;
}) {
  const router = useRouter();
  const saludo = getSaludo();
  const nombre = formatNombreMedico(nombreMedico, tituloMedico);

  // El trabajo que le falta, en orden: sin agenda no hay nada que ofrecer; con
  // agenda pero sin consulta inmediata, le falta el canal que más trae.
  const oferta: Oferta = !tieneAgenda
    ? {
        estado: "sin_agenda",
        texto: "Soy Nova, su asistente. Dígame qué días atiende y le armo la agenda de todo el mes en un minuto.",
        boton: "Armar mi agenda",
        pregunta: "Quiero armar mi agenda",
      }
    : !disponibleAhora
    ? {
        estado: "sin_ci",
        texto: "Tiene turnos cargados. Si quiere, le prendo la consulta inmediata para atender también a quien la busque ahora mismo.",
        boton: "Prender consulta inmediata",
        pregunta: "Quiero prender la consulta inmediata",
      }
    : {
        estado: "al_dia",
        texto: `Hoy tiene ${turnosHoy} turno${turnosHoy !== 1 ? "s" : ""} programado${turnosHoy !== 1 ? "s" : ""}. Pregúnteme lo que necesite de su agenda.`,
        boton: "Ver mi día",
        pregunta: "¿Cómo viene mi día?",
      };

  useEffect(() => {
    marcar("nova_widget_visto", oferta.estado);
  }, [oferta.estado]);

  return (
    <div
      className="mb-6 rounded-xl bg-white p-4 md:p-5 md:px-6"
      style={{
        border: "0.5px solid #e5e7eb",
        borderLeft: "3px solid #378ADD",
      }}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-base font-medium text-[#1a1a1a] lg:text-lg">
            {saludo}, {nombre}
          </p>
          <p className="mt-1 max-w-[62ch] text-sm text-[#6b7280]">{oferta.texto}</p>
        </div>
        <button
          onClick={() => {
            marcar("nova_widget_click", oferta.estado);
            router.push(`/medico/nova?pregunta=${encodeURIComponent(oferta.pregunta)}`);
          }}
          className="mt-3 w-full min-h-[44px] shrink-0 rounded-lg bg-[#378ADD] px-4 py-2 text-sm font-medium text-white transition-transform hover:bg-[#2e6fb5] active:scale-95 lg:mt-0 lg:w-auto"
        >
          {oferta.boton}
        </button>
      </div>
    </div>
  );
}
