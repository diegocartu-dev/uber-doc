import { Resend } from "resend";
import { readFileSync, existsSync } from "fs";

const resend = new Resend(process.env.RESEND_API_KEY);
const TO = process.env.REPORT_EMAIL || "diegocartu@gmail.com";

// ─── Severity classification ───────────────────────────────────────────────
// Maps test file paths/titles to severity levels
const SEVERITY_RULES = [
  { pattern: /onboarding/i, level: "CRÍTICO", area: "Onboarding" },
  { pattern: /login|auth|oauth/i, level: "CRÍTICO", area: "Login" },
  { pattern: /pago|payment|mercado/i, level: "CRÍTICO", area: "Pagos" },
  { pattern: /video|daily|livekit/i, level: "CRÍTICO", area: "Video" },
  { pattern: /dashboard/i, level: "CRÍTICO", area: "Dashboard" },
  { pattern: /email|resend|notif/i, level: "MEDIO", area: "Emails/Notificaciones" },
  { pattern: /push/i, level: "MEDIO", area: "Push notifications" },
  { pattern: /cancel/i, level: "MEDIO", area: "Cancelaciones" },
  { pattern: /performance|speed|slow/i, level: "BAJO", area: "Performance" },
  { pattern: /visual|css|style|layout/i, level: "BAJO", area: "Detalles visuales" },
];

function classifySeverity(title, file) {
  const text = `${title} ${file}`.toLowerCase();
  for (const rule of SEVERITY_RULES) {
    if (rule.pattern.test(text)) return { level: rule.level, area: rule.area };
  }
  return { level: "MEDIO", area: "General" };
}

const SEVERITY_ORDER = { "CRÍTICO": 0, "MEDIO": 1, "BAJO": 2 };
const SEVERITY_COLORS = {
  "CRÍTICO": "#E24B4A",
  "MEDIO": "#BA7517",
  "BAJO": "#888780",
};

// ─── Friendly error descriptions ───────────────────────────────────────────
function friendlyError(title, error) {
  if (/toBeVisible/.test(error)) return "Un elemento que debería verse en pantalla no aparece.";
  if (/waitForURL|timeout/i.test(error)) return "La página no cargó o no redirigió a tiempo.";
  if (/toContainText/.test(error)) return "El texto esperado no se encontró en la página.";
  if (/toHaveLength/.test(error)) return "Se enviaron datos al servidor cuando no deberían haberse enviado.";
  if (/navigation/i.test(error)) return "La navegación entre páginas falló.";
  return "El test detectó un comportamiento inesperado en la aplicación.";
}

// ─── Parse results ─────────────────────────────────────────────────────────
let totalTests = 0;
let passed = 0;
let failed = 0;
const failures = [];

function walkSuites(suites) {
  for (const suite of suites || []) {
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        totalTests++;
        const ok = test.results?.every((r) => r.status === "passed" || r.status === "skipped");
        if (ok) {
          passed++;
        } else {
          failed++;
          const rawError = test.results?.[0]?.error?.message?.slice(0, 300) || "";
          const severity = classifySeverity(spec.title, suite.file || spec.file || "");
          failures.push({
            title: spec.title,
            file: suite.file || spec.file || "",
            rawError,
            friendly: friendlyError(spec.title, rawError),
            ...severity,
          });
        }
      }
    }
    walkSuites(suite.suites);
  }
}

const resultsPath = "test-results/results.json";
if (existsSync(resultsPath)) {
  const results = JSON.parse(readFileSync(resultsPath, "utf-8"));
  walkSuites(results.suites);
}

// ─── Decision: send or skip ────────────────────────────────────────────────
if (failed === 0) {
  console.log(`[quality-gate] ${totalTests} tests pasaron. No se envía email.`);
  process.exit(0);
}

failures.sort((a, b) => SEVERITY_ORDER[a.level] - SEVERITY_ORDER[b.level]);

const maxSeverity = failures[0].level;
const headerColor = SEVERITY_COLORS[maxSeverity];

// ─── Build email ───────────────────────────────────────────────────────────
const now = new Date();
const fechaAR = now.toLocaleDateString("es-AR", {
  weekday: "long", day: "numeric", month: "long", year: "numeric",
  timeZone: "America/Argentina/Buenos_Aires",
});

const failureRows = failures
  .map((f, i) => {
    const color = SEVERITY_COLORS[f.level];
    return `
    <tr>
      <td style="padding:16px;border-bottom:1px solid #e5e7eb;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span style="display:inline-block;padding:3px 10px;background:${color}1a;color:${color};border:1px solid ${color}40;border-radius:12px;font-size:11px;font-weight:700;">${f.level}</span>
          <span style="font-size:11px;color:#6b7280;">${f.area}</span>
        </div>
        <p style="margin:0;font-size:14px;font-weight:600;color:#1a1a1a;">${f.friendly}</p>
        <p style="margin:6px 0 0;font-size:13px;color:#6b7280;">Test: ${f.title}</p>
      </td>
    </tr>`;
  })
  .join("");

const marcosBrief = failures
  .map((f) => `[${f.level}] ${f.title}\n  Archivo: ${f.file}\n  Error: ${f.rawError.split("\n")[0]}`)
  .join("\n\n");

const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">

  <tr><td style="background:${headerColor};padding:24px 32px;">
    <p style="margin:0;font-size:22px;font-weight:700;color:#fff;">\uD83D\uDEA8 Docto — Quality Gate</p>
    <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">${fechaAR} &mdash; ${failed} de ${totalTests} tests fallaron</p>
  </td></tr>

  <tr><td style="padding:32px;">
    <h2 style="margin:0 0 20px;font-size:18px;color:#1a1a1a;">Algo se rompi\u00f3 en Docto</h2>

    <table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
      ${failureRows}
    </table>

    <div style="margin-top:28px;padding:16px 20px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:10px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#1a1a1a;">Brief para Marcos (copi\u00e1 y peg\u00e1):</p>
      <pre style="margin:0;font-size:12px;color:#374151;white-space:pre-wrap;font-family:monospace;line-height:1.5;">${marcosBrief}</pre>
    </div>

    <p style="margin:28px 0 0;font-size:13px;color:#9ca3af;">
      <a href="https://github.com/diegocartu-dev/uber-doc/actions" style="color:#378ADD;">Ver logs completos en GitHub Actions</a>
    </p>
  </td></tr>

  <tr><td style="padding:20px 32px;background:#f3f4f6;border-top:1px solid #e5e7eb;">
    <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
      Quality Gate &mdash; Docto &middot; <a href="https://docto.com.ar" style="color:#9ca3af;">docto.com.ar</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;

const severityEmoji = { "CRÍTICO": "\uD83D\uDEA8", "MEDIO": "\u26A0\uFE0F", "BAJO": "\uD83D\uDFE1" };
const subject = `${severityEmoji[maxSeverity]} Docto: ${failed} test${failed > 1 ? "s" : ""} fall${failed > 1 ? "aron" : "\u00f3"} [${maxSeverity}] — ${fechaAR}`;

try {
  await resend.emails.send({
    from: "Docto QA <no-reply@docto.com.ar>",
    to: TO,
    subject,
    html,
  });
  console.log(`[quality-gate] Alerta enviada a ${TO}: ${failed} failures (${maxSeverity})`);
} catch (err) {
  console.error("[quality-gate] Error enviando alerta:", err);
  process.exit(1);
}
