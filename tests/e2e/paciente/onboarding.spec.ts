import { test, expect } from "@playwright/test";
import { loginPaciente } from "../../helpers/auth";
import { PACIENTE_INCOMPLETO, PACIENTE_NORMAL, PACIENTE_DNI_INVALIDO, MEDICO_TEST } from "../../fixtures/cuentas-prueba";

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

    // Aceptar términos para habilitar el botón submit
    await page.getByRole("checkbox").check();

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

    // Aceptar términos para habilitar el botón submit
    await page.getByRole("checkbox").check();

    await page.getByRole("button", { name: /guardar/i }).click();

    await page.waitForURL((url) => !url.pathname.includes("/onboarding"), { timeout: 15000 });

    expect(page.url()).not.toContain("/onboarding");
    expect(page.url()).not.toContain("error=");
  });

  test("TEST 06 — usuario con fila parcial completa onboarding (regresión RLS UPDATE)", async ({ page }) => {
    // paciente.test9 ya tiene fila en DB → el upsert hace UPDATE, no INSERT.
    // Sin la política RLS de UPDATE en pacientes, esto falla silenciosamente.
    // Bug real: Juan Barril bloqueado el 25/04/2026.
    await loginPaciente(page, PACIENTE_DNI_INVALIDO.email, PACIENTE_DNI_INVALIDO.password);

    await page.goto("/onboarding?edit=1");
    await expect(page.getByLabel("Nombre completo")).toBeVisible({ timeout: 10000 });

    await page.getByLabel("Nombre completo").fill("Test Regresion RLS");
    await page.getByLabel("DNI").fill(PACIENTE_DNI_INVALIDO.dni);
    await page.getByLabel("Fecha de nacimiento").fill("1991-12-05");
    await page.getByLabel("Masculino").check();

    // Aceptar términos para habilitar el botón submit
    await page.getByRole("checkbox").check();

    await page.getByRole("button", { name: /guardar/i }).click();

    await page.waitForURL((url) => !url.pathname.includes("/onboarding"), { timeout: 15000 });

    expect(page.url()).not.toContain("/onboarding");
    expect(page.url()).not.toContain("error=");
  });

  test("TEST 07 — paciente sin perfil completo es redirigido al intentar reservar turno", async ({ page }) => {
    await loginPaciente(page, PACIENTE_INCOMPLETO.email, PACIENTE_INCOMPLETO.password);

    await page.goto(`/clinica/${MEDICO_TEST.id}/turnos`);

    await page.waitForURL(/\/onboarding/, { timeout: 15000 });

    expect(page.url()).toContain("/onboarding");
    expect(page.url()).not.toContain("error");
  });
});
