import { test, expect } from "@playwright/test";
import { MEDICO_TEST } from "../fixtures/cuentas-prueba";

/**
 * Smoke de salud: "el registro NO está bloqueado" (médico + paciente).
 *
 * Por qué existe: el 15/06/2026 una env var stale (SIGNUP_WHITELIST_EMAILS)
 * bloqueó el registro de médicos en producción y Sereno NO lo detectó —
 * porque Sereno reutiliza cuentas que YA existen y nunca ejercita un alta nueva.
 * Este check cierra ese agujero: prueba la puerta del registro de punta a punta.
 *
 * Diseño sin crear cuentas: el médico usa la matrícula del médico de prueba
 * (MN / TEST-000, duplicada a propósito). En estado sano el alta pasa la
 * whitelist y todas las validaciones y FRENA recién en el check de duplicado
 * ("matrícula ya registrada") — sin crear cuenta. Si la whitelist (u otra
 * puerta) bloquea, el mensaje es otro y el test falla. El único residuo es un
 * borrador en registros_borrador (email sereno-smoke-…) que sereno-cleanup borra.
 */

test.describe("Registro no bloqueado (smoke de salud)", () => {
  test("médico: la puerta de registro está abierta (whitelist + flag OK)", async ({ page }) => {
    await page.goto("/auth/registro-medico", { waitUntil: "domcontentloaded" });

    // Si registro_medicos_publico está OFF, el layout redirige a /auth/registro-cerrado.
    // Si la beta gate se re-cerró, redirige a /auth/beta-access.
    await expect(page, "el registro médico redirige (flag cerrado o beta gate)").not.toHaveURL(
      /registro-cerrado|beta-access/
    );
    await expect(page.locator("#email")).toBeVisible({ timeout: 15000 });

    // Paso 1 — cuenta
    await page.selectOption("#titulo", "Dr.");
    await page.fill("#nombre_completo", "Sereno Smoke");
    await page.fill("#email", `sereno-smoke-${Date.now()}@docto.com.ar`);
    await page.fill("#password", MEDICO_TEST.password);
    await page.fill("#dni", "12345678");
    await page.getByRole("button", { name: "Siguiente" }).click();

    // Paso 2 — matrícula del médico de prueba (duplicada a propósito → frena el alta)
    await page.selectOption("#tipo_matricula", "MN");
    await page.fill("#numero_matricula", "TEST-000");
    await page.selectOption("#especialidad", { index: 1 });
    await page.fill("#cuit", "20-12345678-9");
    await page.fill("#domicilio", "Smoke 123, CABA");
    await page.getByRole("button", { name: "Siguiente" }).click();

    // Paso 3 — consulta
    await page.fill("#precio_consulta", "15000");
    await page.selectOption("#duracion_consulta", "30");
    await page.selectOption("#modalidad_atencion", "ambas");
    const checks = page.locator('input[type="checkbox"]:visible');
    for (let i = 0; i < (await checks.count()); i++) await checks.nth(i).check();
    await page.locator('button[type="submit"]').click();

    // Veredicto: el alta debe llegar hasta el check de duplicado.
    // Si aparece "beta privada" (whitelist) o "temporalmente cerrado" (flag),
    // el registro está BLOQUEADO y el test falla con el mensaje real a la vista.
    const mensaje = page
      .getByText(/ya está registrada|beta privada|temporalmente cerrado|obligatorios/i)
      .first();
    await expect(mensaje, "el submit del registro médico no devolvió ningún resultado").toBeVisible({
      timeout: 20000,
    });
    await expect(
      mensaje,
      "registro médico BLOQUEADO: se esperaba llegar al check de duplicado ('ya está registrada')"
    ).toHaveText(/ya está registrada/i);
  });

  test("paciente: la puerta de registro está abierta (flag OK)", async ({ page }) => {
    await page.goto("/auth/register", { waitUntil: "domcontentloaded" });

    // Si registro_pacientes_publico está OFF → /auth/registro-cerrado; beta gate → /auth/beta-access.
    await expect(page, "el registro de pacientes redirige (flag cerrado o beta gate)").not.toHaveURL(
      /registro-cerrado|beta-access/
    );
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 15000 });
  });
});
