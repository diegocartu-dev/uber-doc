import { test, expect } from "@playwright/test";
import { loginPaciente } from "../../helpers/auth";
import { PACIENTE_NORMAL } from "../../fixtures/cuentas-prueba";

// Verificación empírica del atajo "sin CI → próximo turno" (28/07) contra el
// entorno real. NO concreta ninguna reserva (en prod ocuparía el slot de un
// médico real): verifica que cada eslabón esté conectado y frena antes de
// confirmar. Robusto a datos vivos: si hay CI en línea, el popup NO debe
// aparecer y se verifica el camino de CI en su lugar.

test.describe("Atajo sin CI → próximo turno", () => {
  test("TEST 11 — botón con fecha adentro + popup conectado de punta a punta", async ({ page }) => {
    await loginPaciente(page, PACIENTE_NORMAL.email, PACIENTE_NORMAL.password);
    await page.goto("/clinica");

    // Pantalla de provincia primero (mismo recorrido que clinica-virtual.spec).
    const headingA = page.getByRole("heading", { name: "Confirmá tu jurisdicción" });
    const headingB = page.getByRole("heading", { name: "¿En qué provincia estás?" });
    await expect(headingA.or(headingB)).toBeVisible({ timeout: 15000 });
    if (await headingA.isVisible()) {
      await page.getByRole("button", { name: "Cambiar provincia" }).click();
    }
    await page.getByRole("button", { name: "CABA", exact: true }).click();
    await page.getByRole("button", { name: "Ver médicos habilitados" }).click();

    await expect(
      page.getByTestId("medico-fila").first().or(page.getByTestId("listado-vacio"))
    ).toBeVisible({ timeout: 20000 });

    if ((await page.getByTestId("listado-vacio").count()) > 0) {
      test.info().annotations.push({ type: "nota", description: "Listado vacío (lead) — sin filas para verificar" });
      return;
    }

    const dialogTitulo = page.getByText("Sin médicos en consulta inmediata en este momento.");
    const popupVisible = await dialogTitulo.isVisible().catch(() => false);

    // 1. El botón de turno lleva la fecha ADENTRO (si hay algún médico con turnos).
    //    Si hay popup, cerrarlo primero para poder mirar el listado.
    if (popupVisible) {
      await page.getByRole("button", { name: "Buscar otro turno" }).click();
      await expect(dialogTitulo).not.toBeVisible();
    }
    const linksTurno = page.getByRole("link", { name: /Agendar turno/ });
    const nLinks = await linksTurno.count();
    if (nLinks > 0) {
      const textoBoton = (await linksTurno.first().innerText()).replace(/\s+/g, " ");
      expect(textoBoton).toMatch(/Agendar turno (Hoy|Mañana|\w{2,3}\.? \d{1,2} \w{3}\.?) \d{2}:\d{2}/);
    }
    // La línea vieja "Próximo turno:" ya no existe suelta en la fila.
    await expect(page.getByText(/^Próximo turno:/)).toHaveCount(0);

    if (popupVisible) {
      // 2. Popup: recargar para que reaparezca (es una vez por visita) y
      //    verificar copy + SIN precio + navegación del CTA.
      await page.reload();
      // La pantalla de provincia puede reaparecer tras el reload.
      const verMedicos = page.getByRole("button", { name: "Ver médicos habilitados" });
      if (await verMedicos.isVisible({ timeout: 5000 }).catch(() => false)) {
        await verMedicos.click();
      }
      await expect(dialogTitulo).toBeVisible({ timeout: 20000 });
      const dialogo = page.getByRole("dialog");
      await expect(dialogo.getByText(/\$\s?\d/)).toHaveCount(0); // sin precio (decisión Diego)
      await expect(dialogo.getByText(/(Hoy|Mañana|\w{2,3}\.? \d{1,2} \w{3}\.?) \d{2}:\d{2}/)).toBeVisible();

      await dialogo.getByRole("button", { name: "Reservar ese turno" }).click();
      await page.waitForURL(/\/clinica\/[0-9a-f-]+\/turnos/, { timeout: 20000 });
      // La agenda del médico carga (el mismo flujo de reserva ya probado).
      // FRENO ACÁ: no se selecciona ni confirma ningún slot en producción.
      await expect(page.locator("body")).not.toContainText("Error");
    } else {
      // 3. Hay CI en línea: el popup NO debe estar y el camino de CI sigue vivo.
      await expect(dialogTitulo).toHaveCount(0);
      const btnCI = page.getByRole("button", { name: "Consulta ahora" }).first();
      if ((await btnCI.count()) > 0 && !(await btnCI.isDisabled())) {
        await btnCI.click();
        await page.waitForURL(/\/triage/, { timeout: 20000 });
        // FRENO ACÁ: el triage carga; no se avanza al pago.
      }
    }
  });

  test("TEST 12 — rama del popup: provincia sin CI en línea ofrece el próximo turno", async ({ page }) => {
    await loginPaciente(page, PACIENTE_NORMAL.email, PACIENTE_NORMAL.password);
    await page.goto("/clinica");

    const headingA = page.getByRole("heading", { name: "Confirmá tu jurisdicción" });
    const headingB = page.getByRole("heading", { name: "¿En qué provincia estás?" });
    await expect(headingA.or(headingB)).toBeVisible({ timeout: 15000 });
    if (await headingA.isVisible()) {
      await page.getByRole("button", { name: "Cambiar provincia" }).click();
    }
    await page.getByRole("button", { name: "Buenos Aires", exact: true }).click();
    await page.getByRole("button", { name: "Ver médicos habilitados" }).click();
    await expect(
      page.getByTestId("medico-fila").first().or(page.getByTestId("listado-vacio"))
    ).toBeVisible({ timeout: 20000 });

    const dialogTitulo = page.getByText("Sin médicos en consulta inmediata en este momento.");
    if (!(await dialogTitulo.isVisible().catch(() => false))) {
      test.info().annotations.push({ type: "nota", description: "Había CI en línea en Buenos Aires — rama no ejercitable ahora" });
      return;
    }

    const dialogo = page.getByRole("dialog");
    await expect(dialogo.getByText(/\$\s?\d/)).toHaveCount(0); // sin precio (decisión Diego)
    await expect(dialogo.getByText(/(Hoy|Mañana|\w{2,3}\.? \d{1,2} \w{3}\.?) \d{2}:\d{2}/)).toBeVisible();

    // "Buscar otro turno" devuelve al listado.
    await dialogo.getByRole("button", { name: "Buscar otro turno" }).click();
    await expect(dialogTitulo).not.toBeVisible();
    await expect(page.getByTestId("medico-fila").first()).toBeVisible();

    // Reaparece tras recargar (una vez por visita) y el CTA navega a la agenda.
    await page.reload();
    const verMedicos = page.getByRole("button", { name: "Ver médicos habilitados" });
    if (await verMedicos.isVisible({ timeout: 5000 }).catch(() => false)) {
      await verMedicos.click();
    }
    await expect(dialogTitulo).toBeVisible({ timeout: 20000 });
    await page.getByRole("dialog").getByRole("button", { name: "Reservar ese turno" }).click();
    await page.waitForURL(/\/clinica\/[0-9a-f-]+\/turnos/, { timeout: 20000 });
    // FRENO ACÁ: la agenda del médico cargó; no se selecciona ni confirma slot en producción.
    await expect(page.locator("body")).not.toContainText("Error");
  });
});
