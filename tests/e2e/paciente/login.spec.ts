import { test, expect } from "@playwright/test";

test.describe("Login paciente", () => {
  test("TEST 03 — Login Google OAuth: botón visible y funcional", async ({ page }) => {
    await page.goto("/auth/login");

    const googleButton = page.getByRole("button", { name: /continuar con google/i });
    await expect(googleButton).toBeVisible();
    await expect(googleButton).toBeEnabled();

    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Contraseña")).toBeVisible();
    await expect(page.getByRole("button", { name: /ingresar/i })).toBeVisible();

    const registerLink = page.getByRole("link", { name: /creá una acá/i });
    await expect(registerLink).toBeVisible();
  });
});
