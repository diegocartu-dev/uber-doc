"use client";

// Emisor de eventos de funnel desde el cliente. Fire-and-forget: nunca bloquea ni
// rompe el flujo del usuario si falla. El servidor (/api/funnel/track) valida que el
// evento esté permitido y resuelve el id (médico o paciente) desde la sesión.
// `keepalive` permite que el evento salga aunque la página esté navegando.
export function trackFunnel(evento: string, metadata?: Record<string, unknown>): void {
  try {
    fetch("/api/funnel/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evento, metadata: metadata ?? {} }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // noop
  }
}
