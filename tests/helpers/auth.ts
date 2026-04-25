import { type Page } from "@playwright/test";

export async function loginWithEmail(page: Page, email: string, password: string) {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL("**/dashboard**", { timeout: 15000 });
}

export async function loginPaciente(page: Page, email: string, password: string) {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 15000 });
}
