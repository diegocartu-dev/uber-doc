import { test, expect } from "@playwright/test";
import { loginPaciente } from "../../helpers/auth";
import { PACIENTE_INCOMPLETO, PACIENTE_NORMAL, PACIENTE_DNI_INVALIDO, MEDICO_TEST } from "../../fixtures/cuentas-prueba";

test.describe("Onboarding paciente", () => {
  test("TEST 01 — campos vacíos muestran errores inline, no llega al servidor", async ({ page }) => {
    await loginPaciente(page, PACIENTE_INCOMPLETO.email, PACIENTE_INCOMPLETO.password);

    if (!page.url().includes("/onboarding")) {
      await page.goto("/onboarding?edit=1");
    }

    await expect(page.getByLabel("Nombre", { exact: true })).toBeVisible({ timeout: 10000 });

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

    await page.getByLabel("Nombre", { exact: true }).clear();
    await page.getByLabel("Apellido", { exact: true }).clear();
    await page.getByLabel("DNI").clear();

    // Aceptar ambos checkboxes (T&C + datos sensibles) para habilitar el botón submit
    for (const cb of await page.getByRole("checkbox").all()) await cb.check();

    await page.getByRole("button", { name: /guardar/i }).click();

    await expect(page.locator("text=Ingresá tu nombre.")).toBeVisible();
    await expect(page.locator("text=Ingresá tu apellido.")).toBeVisible();
    await expect(page.locator("text=Ingresá tu DNI.")).toBeVisible();
    await expect(page.locator("text=Ingresá tu fecha de nacimiento (DD/MM/AAAA).")).toBeVisible();

    expect(requests).toHaveLength(0);
  });

  test("TEST 01b — con nombre pero SIN apellido tampoco pasa (regresión del certificado sin apellido)", async ({ page }) => {
    // El caso real (21/08/2026): el formulario pedía UN campo "Nombre completo"
    // y validaba solo que no estuviera vacío. Una paciente escribió su nombre de
    // pila, y sus tres documentos se emitieron —y se sellaron— sin apellido.
    // Este test fija la regla: el apellido es obligatorio por sí mismo.
    await loginPaciente(page, PACIENTE_INCOMPLETO.email, PACIENTE_INCOMPLETO.password);

    if (!page.url().includes("/onboarding")) {
      await page.goto("/onboarding?edit=1");
    }

    await expect(page.getByLabel("Nombre", { exact: true })).toBeVisible({ timeout: 10000 });

    await page.evaluate(() => {
      document.querySelectorAll("[required]").forEach((el) => el.removeAttribute("required"));
    });

    await page.getByLabel("Nombre", { exact: true }).fill("Luciana");
    await page.getByLabel("Apellido", { exact: true }).clear();

    for (const cb of await page.getByRole("checkbox").all()) await cb.check();
    await page.getByRole("button", { name: /guardar/i }).click();

    await expect(page.locator("text=Ingresá tu apellido.")).toBeVisible();
    expect(page.url()).toContain("/onboarding");
  });

  test("TEST 02 — onboarding completo exitoso", async ({ page }) => {
    await loginPaciente(page, PACIENTE_NORMAL.email, PACIENTE_NORMAL.password);

    if (!page.url().includes("/onboarding")) {
      await page.goto("/onboarding?edit=1");
    }

    await expect(page.getByLabel("Nombre", { exact: true })).toBeVisible({ timeout: 10000 });

    await page.getByLabel("Nombre", { exact: true }).fill("Paciente");
    await page.getByLabel("Apellido", { exact: true }).fill("Test Uno");
    await page.getByLabel("DNI").fill(PACIENTE_NORMAL.dni);
    await page.getByLabel("Fecha de nacimiento").fill("15/05/1990");
    await page.getByLabel("Femenino").check();
    await page.getByLabel("Teléfono").fill("1123456789");
    // Fijar obra social explícitamente (evita que un perfil previo con cobertura
    // exija "Nro. de afiliado" y bloquee el submit).
    await page.getByLabel("Obra social o prepaga").selectOption({ label: "No tengo / No incluir" });

    // Aceptar ambos checkboxes (T&C + datos sensibles) para habilitar el botón submit
    for (const cb of await page.getByRole("checkbox").all()) await cb.check();

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
    await expect(page.getByLabel("Nombre", { exact: true })).toBeVisible({ timeout: 10000 });

    await page.getByLabel("Nombre", { exact: true }).fill("Test");
    await page.getByLabel("Apellido", { exact: true }).fill("Regresion RLS");
    await page.getByLabel("DNI").fill(PACIENTE_DNI_INVALIDO.dni);
    await page.getByLabel("Fecha de nacimiento").fill("05/12/1991");
    await page.getByLabel("Masculino").check();
    await page.getByLabel("Teléfono").fill("1123456789");

    // Aceptar ambos checkboxes (T&C + datos sensibles) para habilitar el botón submit
    for (const cb of await page.getByRole("checkbox").all()) await cb.check();

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
