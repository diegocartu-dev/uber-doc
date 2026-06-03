import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "https://uber-doc.vercel.app";

// Bypass de Vercel Deployment Protection: cuando el CI testea un preview
// protegido, mandamos esta cabecera en todas las requests para poder entrar.
// Sin secret (local / producción no protegida) no se manda nada.
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const extraHTTPHeaders = BYPASS
  ? {
      "x-vercel-protection-bypass": BYPASS,
      "x-vercel-set-bypass-cookie": "true",
    }
  : undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["json", { outputFile: "test-results/results.json" }]]
    : "list",
  use: {
    baseURL: BASE_URL,
    extraHTTPHeaders,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 13"] },
    },
  ],
});
