const ALERT_RECIPIENTS = ["diegocartu@gmail.com", "diegocartu@me.com"];

export async function sendDoctoAlert(subject: string, text: string): Promise<void> {
  try {
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey || resendKey.includes("placeholder")) return;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: "Docto Alertas <alertas@docto.com.ar>",
        to: ALERT_RECIPIENTS,
        subject,
        text,
      }),
    });
  } catch {
    // No romper el flujo principal por fallo de email
  }
}

// ─── Alerta de servicio con throttle durable ──────────────────────────────────
// Para avisos de servicios externos (saldo Didit/Twilio, cuotas) que pueden
// dispararse muchas veces seguidas (cada médico que choca con el error, cada
// corrida de cron). Reutiliza `cron_runs` como registro keyed por servicio —
// el watchdog ignora keys fuera de su mapa ESPERADOS, así que no interfiere.
// Best-effort igual que sendDoctoAlert: jamás rompe el flujo que la llama.
export async function sendDoctoAlertThrottled(
  key: string,
  horasThrottle: number,
  subject: string,
  text: string
): Promise<void> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const { data } = await admin
      .from("cron_runs")
      .select("last_alerted_at")
      .eq("cron_key", key)
      .maybeSingle();
    if (
      data?.last_alerted_at &&
      Date.now() - Date.parse(data.last_alerted_at) < horasThrottle * 3_600_000
    ) {
      return;
    }
    await sendDoctoAlert(subject, text);
    const now = new Date().toISOString();
    await admin.from("cron_runs").upsert({
      cron_key: key,
      last_alerted_at: now,
      last_status: "alerta_servicio",
      updated_at: now,
    });
  } catch {
    // Nunca romper el flujo principal por una alerta.
  }
}
