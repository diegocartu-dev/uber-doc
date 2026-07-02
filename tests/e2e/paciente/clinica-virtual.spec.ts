import { test, expect } from "@playwright/test";
import { loginPaciente } from "../../helpers/auth";
import { PACIENTE_NORMAL } from "../../fixtures/cuentas-prueba";

// Post ruteo por jurisdicción (PR #249): /clinica muestra PRIMERO la pantalla de provincia
// (siempre) y luego el LISTADO plano de médicos habilitados. Reemplaza la grilla de
// especialidades. El beforeEach navega la pantalla de provincia y aterriza en el listado.
test.describe("Clínica Virtual — ruteo por jurisdicción", () => {
  test.beforeEach(async ({ page }) => {
    await loginPaciente(page, PACIENTE_NORMAL.email, PACIENTE_NORMAL.password);
    await page.goto("/clinica");

    // Pantalla de provincia (siempre primero). Esperar que cargue en cualquiera de sus dos
    // variantes, y branchear sin carreras: estado A (confirmar) → abrir la lista con
    // "Cambiar provincia"; estado B (elegir) → la lista ya está. Luego elegir CABA (siempre
    // con oferta) y confirmar.
    const headingA = page.getByRole("heading", { name: "Confirmá tu jurisdicción" });
    const headingB = page.getByRole("heading", { name: "¿En qué provincia estás?" });
    await expect(headingA.or(headingB)).toBeVisible({ timeout: 15000 });
    if (await headingA.isVisible()) {
      await page.getByRole("button", { name: "Cambiar provincia" }).click();
    }
    await page.getByRole("button", { name: "CABA", exact: true }).click();
    await page.getByRole("button", { name: "Ver médicos habilitados" }).click();

    // Aterriza en el listado (con médicos) o en el estado vacío (captura de lead).
    await expect(
      page.getByTestId("listado-medicos").or(page.getByTestId("listado-vacio"))
    ).toBeVisible({ timeout: 15000 });
  });

  test("TEST 08 — el listado ofrece médicos accionables o un estado claro (o captura de lead si vacío)", async ({ page }) => {
    // Estado vacío (provincia sin oferta): debe ser captura de lead, no un muro.
    if ((await page.getByTestId("listado-vacio").count()) > 0) {
      await expect(page.getByText(/Todavía no tenemos médicos/)).toBeVisible();
      await expect(page.getByPlaceholder("tu@email.com")).toBeVisible();
      return;
    }

    // Cada fila de médico ofrece una acción (Consulta ahora / Agendar turno) o un estado
    // de disponibilidad claro. Robusto a datos en vivo.
    const filas = page.getByTestId("medico-fila");
    const count = await filas.count();
    expect(count).toBeGreaterThan(0);

    const estadosClaros = ["No disponible ahora", "Atendiendo un turno ahora", "Próximo turno"];
    for (let i = 0; i < count; i++) {
      const fila = filas.nth(i);
      const btnConsulta = fila.getByRole("button", { name: "Consulta ahora" });
      const linkTurno = fila.getByRole("link", { name: "Agendar turno" });

      let accionable = false;
      if ((await btnConsulta.count()) > 0 && !(await btnConsulta.first().isDisabled())) accionable = true;
      if ((await linkTurno.count()) > 0) accionable = true; // el link de turno siempre navega
      if (accionable) continue;

      const texto = (await fila.innerText()).trim();
      expect(
        estadosClaros.some((c) => texto.includes(c)),
        `Fila sin acción habilitada debe mostrar un estado claro. Contenido:\n${texto}`
      ).toBeTruthy();
    }
  });

  test("TEST 09 — un médico no reservable ahora muestra un estado claro en su fila", async ({ page }) => {
    if ((await page.getByTestId("listado-vacio").count()) > 0) return; // vacío, nada que validar

    const filas = page.getByTestId("medico-fila");
    const count = await filas.count();
    const estadosClaros = ["No disponible ahora", "Atendiendo un turno ahora", "Próximo turno"];
    for (let i = 0; i < count; i++) {
      const fila = filas.nth(i);
      const btn = fila.getByRole("button", { name: "Consulta ahora" });
      if ((await btn.count()) === 0 || !(await btn.first().isDisabled())) continue;
      const texto = (await fila.innerText()).trim();
      expect(
        estadosClaros.some((c) => texto.includes(c)),
        `"Consulta ahora" deshabilitada sin estado claro en la fila. Contenido:\n${texto}`
      ).toBeTruthy();
    }
  });

  test("TEST 10 — un médico oculto/suspendido no se filtra al listado", async ({ page }) => {
    // "Dr Prueba 1" está oculto_clinica=true + suspendido + no verificado: el SELECT de la
    // clínica (verificado ∧ aprobado ∧ !oculto_clinica) lo excluye, así que NUNCA debe
    // aparecer en el listado. Guarda la regresión del filtro end-to-end.
    // (Nota: "Dr. Docto Test" ya NO sirve para este invariante — hoy es un médico visible y
    //  reservable, usado en onboarding.spec para reservar turnos.)
    await expect(page.getByText("Dr Prueba 1", { exact: false })).not.toBeVisible();
  });
});
