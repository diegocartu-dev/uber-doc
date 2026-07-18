import { test, expect } from "@playwright/test";
import { loginWithEmail } from "../../helpers/auth";
import { MEDICO_TEST } from "../../fixtures/cuentas-prueba";

// Validación del celular al guardar el perfil (GO Diego 17/07): el celular es el
// destino de los avisos WhatsApp al médico; un número inválido se guardaba mudo y
// el aviso moría recién al enviar (solo un log del server). El endpoint ahora
// rechaza con 400 + mensaje accionable y guarda el válido normalizado a +549…
test.describe("Perfil médico — validación de celular", () => {
  test("rechaza celulares inválidos con mensaje claro y acepta el válido", async ({ page }) => {
    await loginWithEmail(page, MEDICO_TEST.email, MEDICO_TEST.password);

    // 9 dígitos (le falta uno) → 400 con mensaje accionable
    const corto = await page.request.post("/api/medico/perfil", {
      data: { celular_personal: "114028914" },
    });
    expect(corto.status()).toBe(400);
    expect((await corto.json()).error).toContain("móvil argentino");

    // Texto sin números → 400
    const texto = await page.request.post("/api/medico/perfil", {
      data: { celular_personal: "no tengo celular" },
    });
    expect(texto.status()).toBe(400);

    // Válido con formato sucio (espacios y guión) → 200, queda normalizado en DB
    const valido = await page.request.post("/api/medico/perfil", {
      data: { celular_personal: "11 4028-9141" },
    });
    expect(valido.status()).toBe(200);
    expect((await valido.json()).ok).toBe(true);
  });
});
