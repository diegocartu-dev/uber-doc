"use client";

// Emisor de eventos de funnel desde el cliente. Fire-and-forget: nunca bloquea ni
// rompe el flujo del usuario si falla. El servidor (/api/funnel/track) valida que el
// evento esté permitido y resuelve el id (médico o paciente) desde la sesión.
//
// sendBeacon primero (28/07): un click seguido de navegación (caso "Reservar ese
// turno" del atajo) perdía el evento incluso con keepalive — el beacon está
// diseñado exactamente para sobrevivir a la navegación/cierre. Fallback a fetch
// keepalive donde no exista.
export function trackFunnel(evento: string, metadata?: Record<string, unknown>): void {
  try {
    const body = JSON.stringify({ evento, metadata: metadata ?? {} });
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const ok = navigator.sendBeacon("/api/funnel/track", new Blob([body], { type: "application/json" }));
      if (ok) return;
    }
    fetch("/api/funnel/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // noop
  }
}
