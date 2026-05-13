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
