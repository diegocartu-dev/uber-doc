import { test, expect } from "@playwright/test";

/**
 * ¿La puerta de entrada está abierta? — para médicos Y para pacientes.
 *
 * POR QUÉ EXISTE (decisión Diego, 10/08/2026: "es vital, para médicos y
 * pacientes"). El registro se rompió al menos cuatro veces y NINGUNA la detectó
 * el CI — las cuatro las supimos por reclamos, días después:
 *   · 15/06 — una env var vieja (`SIGNUP_WHITELIST_EMAILS`) tapó el registro de
 *     médicos. La pantalla cargaba perfecto; el "no" aparecía recién al enviar.
 *   · 01/08 — fotos de más de 4,5 MB devolvían 413.
 *   · jul   — la trampa del tope de 2 MB en la firma.
 *   · jul   — un cartel de error tapaba la pantalla de éxito.
 * Cada día con la puerta cerrada es oferta y demanda que no vuelve.
 *
 * ─── LA IDEA CENTRAL, LEER ANTES DE TOCAR ────────────────────────────────────
 *
 * Cargar la pantalla NO ALCANZA para el médico. Los dos gates que lo frenan
 * —el feature flag `registro_medicos_publico` y la whitelist de mails— viven en
 * la SERVER ACTION y solo se disparan AL ENVIAR EL FORMULARIO
 * (`src/app/auth/registro-medico/actions.ts`). Un test que solo abriera la
 * página habría pasado en verde durante toda la caída del 15/06.
 *
 * Pero enviar el formulario de verdad crearía una cuenta real: el preview y
 * producción comparten el mismo Supabase. La salida está en el orden de las
 * validaciones de la propia action, que es (exactamente este):
 *
 *    1. flag `registro_medicos_publico` → "temporalmente cerrado"
 *    2. rate limit                      → "Demasiados intentos"
 *    3. whitelist de mails              → "Docto está en beta privada"
 *    4. campos vacíos
 *    5. formato de email
 *    6. contraseña de menos de 8
 *    7. email YA REGISTRADO             → "Ya tenés una cuenta"   ← se frena ACÁ
 *    8. signUp  ← recién acá se crearía la cuenta
 *
 * Se envía el formulario con el mail de la CUENTA DE PRUEBA, que ya existe. La
 * petición ATRAVIESA los dos gates, llega al paso 7 y muere ahí, SIN CREAR NADA
 * ni mandar un mail. Y es un camino real de usuario: es lo que le pasa a
 * cualquiera que intenta registrarse dos veces.
 *
 * El mensaje que vuelve dice qué puerta nos frenó:
 *    "ya tenés una cuenta"   → LA PUERTA ESTÁ ABIERTA (cruzamos los gates)
 *    "beta privada"          → la whitelist está bloqueando (el bug del 15/06)
 *    "temporalmente cerrado" → el feature flag está apagado
 *
 * Por qué NO se usa el atajo de mandar una contraseña corta: los inputs tienen
 * `minLength={8}`, así que el navegador frena el envío y la action ni se entera.
 * Probado: el test quedaba esperando un error que nunca llegaba.
 *
 * SI ALGUIEN AGREGA UNA VALIDACIÓN NUEVA ANTES DEL PASO 7, ESTE TEST FALLA. Eso
 * es correcto: significa que hay una puerta nueva y hay que decidir a conciencia
 * si debe estar ahí.
 *
 * LÍMITE CONOCIDO: si algún día se vuelve a setear `SIGNUP_WHITELIST_EMAILS` y
 * la lista INCLUYE este mail de prueba, el test pasaría en verde con el registro
 * cerrado para todos los demás. Cualquier otro mail de la lista lo detectaría.
 * Si se re-activa esa variable, revisar este test.
 *
 * El paciente es más simple: su gate (`registro_pacientes_publico`) vive en el
 * layout y redirige al cargar, así que abrir la pantalla ya lo prueba.
 *
 * Ninguno de estos tests crea una cuenta, ni manda un mail, ni deja una fila.
 */

// Cuenta de prueba, que YA EXISTE: es lo que hace que la action frene en el
// paso 7 en vez de crear a alguien.
const MAIL_QUE_YA_EXISTE = "medico.test@docto.com.ar";
// Válida para el navegador (8+); nunca se usa para crear nada.
const PASSWORD_VALIDA = "SmokeTest2026";

test.describe("La puerta de entrada está abierta", () => {
  test("un médico nuevo puede llegar al formulario y enviarlo", async ({ page }) => {
    const respuesta = await page.goto("/auth/registro-medico");

    // Beta gate con `BETA_PASSWORD` vacía = redirecciones en loop y sitio caído.
    // Un 200 con el formulario a la vista descarta las dos cosas.
    expect(respuesta?.status(), "la pantalla de registro no respondió 200").toBeLessThan(400);
    await expect(page).toHaveURL(/\/auth\/registro-medico/);

    await expect(
      page.locator("#nombre_completo"),
      "no se ve el formulario de registro (¿beta gate, o pantalla de contraseña?)"
    ).toBeVisible({ timeout: 15_000 });

    await page.locator("#nombre_completo").fill("Smoke Test");
    await page.locator("#email").fill(MAIL_QUE_YA_EXISTE);
    await page.locator("#password").fill(PASSWORD_VALIDA);
    await page.locator("#password_confirmar").fill(PASSWORD_VALIDA);
    await page.getByRole("button", { name: "Crear cuenta" }).click();

    // La action responde por el mensaje de error de la pantalla. Se espera al
    // texto y no a un selector genérico: es el texto lo que dice qué puerta nos
    // frenó.
    const aviso = page.getByText(/ya ten[eé]s una cuenta|beta privada|temporalmente cerrado|intentos/i);
    await expect(aviso, "la action no respondió nada").toBeVisible({ timeout: 20_000 });
    const texto = (await aviso.innerText()).toLowerCase();

    expect(
      texto,
      "EL REGISTRO DE MÉDICOS ESTÁ CERRADO: la whitelist SIGNUP_WHITELIST_EMAILS " +
        "está bloqueando el alta. Es exactamente la caída del 15/06/2026. " +
        "Revisar esa env var en Vercel."
    ).not.toContain("beta privada");

    expect(
      texto,
      "EL REGISTRO DE MÉDICOS ESTÁ CERRADO: el feature flag `registro_medicos_publico` " +
        "está apagado. Revisar en /admin/configuracion."
    ).not.toContain("temporalmente cerrado");

    // El rate limit es por IP y el CI puede compartirla entre corridas; no es un
    // "registro cerrado", así que no rompe el gate — pero se avisa.
    if (texto.includes("intentos")) {
      test.info().annotations.push({
        type: "warning",
        description: "Rate limit por IP en el runner: el gate no se pudo probar del todo.",
      });
      return;
    }

    // Llegamos hasta el chequeo de cuenta existente: los dos gates quedaron atrás
    // y la action corrió entera.
    expect(texto, "la action frenó antes de llegar al alta").toMatch(/ya ten[eé]s una cuenta/);
  });

  test("un paciente nuevo puede llegar al formulario", async ({ page }) => {
    const respuesta = await page.goto("/auth/register");

    expect(respuesta?.status(), "la pantalla de registro no respondió 200").toBeLessThan(400);

    // El flag `registro_pacientes_publico` vive en el layout y redirige al
    // cargar; el beta gate haría lo mismo. Seguir en /auth/register descarta
    // las dos.
    await expect(
      page,
      "el registro de pacientes redirige: ¿flag `registro_pacientes_publico` apagado, o beta gate?"
    ).toHaveURL(/\/auth\/register(\?|$)/);

    await expect(
      page.getByRole("textbox", { name: /email/i }).first(),
      "no se ve el formulario de registro de pacientes"
    ).toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByRole("button", { name: /crear cuenta|registrarme|continuar/i }).first(),
      "no hay botón para crear la cuenta"
    ).toBeEnabled();
  });
});
