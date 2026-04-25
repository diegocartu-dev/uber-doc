import { test, expect } from "@playwright/test";
import { loginWithEmail } from "../../helpers/auth";
import { MEDICO_TEST } from "../../fixtures/cuentas-prueba";

test.describe("Dashboard médico", () => {
  test("TEST 05 — Dashboard médico carga sin errores de consola", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        if (
          !text.includes("favicon") &&
          !text.includes("third-party") &&
          !text.includes("Failed to load resource") &&
          !text.includes("net::ERR")
        ) {
          consoleErrors.push(text);
        }
      }
    });

    await loginWithEmail(page, MEDICO_TEST.email, MEDICO_TEST.password);
    expect(page.url()).toContain("/dashboard");

    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    await expect(page.locator("nav, header")).toBeVisible({ timeout: 10000 });

    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(50);

    expect(consoleErrors).toHaveLength(0);
  });
});
