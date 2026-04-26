import { test, expect } from "@playwright/test";
import { loginPaciente } from "../../helpers/auth";
import { PACIENTE_NORMAL, MEDICO_TEST } from "../../fixtures/cuentas-prueba";

test.describe("Clínica Virtual — visibilidad y botones", () => {
  test.beforeEach(async ({ page }) => {
    await loginPaciente(page, PACIENTE_NORMAL.email, PACIENTE_NORMAL.password);
    await page.goto("/clinica");
    await expect(page.getByRole("heading", { name: "Clínica Virtual" })).toBeVisible({ timeout: 15000 });
  });

  test("TEST 08 — cada card de especialidad tiene al menos un botón de acción activo", async ({ page }) => {
    // La grilla solo muestra especialidades con médicos disponibles.
    // Cada card visible debe tener al menos "Consulta ahora" o "Agendar turno" activo.
    const cards = page.locator("[class*='rounded-'][class*='bg-white']").filter({
      has: page.locator("h3"),
    });
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < Math.min(count, 5); i++) {
      const card = cards.nth(i);
      const btnConsulta = card.getByRole("button", { name: "Consulta ahora" });
      const btnAgendar = card.getByRole("button", { name: "Agendar turno" });

      const tieneConsulta = await btnConsulta.count() > 0;
      const tieneAgendar = await btnAgendar.count() > 0;

      // Cada card debe tener al menos un botón
      expect(tieneConsulta || tieneAgendar).toBeTruthy();

      // Si tiene el botón, al menos uno debe estar habilitado
      if (tieneConsulta && tieneAgendar) {
        const consultaDisabled = await btnConsulta.isDisabled();
        const agendarDisabled = await btnAgendar.isDisabled();
        expect(!consultaDisabled || !agendarDisabled).toBeTruthy();
      }
    }
  });

  test("TEST 09 — botones deshabilitados tienen texto explicativo visible", async ({ page }) => {
    // Buscar botones "Consulta ahora" o "Agendar turno" deshabilitados
    // Si existen, deben tener texto explicativo cerca
    const botonesConsulta = page.getByRole("button", { name: "Consulta ahora" });
    const countConsulta = await botonesConsulta.count();

    for (let i = 0; i < countConsulta; i++) {
      const btn = botonesConsulta.nth(i);
      if (await btn.isDisabled()) {
        // Debe haber texto explicativo en la misma card
        const card = btn.locator("xpath=ancestor::div[contains(@class,'rounded-')]").last();
        const texto = card.locator("text=Solo turnos programados");
        await expect(texto).toBeVisible();
        return;
      }
    }

    const botonesAgendar = page.getByRole("button", { name: "Agendar turno" });
    const countAgendar = await botonesAgendar.count();

    for (let i = 0; i < countAgendar; i++) {
      const btn = botonesAgendar.nth(i);
      if (await btn.isDisabled()) {
        const card = btn.locator("xpath=ancestor::div[contains(@class,'rounded-')]").last();
        const texto = card.locator("text=Sin turnos disponibles");
        await expect(texto).toBeVisible();
        return;
      }
    }

    // Si ningún botón está deshabilitado, todos los médicos tienen ambas opciones — válido
  });

  test("TEST 10 — médico solo consultorio privado no aparece en Clínica Virtual", async ({ page }) => {
    // El médico de test tiene oculto_clinica = true, no debe aparecer en el listado
    const nombreMedico = page.locator(`text=${MEDICO_TEST.nombre}`);
    await expect(nombreMedico).not.toBeVisible();

    // La grilla no tiene link directo al médico de test
    const linkDirecto = page.locator(`a[href*="${MEDICO_TEST.id}"]`);
    await expect(linkDirecto).toHaveCount(0);
  });
});
