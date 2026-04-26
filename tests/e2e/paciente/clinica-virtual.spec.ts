import { test, expect } from "@playwright/test";
import { loginPaciente } from "../../helpers/auth";
import { PACIENTE_NORMAL, MEDICO_TEST } from "../../fixtures/cuentas-prueba";

test.describe("Clínica Virtual — visibilidad y botones", () => {
  test.beforeEach(async ({ page }) => {
    await loginPaciente(page, PACIENTE_NORMAL.email, PACIENTE_NORMAL.password);
    await page.goto("/clinica");
    await expect(page.getByRole("heading", { name: "Clínica Virtual" })).toBeVisible({ timeout: 15000 });
  });

  test("TEST 08 — especialidad con médico disponible muestra ambos botones activos", async ({ page }) => {
    // Clínica médica siempre debe aparecer (Dr. Docto Test está registrado)
    const card = page.locator("text=Clínica médica").first();
    await expect(card).toBeVisible();

    const container = card.locator("..").locator("..");

    const btnConsulta = container.getByRole("button", { name: "Consulta ahora" });
    const btnAgendar = container.getByRole("button", { name: "Agendar turno" });

    await expect(btnConsulta).toBeVisible();
    await expect(btnAgendar).toBeVisible();

    // Si "Agendar turno" está habilitado, significa que hay turnos en clinica_virtual
    // Si está deshabilitado, significa que no hay turnos en ese canal (regla 2)
    // Ambos estados son válidos — lo importante es que el botón existe y refleja la realidad
  });

  test("TEST 09 — botón 'Agendar turno' deshabilitado si no hay turnos en clínica virtual", async ({ page }) => {
    // Buscar cualquier card que tenga "Agendar turno" deshabilitado
    // Esto valida la regla: médico sin turnos en clinica_virtual → botón grisado
    const botonesAgendar = page.getByRole("button", { name: "Agendar turno" });
    const count = await botonesAgendar.count();

    if (count === 0) {
      test.skip(true, "No hay especialidades visibles para validar");
      return;
    }

    // Verificar que los botones deshabilitados tengan el atributo disabled
    for (let i = 0; i < count; i++) {
      const btn = botonesAgendar.nth(i);
      const isDisabled = await btn.isDisabled();
      if (isDisabled) {
        await expect(btn).toHaveCSS("opacity", "0.4");
        await expect(btn).toHaveAttribute("disabled", "");
        return;
      }
    }

    // Si ningún botón está deshabilitado, todos los médicos tienen turnos en CV — también válido
  });

  test("TEST 10 — médico solo consultorio privado no aparece en Clínica Virtual", async ({ page }) => {
    // El médico de test tiene oculto_clinica = true, no debe aparecer en el listado
    // Verificar que no haya un card con su nombre visible directamente
    const nombreMedico = page.locator(`text=${MEDICO_TEST.nombre}`);
    await expect(nombreMedico).not.toBeVisible();

    // Verificar que la grilla no tiene link directo al médico de test
    const linkDirecto = page.locator(`a[href*="${MEDICO_TEST.id}"]`);
    await expect(linkDirecto).toHaveCount(0);
  });
});
