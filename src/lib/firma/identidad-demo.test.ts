// EL SELLO DE UN DOCUMENTO DE DEMOSTRACIÓN NO GUARDA NADA DE LA PERSONA.
// Runner: node:test + node:assert con tsx (`npm run test:unit`).
//
// ── POR QUÉ ESTE ARCHIVO EXISTE ──────────────────────────────────────────────
// `firma_digital.identidad` es el único registro de la demo que NO se puede
// borrar: entra al hash RSA, lo retiene `firma_logs` por FK (append-only) y lo
// sirve `/verificar/{id}`, una página pública y sin auth, bajo el mismo UUID
// que quedó impreso en el papel proyectado y adentro del QR que la sala
// fotografió.
//
// La primera versión del fix anonimizó nombre, DNI y CUIL… y dejó pasar la
// FECHA DE NACIMIENTO y el SEXO reales del participante. Eso es dato de salud
// identificante, y encima la limpieza SÍ borra esas columnas de la fila viva:
// el dato terminaba existiendo únicamente donde no se puede borrar.
//
// Por eso el test no comprueba tres campos: recorre TODOS. Un campo nuevo en el
// bloque del paciente que alguien agregue sin pensarlo se pone rojo acá.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  pacienteCongeladoParaDemo,
  pacienteCongeladoReal,
  type IdentidadPaciente,
} from "@/lib/firma/identidad";
import { NOMBRE_UTILERIA } from "@/lib/institucional/demo";

/** Una fila de `pacientes` con TODO cargado. Datos inventados, obviamente. */
const PACIENTE_CON_TODO = {
  nombre_completo: "Nombre Apellido",
  dni: "30111222",
  cuil: "20-30111222-3",
  sexo_dni: "masculino",
  fecha_nacimiento: "1980-05-05",
  tiene_cobertura: true,
  nro_afiliado: "AFIL-999",
  plan_obra_social: "Plan Superior",
};

test("de una cuenta de demostración no se congela NINGÚN dato del paciente", () => {
  const congelado = pacienteCongeladoParaDemo();

  // El nombre es el único campo con contenido, y es de utilería.
  assert.equal(congelado.paciente_nombre, NOMBRE_UTILERIA.paciente);

  // Todos los demás: vacíos. Se recorren por clave para que un campo nuevo no
  // se cuele sin decisión.
  const resto = Object.entries(congelado).filter(([k]) => k !== "paciente_nombre");
  assert.ok(resto.length >= 8, "el bloque del paciente se achicó: revisá este test");
  for (const [clave, valor] of resto) {
    assert.ok(
      valor === null || valor === "" || valor === false,
      `${clave} se congela con un valor real ("${String(valor)}") adentro de un registro que ` +
        `no se puede borrar y que sirve una página pública`
    );
  }
});

test("ningún dato real del paciente sobrevive al pasar por el bloque de demo", () => {
  // La prueba directa: se arma el bloque REAL con la fila completa y el de demo,
  // y se exige que ningún valor del real aparezca en el de demo.
  const real = pacienteCongeladoReal(PACIENTE_CON_TODO, "Obra Social Ejemplo");
  const demo = pacienteCongeladoParaDemo();

  const valoresReales = Object.values(real)
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .map((v) => v.toLowerCase());
  const serializadoDemo = JSON.stringify(demo).toLowerCase();

  for (const valor of valoresReales) {
    assert.ok(
      !serializadoDemo.includes(valor),
      `el bloque de demostración todavía lleva un dato real del paciente ("${valor}")`
    );
  }

  // Y las dos que se habían quedado, dichas por su nombre para que el día que
  // vuelvan el mensaje del test sea el del bug real.
  assert.equal(demo.paciente_fecha_nacimiento, null, "la fecha de nacimiento volvió al sello");
  assert.equal(demo.paciente_sexo_dni, null, "el sexo volvió al sello");
});

test("el paciente REAL sigue congelando exactamente lo que el PDF imprime", () => {
  // La contracara: esto es el B2C y no puede perder un solo dato. Un documento
  // que no congela lo que imprime vuelve a afirmar integridad sobre datos vivos.
  const real: IdentidadPaciente = pacienteCongeladoReal(PACIENTE_CON_TODO, "Obra Social Ejemplo");
  assert.equal(real.paciente_nombre, PACIENTE_CON_TODO.nombre_completo);
  assert.equal(real.paciente_dni, PACIENTE_CON_TODO.dni);
  assert.equal(real.paciente_cuil, PACIENTE_CON_TODO.cuil);
  assert.equal(real.paciente_sexo_dni, PACIENTE_CON_TODO.sexo_dni);
  assert.equal(real.paciente_fecha_nacimiento, PACIENTE_CON_TODO.fecha_nacimiento);
  assert.equal(real.paciente_tiene_cobertura, true);
  assert.equal(real.paciente_obra_social, "Obra Social Ejemplo");
  assert.equal(real.paciente_nro_afiliado, PACIENTE_CON_TODO.nro_afiliado);
  assert.equal(real.paciente_plan_obra_social, PACIENTE_CON_TODO.plan_obra_social);
});

test("el snapshot elige el bloque entero, no campo por campo", () => {
  // Lo que se rompió la primera vez fue justamente esto: nueve ternarios
  // `demo.paciente ? … : …` sueltos, de los que cinco se olvidaron. Con el
  // bloque elegido de una sola vez, olvidarse de uno deja de ser posible.
  const codigo = readFileSync(resolve(process.cwd(), "src/lib/firma/identidad.ts"), "utf8");
  assert.match(
    codigo,
    /\.\.\.\(demo\.paciente\s*\n?\s*\?\s*pacienteCongeladoParaDemo\(\)\s*\n?\s*:\s*pacienteCongeladoReal\(/,
    "construirIdentidadDocumento volvió a decidir campo por campo qué anonimiza del paciente"
  );
});
