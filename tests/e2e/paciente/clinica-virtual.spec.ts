import { test, expect } from "@playwright/test";
import { loginPaciente } from "../../helpers/auth";
import { PACIENTE_NORMAL, MEDICO_TEST } from "../../fixtures/cuentas-prueba";

test.describe("Clínica Virtual — visibilidad y botones", () => {
  test.beforeEach(async ({ page }) => {
    await loginPaciente(page, PACIENTE_NORMAL.email, PACIENTE_NORMAL.password);
    await page.goto("/clinica");
    await expect(page.getByRole("heading", { name: "Clínica Virtual" })).toBeVisible({ timeout: 15000 });
  });

  test("TEST 08 — cada card visible ofrece una acción habilitada o un mensaje claro de no-disponibilidad", async ({ page }) => {
    // Contrato §11 (post-rediseño PR #147 + fix honestidad de estado):
    // La grilla solo muestra especialidades con al menos un médico. Cada card cae
    // en uno de 4 estados de disponibilidad:
    //   - "disponible"  → "Consulta ahora" HABILITADO (hay médico online)
    //   - "espera"      → "Consulta ahora" HABILITADO (hay médico online con cola)
    //   - "programada"  → un solo botón "Agendar turno", HABILITADO
    //   - "sin_medicos" → sin botones, muestra texto "Sin disponibilidad"
    // Invariante: NUNCA existe una card con ambos botones presentes y deshabilitados.
    // Toda card o bien tiene ≥1 botón de acción habilitado, o bien muestra un mensaje
    // claro de no-disponibilidad. Robusto a datos en vivo: no asume cuál de los 4
    // estados tiene cada card.
    const cards = page.locator("[class*='rounded-'][class*='bg-white']").filter({
      has: page.locator("h3"),
    });
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    // Textos que el código muestra como mensaje de no-disponibilidad (GrillaEspecialidades.tsx).
    const mensajesNoDisponibilidad = [
      "Sin disponibilidad",
      "Sin médicos disponibles ahora",
      "Sin turnos disponibles, consultá ahora",
    ];

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const btnConsulta = card.getByRole("button", { name: "Consulta ahora" });
      const btnAgendar = card.getByRole("button", { name: "Agendar turno" });

      const consultaCount = await btnConsulta.count();
      const agendarCount = await btnAgendar.count();

      // ¿Hay al menos un botón de acción HABILITADO en la card?
      let tieneAccionHabilitada = false;
      if (consultaCount > 0 && !(await btnConsulta.first().isDisabled())) {
        tieneAccionHabilitada = true;
      }
      if (agendarCount > 0 && !(await btnAgendar.first().isDisabled())) {
        tieneAccionHabilitada = true;
      }

      if (tieneAccionHabilitada) {
        // Caso normal: la card es accionable. Nada más que verificar.
        continue;
      }

      // Sin acción habilitada → la card DEBE mostrar un mensaje claro de no-disponibilidad.
      // (No puede existir una card con ambos botones presentes y deshabilitados sin mensaje.)
      const textoCard = (await card.innerText()).trim();
      const muestraMensaje = mensajesNoDisponibilidad.some((m) => textoCard.includes(m));
      expect(
        muestraMensaje,
        `Card sin acción habilitada debe mostrar un mensaje de no-disponibilidad. Contenido:\n${textoCard}`
      ).toBeTruthy();
    }
  });

  test("TEST 09 — botones deshabilitados tienen texto explicativo visible (copy §11)", async ({ page }) => {
    // Contrato §11 (post-rediseño): cuando un botón de acción queda deshabilitado,
    // la card muestra una explicación con la copy REAL del componente
    // (GrillaEspecialidades.tsx). La copy vieja "Solo turnos programados" ya no existe.
    //
    // Textos explicativos reales por botón deshabilitado:
    //   "Consulta ahora" deshabilitado → "Sin médicos disponibles ahora, agendá un turno"
    //                                     | "Sin médicos disponibles ahora"
    //   "Agendar turno"  deshabilitado → "Sin turnos disponibles, consultá ahora"
    //
    // Nota: tras el fix de honestidad de estado, una card que renderiza el botón de CI
    // ("disponible"/"espera") siempre tiene "Consulta ahora" habilitado, así que el
    // caso típico de botón deshabilitado es "Agendar turno". El test no asume cuál
    // aparece: valida el invariante para ambos si existen.

    const copyConsultaDeshabilitada = [
      "Sin médicos disponibles ahora, agendá un turno",
      "Sin médicos disponibles ahora",
    ];
    // "Sin turnos disponibles" es el prefijo común (con CI activa el copy suma
    // ", consultá ahora"; con CI global apagada queda solo "Sin turnos disponibles").
    const copyAgendarDeshabilitado = ["Sin turnos disponibles"];

    async function verificarBotonesDeshabilitados(
      nombreBoton: string,
      copysEsperadas: string[]
    ) {
      const botones = page.getByRole("button", { name: nombreBoton });
      const total = await botones.count();
      for (let i = 0; i < total; i++) {
        const btn = botones.nth(i);
        if (!(await btn.isDisabled())) continue;
        // Card contenedora: ancestro con clase rounded- más cercano que tiene el h3.
        const card = page
          .locator("[class*='rounded-'][class*='bg-white']")
          .filter({ has: page.locator("h3") })
          .filter({ has: page.getByRole("button", { name: nombreBoton }) })
          .nth(i);
        const textoCard = (await card.innerText()).trim();
        const tieneCopy = copysEsperadas.some((c) => textoCard.includes(c));
        expect(
          tieneCopy,
          `Botón "${nombreBoton}" deshabilitado sin copy explicativa esperada. ` +
            `Esperaba una de [${copysEsperadas.join(" | ")}]. Contenido de la card:\n${textoCard}`
        ).toBeTruthy();
      }
    }

    await verificarBotonesDeshabilitados("Consulta ahora", copyConsultaDeshabilitada);
    await verificarBotonesDeshabilitados("Agendar turno", copyAgendarDeshabilitado);

    // Si ningún botón está deshabilitado, no hay nada que explicar — válido.
  });

  test("TEST 10 — médico solo consultorio privado no aparece en Clínica Virtual", async ({ page }) => {
    // El médico de test tiene oculto_clinica = true, no debe aparecer en el listado
    const nombreMedico = page.locator(`text=${MEDICO_TEST.nombre}`);
    await expect(nombreMedico).not.toBeVisible();

    // La grilla no tiene link directo al médico de test
    const linkDirecto = page.locator(`a[href*="${MEDICO_TEST.id}"]`);
    await expect(linkDirecto).toHaveCount(0);
  });
});
