"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, X } from "lucide-react";
import { EVENTO_NOTIFICACION_MEDICO } from "@/lib/documentacion-pendiente";

// Campanita de notificaciones del médico (canal unidireccional admin → médico).
// Auto-fetch desde /api/medico/notificaciones. Se muestra SOLO si el médico recibió
// alguna notificación ("solo se activa al que se lo enviamos" — Diego). El globito
// (badge) aparece solo si hay no-leídas; se marca leído al abrir el panel.
//   - flotante=false (default): bell inline, para el header del dashboard aprobado.
//   - flotante=true: bell fijo top-right, para las pantallas de pendiente/no-validado
//     (PantallaVerificacion / PantallaIdentidad) que no tienen header.

type Notif = { id: string; titulo: string; mensaje: string; leida: boolean; created_at: string };

function fechaCorta(iso: string): string {
  try {
    const d = new Date(iso);
    const fecha = d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
    const hora = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    return `${fecha} ${hora}`;
  } catch {
    return "";
  }
}

export default function CampanaMedico({ flotante = false }: { flotante?: boolean }) {
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [noLeidas, setNoLeidas] = useState(0);
  const [abierto, setAbierto] = useState(false);

  const cargar = useCallback(() => {
    fetch("/api/medico/notificaciones")
      .then((r) => r.json())
      .then((d) => {
        setNotifs(d.notificaciones ?? []);
        setNoLeidas(d.noLeidas ?? 0);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    cargar();
    // Una notificación puede insertarse DESPUÉS de que la campanita montó: el
    // cierre de una consulta redirige al dashboard y recién ahí, en segundo
    // plano, detecta que la entrega falló y deja el aviso. Sin escuchar esto, el
    // médico no lo ve hasta la próxima carga completa del dashboard.
    window.addEventListener(EVENTO_NOTIFICACION_MEDICO, cargar);
    return () => window.removeEventListener(EVENTO_NOTIFICACION_MEDICO, cargar);
  }, [cargar]);

  function toggle() {
    const next = !abierto;
    setAbierto(next);
    if (next && noLeidas > 0) {
      // Marcar leídas al abrir (fire-and-forget) + optimismo en UI.
      fetch("/api/medico/notificaciones", { method: "POST" }).catch(() => {});
      setNoLeidas(0);
      setNotifs((prev) => prev.map((n) => ({ ...n, leida: true })));
    }
  }

  // Sin notificaciones → no se muestra la campanita.
  if (notifs.length === 0) return null;

  return (
    <div className={flotante ? "fixed right-4 top-4 z-50" : "relative"}>
      <button
        onClick={toggle}
        aria-label="Notificaciones"
        className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-200 transition-colors hover:bg-gray-50"
      >
        <Bell size={18} className="text-gray-600" />
        {noLeidas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[11px] font-semibold text-white" style={{ backgroundColor: "#D85A30" }}>
            {noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-gray-200">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <span className="text-sm font-semibold text-gray-900">Notificaciones</span>
              <button onClick={() => setAbierto(false)} aria-label="Cerrar">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifs.map((n) => (
                <div key={n.id} className="border-b border-gray-50 px-4 py-3 last:border-0">
                  <div className="text-sm font-medium text-gray-900">{n.titulo}</div>
                  <p className="mt-0.5 whitespace-pre-line text-sm text-gray-600">{n.mensaje}</p>
                  <time className="mt-1 block text-[11px] text-gray-400">{fechaCorta(n.created_at)}</time>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
