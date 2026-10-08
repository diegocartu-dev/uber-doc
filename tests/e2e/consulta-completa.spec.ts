// La consulta inmediata de punta a punta, contra PRODUCCIÓN, con cuentas de
// prueba (pedido de Diego, 06/10/2026: "no la pueden pagar los pacientes a la
// prueba"). Recorre los pasos donde se perdían consultas —pedido, aviso al
// profesional, aceptar, pagar, el profesional entra a la sala, el paciente ve
// el cierre— y las ramas: rechazo, retiro del paciente y aceptada sin pagar
// (con el revisor de caídas diciendo que eso es un suceso y NO suena).
//
// · No cobra: las cuentas de prueba simulan el pago.
// · No le escribe a nadie: a las cuentas de prueba no se les manda WhatsApp
//   (lib/whatsapp, esCuentaDePrueba) — la prueba verifica que el aviso quedó
//   registrado como "cuenta_test".
// · Lo que NO cubre: la documentación clínica y el "Finalizar consulta" del
//   profesional (exigen diagnóstico y evolución). El cierre se marca desde la
//   base para verificar la pantalla de cierre del paciente.
//
// Corre solo a pedido: E2E_CONSULTA_COMPLETA=1 npx playwright test consulta-completa --project=chromium
import { test, expect, type Browser, type Page } from "@playwright/test";
import { loginPaciente, loginWithEmail } from "../helpers/auth";
import { MEDICO_TEST, PACIENTES_TEST } from "../fixtures/cuentas-prueba";
import { adminClient, CRON_SECRET, esperarA } from "../helpers/produccion";

const PACIENTE = PACIENTES_TEST[1]; // paciente.test2
const ESPECIALIDAD = "Clínica médica"; // la de la ficha del médico de prueba en la base
const BASE = process.env.PLAYWRIGHT_BASE_URL || "https://uber-doc.vercel.app";
const db = adminClient();

test.describe.configure({ mode: "serial" });
test.skip(process.env.E2E_CONSULTA_COMPLETA !== "1", "Corre solo a pedido (E2E_CONSULTA_COMPLETA=1)");
test.skip(!db, "Falta el acceso a la base (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");

let pacienteUserId = "";

test.beforeAll(async () => {
  const { data: u } = await db!.from("pacientes").select("user_id, es_cuenta_test").eq("es_cuenta_test", true);
  const { data: auth } = await db!.auth.admin.listUsers({ perPage: 1000 });
  pacienteUserId = auth.users.find((x) => x.email === PACIENTE.email)?.id ?? "";
  expect(pacienteUserId, "el paciente de prueba existe").not.toBe("");
  expect((u ?? []).some((p) => p.user_id === pacienteUserId), "y está marcado como cuenta de prueba").toBe(true);
});

test.beforeEach(async () => {
  // Terreno limpio: ninguna atención viva del paciente de prueba ("una atención
  // por vez" lo mandaría a la anterior) y el médico de prueba disponible.
  await db!
    .from("consultas")
    .update({ estado: "cancelada", resuelta_por: "admin", resuelta_at: new Date().toISOString(), resolucion_motivo: "cancelacion_admin" })
    .eq("paciente_id", pacienteUserId)
    .in("estado", ["esperando", "aceptada", "pagada", "en_curso"]);
  await db!.from("medicos").update({ disponible: true }).eq("id", MEDICO_TEST.id);
});

async function contexto(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ permissions: [] });
  return ctx.newPage();
}

/** El paciente pide una consulta inmediata al médico de prueba por la pantalla real. Devuelve el id. */
async function pedir(paciente: Page): Promise<string> {
  await loginPaciente(paciente, PACIENTE.email, PACIENTE.password);
  await paciente.goto(`/triage?medicoId=${MEDICO_TEST.id}&especialidad=${encodeURIComponent(ESPECIALIDAD)}`);
  const casillas = paciente.getByRole("checkbox");
  await expect(casillas.first()).toBeVisible({ timeout: 20_000 });
  // Como un paciente: las casillas se habilitan recién al leer los términos hasta el final.
  const terminos = paciente.locator("div.overflow-y-auto").filter({ hasText: "Introducción y aceptación" });
  await terminos.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event("scroll"));
  });
  for (const c of await casillas.all()) await c.check();
  await paciente.getByRole("button", { name: "Continuar" }).click();
  await paciente.locator("#motivo").fill("Prueba automática de punta a punta. No atender.");
  await paciente.getByRole("button", { name: "Otro", exact: true }).click(); // al menos un síntoma
  await paciente.locator("#tiempo").selectOption({ index: 1 });
  await paciente.getByRole("button", { name: "Entrar a la sala de espera" }).click();
  // D6: el precio se ve ANTES de pedir.
  await expect(paciente.getByText(/Valor de la consulta/)).toBeVisible({ timeout: 10_000 });
  await paciente.getByRole("button", { name: /Sí, es una consulta no urgente/ }).click();
  await paciente.waitForURL(/\/sala-espera\/[0-9a-f-]{36}/, { timeout: 30_000 });
  return paciente.url().match(/sala-espera\/([0-9a-f-]{36})/)![1];
}

async function panelDelMedico(medico: Page): Promise<void> {
  // El cartel "Activá las notificaciones" aparece unos segundos después de entrar
  // y tapa el panel: como el profesional, se cierra con "Ahora no" cada vez que sale.
  await medico.addLocatorHandler(medico.getByText("Activá las notificaciones para atender"), async () => {
    await medico.getByText("Ahora no", { exact: true }).click();
  });
  await loginWithEmail(medico, MEDICO_TEST.email, MEDICO_TEST.password);
}

/** Toca el botón hasta que la base muestre el cambio: un cartel que aparece justo
 *  en el momento del toque se lo come, y un profesional volvería a tocar. */
async function tocarHasta(medico: Page, boton: "Aceptar" | "Rechazar", id: string, estado: string): Promise<void> {
  for (let intento = 0; intento < 3; intento++) {
    await medico.getByRole("button", { name: boton }).first().click({ timeout: 30_000 });
    const f = await esperarA(fila(id), (v) => v?.estado === estado, 10_000);
    if (f?.estado === estado) return;
  }
}

const fila = (id: string) => async () =>
  (await db!.from("consultas").select("estado, aceptada_at, resuelta_por, resolucion_motivo, sala_video_url").eq("id", id).maybeSingle()).data;

test("pedido → aviso al profesional → aceptar → pagar → entra el profesional → cierre", async ({ browser }) => {
  test.setTimeout(240_000);
  const paciente = await contexto(browser);
  const medico = await contexto(browser);

  const id = await pedir(paciente);
  expect((await fila(id)())?.estado).toBe("esperando");

  // El aviso al profesional se ejecutó, y no le escribió a nadie (cuenta de prueba).
  const aviso = await esperarA(
    async () => (await db!.from("whatsapp_envios").select("resultado").eq("consulta_id", id).eq("plantilla", "aceptar_paciente")).data ?? [],
    (v) => v.length > 0,
    20_000
  );
  expect(aviso.map((a) => a.resultado), "aviso al profesional registrado, sin mandar").toContain("cuenta_test");

  await panelDelMedico(medico);
  await tocarHasta(medico, "Aceptar", id, "aceptada");
  const aceptada = await fila(id)();
  expect(aceptada?.estado).toBe("aceptada");
  expect(aceptada?.aceptada_at, "queda el hito de la aceptación").toBeTruthy();

  await paciente.getByRole("button", { name: /Pagá con Mercado Pago/ }).click({ timeout: 30_000 });
  const pagada = await esperarA(fila(id), (f) => f?.estado === "pagada" || f?.estado === "en_curso");
  expect(["pagada", "en_curso"]).toContain(pagada?.estado);

  // Como el paciente: después de pagar confirma su información médica y entra.
  const confirmar = paciente.getByRole("button", { name: "Confirmar y entrar" });
  await expect(confirmar).toBeVisible({ timeout: 30_000 });
  await confirmar.click();

  await medico.goto(`/medico/consulta/${id}/workspace`);
  const conSala = await esperarA(fila(id), (f) => Boolean(f?.sala_video_url), 45_000);
  expect(conSala?.sala_video_url, "el profesional entró: la sala de video existe").toBeTruthy();

  // El cierre se marca desde la base (ver encabezado) y se verifica la pantalla del paciente.
  await db!.from("consultas").update({ estado: "completada", completada_at: new Date().toISOString(), cierre_origen: "admin_forzado" }).eq("id", id);
  await expect(paciente.getByText("Consulta finalizada").first()).toBeVisible({ timeout: 45_000 });
});

test("el profesional rechaza: queda cancelada por él, en el acto", async ({ browser }) => {
  test.setTimeout(180_000);
  const paciente = await contexto(browser);
  const medico = await contexto(browser);
  const id = await pedir(paciente);
  await panelDelMedico(medico);
  await tocarHasta(medico, "Rechazar", id, "cancelada");
  const f = await fila(id)();
  expect(f?.estado).toBe("cancelada");
  expect(f?.resuelta_por).toBe("medico");
});

test("el paciente se retira: queda cancelada por él y el pedido desaparece del panel", async ({ browser }) => {
  test.setTimeout(180_000);
  const paciente = await contexto(browser);
  const medico = await contexto(browser);
  const id = await pedir(paciente);
  await panelDelMedico(medico);
  await expect(medico.getByRole("button", { name: "Aceptar" }).first()).toBeVisible({ timeout: 30_000 });

  await paciente.getByRole("button", { name: "Cancelar solicitud" }).click();
  await paciente.getByRole("button", { name: "Sí, cancelar" }).click();
  const f = await esperarA(fila(id), (v) => v?.estado === "cancelada");
  expect(f?.estado).toBe("cancelada");
  expect(f?.resuelta_por).toBe("paciente");
  await expect(medico.getByRole("button", { name: "Aceptar" })).toHaveCount(0, { timeout: 30_000 });
});

test("aceptada y sin pagar: el plazo la cierra y el revisor dice que es un suceso (no suena)", async ({ browser }) => {
  test.setTimeout(180_000);
  test.skip(!CRON_SECRET, "Falta CRON_SECRET para disparar las tareas automáticas");
  const paciente = await contexto(browser);
  const medico = await contexto(browser);
  const id = await pedir(paciente);
  await panelDelMedico(medico);
  await tocarHasta(medico, "Aceptar", id, "aceptada");
  await expect(paciente.getByRole("button", { name: /Pagá con Mercado Pago/ })).toBeVisible({ timeout: 30_000 });

  // Se adelanta el reloj 11 minutos (plazo: 10 desde que se enteró, D4): la
  // aceptación y el momento en que vio el botón de pago.
  const hace11 = new Date(Date.now() - 11 * 60_000).toISOString();
  await db!.from("consultas").update({ aceptada_at: hace11 }).eq("id", id);
  await db!.from("eventos_funnel").update({ created_at: hace11 }).eq("evento", "pago_vista").eq("metadata->>consultaId", id);
  const cron = await fetch(`${BASE}/api/cron/ci-aceptada-sin-pago`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
  expect(cron.status).toBe(200);
  const f = await esperarA(fila(id), (v) => v?.estado === "cancelada");
  expect(f?.resolucion_motivo).toBe("sin_pago_plazo");

  const r = await fetch(`${BASE}/api/cron/revisar-caidas?prueba=${id}`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
  const cuerpo = (await r.json()) as { revisadas: number; sonaron: number; sucesos: number };
  expect(cuerpo.revisadas).toBe(1);
  expect(cuerpo.sonaron, "vio el botón y no pagó: es un suceso, no suena").toBe(0);
});
