import { test, expect } from "@playwright/test";
import { loginWithEmail } from "../../helpers/auth";
import { MEDICO_TEST } from "../../fixtures/cuentas-prueba";

const MOCK_DASHBOARD_ESTADO_BASE = {
  consultas_en_curso: [],
  turnos_espera: [],
  disponible: true,
  turnos_activos_hoy: 0,
  timestamp: Date.now(),
};

const PACIENTE_ESPERANDO = {
  id: "test-consulta-1",
  especialidad: "Clínica Médica",
  estado: "esperando",
  created_at: new Date(Date.now() - 3 * 60000).toISOString(),
  paciente_nombre: "Juan López",
  paciente_tabla_id: "pac-1",
  motivo_consulta: "Dolor de cabeza",
  fecha_nacimiento: "1990-05-15",
  canal_origen: "web",
};

const CONSULTA_EN_CURSO = {
  id: "test-consulta-activa",
  especialidad: "Clínica Médica",
  estado: "en_curso",
  paciente_nombre: "María García",
  paciente_tabla_id: "pac-2",
  sala_video_url: "consulta-test-consulta-activa",
  motivo_consulta: "Control",
  sintomas: null,
  created_at: new Date(Date.now() - 10 * 60000).toISOString(),
  fecha_nacimiento: "1985-03-20",
  canal_origen: "web",
};

test.describe("Notificación proactiva al médico", () => {
  test.beforeEach(async ({ page }) => {
    await loginWithEmail(page, MEDICO_TEST.email, MEDICO_TEST.password);
  });

  test("TEST 1: paciente entra a sala de espera → badge aparece en header", async ({ page }) => {
    let pollCount = 0;

    await page.route("**/api/medico/dashboard-estado", (route) => {
      pollCount++;
      if (pollCount <= 1) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ...MOCK_DASHBOARD_ESTADO_BASE,
            consultas_pendientes: [],
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...MOCK_DASHBOARD_ESTADO_BASE,
          consultas_pendientes: [PACIENTE_ESPERANDO],
        }),
      });
    });

    await page.goto("/dashboard");
    const badge = page.locator('[data-testid="badge-esperando"]');
    await expect(badge).toBeVisible({ timeout: 15000 });
    await expect(badge).toHaveText("1");
  });

  test("TEST 2: médico en videollamada + paciente entra → solo badge, sin popup ni sonido", async ({ page }) => {
    let pollCount = 0;

    await page.route("**/api/medico/dashboard-estado", (route) => {
      pollCount++;
      const base = {
        ...MOCK_DASHBOARD_ESTADO_BASE,
        consultas_en_curso: [CONSULTA_EN_CURSO],
      };
      if (pollCount <= 1) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ...base, consultas_pendientes: [] }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...base, consultas_pendientes: [PACIENTE_ESPERANDO] }),
      });
    });

    await page.goto("/dashboard");
    const badge = page.locator('[data-testid="badge-esperando"]');
    await expect(badge).toBeVisible({ timeout: 15000 });
    await expect(badge).toHaveText("1");

    const popup = page.locator("text=está esperando");
    await expect(popup).not.toBeVisible({ timeout: 3000 });
  });
});
