import { test, expect } from "@playwright/test";
import { loginPaciente } from "../../helpers/auth";
import { PACIENTE_INCOMPLETO, PACIENTE_NORMAL } from "../../fixtures/cuentas-prueba";

test.describe("Onboarding paciente", () => {
  test("TEST 01 — campos vacíos muestran errores inline, no llega al servidor", async ({ page }) => {
    await loginPaciente(page, PACIENTE_INCOMPLETO.email, PACIENTE_INCOMPLETO.password);

    if (!page.url().includes("/onboarding")) {
      await page.goto("/onboarding?edit=1");
    }

    await expect(page.getByLabel("Nombre completo")).toBeVisible({ timeout: 10000 });

    const requests: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/onboarding")) {
        requests.push(req.url());
      }
    });

    // Remove native `required` so our custom JS validation layer is tested
    await page.evaluate(() => {
      document.querySelectorAll("[required]").forEach((el) => el.removeAttribute("required"));
    });

    await page.getByLabel("Nombre completo").clear();
    await page.getByLabel("DNI").clear();

    await page.getByRole("button", { name: /guardar/i }).click();

    await expect(page.locator("text=Ingresá tu nombre completo.")).toBeVisible();
    await expect(page.locator("text=Ingresá tu DNI.")).toBeVisible();
    await expect(page.locator("text=Seleccioná tu fecha de nacimiento.")).toBeVisible();

    expect(requests).toHaveLength(0);
  });

  test("TEST 02 — onboarding completo exitoso", async ({ page }) => {
    await loginPaciente(page, PACIENTE_NORMAL.email, PACIENTE_NORMAL.password);

    if (!page.url().includes("/onboarding")) {
      await page.goto("/onboarding?edit=1");
    }

    await expect(page.getByLabel("Nombre completo")).toBeVisible({ timeout: 10000 });

    await page.getByLabel("Nombre completo").fill("Paciente Test Uno");
    await page.getByLabel("DNI").fill(PACIENTE_NORMAL.dni);
    await page.getByLabel("Fecha de nacimiento").fill("1990-05-15");
    await page.getByLabel("Femenino").check();

    await page.getByRole("button", { name: /guardar/i }).click();

    await page.waitForURL((url) => !url.pathname.includes("/onboarding"), { timeout: 15000 });

    expect(page.url()).not.toContain("/onboarding");
    expect(page.url()).not.toContain("error=");
  });
});
