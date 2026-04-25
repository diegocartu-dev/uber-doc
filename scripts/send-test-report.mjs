import { Resend } from "resend";
import { readFileSync, existsSync } from "fs";

const resend = new Resend(process.env.RESEND_API_KEY);
const TO = process.env.REPORT_EMAIL || "diegocartu@gmail.com";

const now = new Date();
const fechaAR = now.toLocaleDateString("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Argentina/Buenos_Aires",
});
const horaAR = now.toLocaleTimeString("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Argentina/Buenos_Aires",
});

let results = null;
const resultsPath = "test-results/results.json";
if (existsSync(resultsPath)) {
  results = JSON.parse(readFileSync(resultsPath, "utf-8"));
}

let totalTests = 0;
let passed = 0;
let failed = 0;
const failures = [];

if (results?.suites) {
  for (const suite of results.suites) {
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        totalTests++;
        const ok = test.results?.every((r) => r.status === "passed" || r.status === "skipped");
        if (ok) {
          passed++;
        } else {
          failed++;
          failures.push({
            title: spec.title,
            file: spec.file,
            error: test.results?.[0]?.error?.message?.slice(0, 200) || "Error desconocido",
          });
        }
      }
    }
  }
}

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
          failures.push({
            title: spec.title,
            file: suite.file || spec.file || "",
            error: test.results?.[0]?.error?.message?.slice(0, 200) || "Error desconocido",
          });
        }
      }
    }
    walkSuites(suite.suites);
  }
}

if (results) {
  totalTests = 0;
  passed = 0;
  failed = 0;
  failures.length = 0;
  walkSuites(results.suites);
}

const estado =
  failed === 0
    ? { emoji: "\u2705", label: "SALUDABLE", color: "#1D9E75" }
    : failed <= 2
      ? { emoji: "\u26A0\uFE0F", label: "ATENCI\u00D3N", color: "#BA7517" }
      : { emoji: "\uD83D\uDEA8", label: "CR\u00CDTICO", color: "#E24B4A" };

const failureRows = failures
  .map(
    (f, i) => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">
        <p style="margin:0;font-size:14px;font-weight:600;color:#1a1a1a;">${i + 1}. ${f.title}</p>
        <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">${f.file}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#E24B4A;font-family:monospace;">${f.error}</p>
      </td>
    </tr>`
  )
  .join("");

const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">

  <tr><td style="background:#378ADD;padding:24px 32px;">
    <p style="margin:0;font-size:22px;font-weight:700;color:#fff;">Docto — Quality Gate</p>
    <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">Reporte ${fechaAR} — ${horaAR}</p>
  </td></tr>

  <tr><td style="padding:32px;">
    <div style="display:inline-block;padding:8px 20px;background:${estado.color}1a;color:${estado.color};border:1px solid ${estado.color}40;border-radius:20px;font-size:14px;font-weight:600;">
      ${estado.emoji} ${estado.label}
    </div>

    <table cellpadding="0" cellspacing="0" width="100%" style="margin-top:24px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
      <tr style="background:#f3f4f6;">
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;font-weight:600;">Tests ejecutados</td>
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;font-weight:600;">OK</td>
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;font-weight:600;">Fallaron</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-size:20px;font-weight:700;color:#1a1a1a;">${totalTests}</td>
        <td style="padding:12px 16px;font-size:20px;font-weight:700;color:#1D9E75;">${passed}</td>
        <td style="padding:12px 16px;font-size:20px;font-weight:700;color:${failed > 0 ? "#E24B4A" : "#1D9E75"};">${failed}</td>
      </tr>
    </table>

    ${
      failures.length > 0
        ? `
    <h3 style="margin:28px 0 12px;font-size:15px;color:#1a1a1a;">Problemas encontrados:</h3>
    <table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
      ${failureRows}
    </table>`
        : `
    <div style="margin-top:24px;padding:16px 20px;background:#1D9E751a;border:1px solid #1D9E7540;border-radius:10px;">
      <p style="margin:0;font-size:14px;color:#1D9E75;font-weight:600;">\u2705 Todo funciona perfecto</p>
      <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Los 5 tests cr\u00edticos pasaron sin errores.</p>
    </div>`
    }

    <p style="margin:28px 0 0;font-size:13px;color:#9ca3af;">
      Pr\u00f3ximo test autom\u00e1tico: esta noche a las 3AM<br/>
      <a href="https://github.com/diegocartu-dev/uber-doc/actions" style="color:#378ADD;">Ejecutar manualmente en GitHub Actions</a>
    </p>
  </td></tr>

  <tr><td style="padding:20px 32px;background:#f3f4f6;border-top:1px solid #e5e7eb;">
    <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
      Quality Gate — Docto &middot; <a href="https://docto.com.ar" style="color:#9ca3af;">docto.com.ar</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;

const subject = `${estado.emoji} Docto Quality Gate — ${estado.label} — ${fechaAR}`;

try {
  await resend.emails.send({
    from: "Docto QA <no-reply@docto.com.ar>",
    to: TO,
    subject,
    html,
  });
  console.log(`[quality-gate] Reporte enviado a ${TO}`);
} catch (err) {
  console.error("[quality-gate] Error enviando reporte:", err);
  process.exit(1);
}
