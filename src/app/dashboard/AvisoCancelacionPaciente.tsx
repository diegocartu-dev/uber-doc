"use client";

// Cartel: "el paciente canceló esta consulta".
//
// Aparece cuando un paciente abandona —sin haber pagado— una solicitud que este
// profesional tenía pendiente o ya había aceptado. Se muestra 5 minutos desde
// que se generó y después se va solo: es un aviso de descarte, no una tarea.
// Pasados unos minutos ya no le sirve y solo le ensucia la pantalla.
//
// NO es un modal. El profesional puede estar por entrar a atender a otro
// paciente y esto no tiene por qué taparle nada: es una tarjeta al costado que
// se puede ignorar. El registro permanente queda en la campana.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  TITULO_CANCELACION,
  VENTANA_AVISO_CANCELACION_MS,
} from "@/lib/consultas/aviso-cancelacion";

type Notificacion = {
  id: string;
  titulo: string;
  mensaje: string;
  created_at: string;
};

const INTERVALO_CONSULTA_MS = 30 * 1000;

export default function AvisoCancelacionPaciente() {
  const [avisos, setAvisos] = useState<Notificacion[]>([]);
  // Los que el profesional cerró a mano. Se guardan acá y no en el servidor
  // para no marcar como leída toda la campana por cerrar un cartel.
  const descartados = useRef<Set<string>>(new Set());

  const vigente = useCallback((n: Notificacion) => {
    const nacido = new Date(n.created_at).getTime();
    if (Number.isNaN(nacido)) return false;
    return Date.now() - nacido < VENTANA_AVISO_CANCELACION_MS;
  }, []);

  useEffect(() => {
    let activo = true;

    async function revisar() {
      try {
        const r = await fetch("/api/medico/notificaciones", { credentials: "include" });
        if (!r.ok) return;
        const data = (await r.json()) as { notificaciones?: Notificacion[] };
        if (!activo) return;

        setAvisos(
          (data.notificaciones ?? []).filter(
            (n) => n.titulo === TITULO_CANCELACION && vigente(n) && !descartados.current.has(n.id)
          )
        );
      } catch {
        // Un aviso que no se puede leer nunca puede romper el dashboard.
      }
    }

    revisar();
    const id = setInterval(revisar, INTERVALO_CONSULTA_MS);

    // Segundo timer, más rápido: el fetch trae el aviso una vez, pero el que lo
    // tiene que APAGAR a los 5 minutos es el reloj local. Sin esto, un cartel
    // podía quedar hasta 30 s de más esperando el siguiente poll.
    const barrido = setInterval(() => {
      if (!activo) return;
      setAvisos((prev) => {
        const quedan = prev.filter(vigente);
        return quedan.length === prev.length ? prev : quedan;
      });
    }, 5000);

    return () => {
      activo = false;
      clearInterval(id);
      clearInterval(barrido);
    };
  }, [vigente]);

  if (avisos.length === 0) return null;

  function descartar(id: string) {
    descartados.current.add(id);
    setAvisos((prev) => prev.filter((n) => n.id !== id));
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 72,
        right: 16,
        zIndex: 9000,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        width: "min(360px, calc(100vw - 32px))",
      }}
    >
      {avisos.map((n) => (
        <div
          key={n.id}
          role="status"
          style={{
            background: "#fff",
            borderRadius: 14,
            borderLeft: "4px solid #E24B4A",
            boxShadow: "0 10px 30px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)",
            padding: "14px 14px 14px 16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>
                {n.titulo}
              </p>
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: 13,
                  lineHeight: 1.45,
                  color: "#555",
                  whiteSpace: "pre-line",
                }}
              >
                {n.mensaje}
              </p>
            </div>
            <button
              type="button"
              onClick={() => descartar(n.id)}
              aria-label="Cerrar aviso"
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "#888780",
                fontSize: 20,
                lineHeight: 1,
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
