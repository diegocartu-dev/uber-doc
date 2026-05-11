import { readFileSync, existsSync } from "fs";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "https://uber-doc.vercel.app";
const TOKEN = process.env.SERENO_API_TOKEN;

if (!TOKEN) {
  console.error("[sereno-report] SERENO_API_TOKEN es requerida");
  process.exit(1);
}

let totalTests = 0;
let passed = 0;
let failed = 0;
const details = [];

function walkSuites(suites) {
  for (const suite of suites || []) {
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        totalTests++;
        const testPassed = test.results?.every(
          (r) => r.status === "passed" || r.status === "skipped"
        );
        const duration = test.results?.[0]?.duration ?? 0;

        if (testPassed) {
          passed++;
          details.push({
            title: spec.title,
            file: suite.file || spec.file || "",
            status: "passed",
            duration_ms: duration,
          });
        } else {
          failed++;
          details.push({
            title: spec.title,
            file: suite.file || spec.file || "",
            status: "failed",
            error: test.results?.[0]?.error?.message?.slice(0, 500) || "Error desconocido",
            duration_ms: duration,
          });
        }
      }
    }
    walkSuites(suite.suites);
  }
}

const resultsPath = "test-results/results.json";
let totalDuration = 0;

if (existsSync(resultsPath)) {
  const results = JSON.parse(readFileSync(resultsPath, "utf-8"));
  walkSuites(results.suites);
  totalDuration = results.stats?.duration ?? 0;
} else {
  console.error("[sereno-report] No se encontró results.json");
  process.exit(1);
}

const payload = {
  passed,
  failed,
  total: totalTests,
  duration_ms: totalDuration,
  status: failed > 0 ? "fail" : "ok",
  details,
};

console.log(`[sereno-report] Resultado: ${passed}/${totalTests} pasaron, ${failed} fallaron (${totalDuration}ms)`);

try {
  const res = await fetch(`${BASE_URL}/api/admin/sereno`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[sereno-report] Error guardando resultado: ${res.status} ${text}`);
    process.exit(1);
  }

  const data = await res.json();
  console.log(`[sereno-report] Resultado guardado: ${data.id}`);
} catch (err) {
  console.error("[sereno-report] Error de conexión:", err.message);
  process.exit(1);
}
