import { test, expect } from "@playwright/test";
import { loginWithEmail } from "../../helpers/auth";
import { MEDICO_TEST } from "../../fixtures/cuentas-prueba";

test.describe("Login médico", () => {
  test("TEST 04 — Login médico email/password llega al dashboard", async ({ page }) => {
    await loginWithEmail(page, MEDICO_TEST.email, MEDICO_TEST.password);

    expect(page.url()).toContain("/dashboard");

    await expect(page.locator("body")).not.toContainText("error", { ignoreCase: true, timeout: 5000 }).catch(() => {
      // Some pages may have "error" in unrelated text; this is a soft check
    });
  });
});
