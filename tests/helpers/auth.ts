import { type Page } from "@playwright/test";

export async function loginWithEmail(page: Page, email: string, password: string) {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  // "commit" (no "networkidle"): basta con que la navegación post-login cambie la
  // URL. El dashboard es force-dynamic + realtime y nunca queda "idle" (sobre todo
  // en un preview frío) → networkidle hacía timeout. Las aserciones del test ya
  // tienen sus propias esperas de visibilidad.
  await page.waitForURL("**/dashboard**", { timeout: 30000, waitUntil: "commit" });
}

export async function loginPaciente(page: Page, email: string, password: string) {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 30000, waitUntil: "commit" });
}
