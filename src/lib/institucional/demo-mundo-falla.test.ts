// SI NO SE PUEDE SABER DE QUÉ MUNDO ES LA FICHA, NO SE FIRMA.
// Runner: node:test + node:assert con tsx (`npm run test:unit`).
//
// ── EL BUG QUE FIJA ──────────────────────────────────────────────────────────
// `cuentasDeDemostracion` devolvía `{medico:false, paciente:false}` ante
// CUALQUIER error de lectura. O sea: un blip de la base durante una reunión
// congelaba el nombre real del participante y su DNI adentro de
// `firma_digital.identidad` —que entra al hash, lo retiene `firma_logs` por FK
// y lo sirve una página pública— para siempre. Y el incidente entero vivía en
// un `console.error`.
//
// Este archivo REPRODUCE esa falla (interceptando el fetch de PostgREST) y
// exige el comportamiento nuevo: `null` = "no se pudo saber", y el camino de la
// firma aborta. Mejor no emitir un documento que emitir uno con PII que después
// no hay forma de sacar.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** El archivo sin comentarios: misma disciplina que `demo-aislamiento.test.ts`. */
function fuente(ruta: string): string {
  return readFileSync(resolve(process.cwd(), ruta), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Corre `fn` con la instancia en modo institucional y con el fetch de PostgREST
 * intervenido. Deja todo como estaba al salir: el resto de la suite corre en
 * B2C y no puede heredar ni el flag ni el fetch.
 */
async function conInstanciaInstitucional<T>(
  fetchFalso: typeof globalThis.fetch,
  fn: () => Promise<T>
): Promise<T> {
  const previos = {
    inst: process.env.INSTITUCIONAL,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    fetch: globalThis.fetch,
  };
  process.env.INSTITUCIONAL = "true";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://instancia.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-de-mentira";
  globalThis.fetch = fetchFalso;
  try {
    return await fn();
  } finally {
    if (previos.inst === undefined) delete process.env.INSTITUCIONAL;
    else process.env.INSTITUCIONAL = previos.inst;
    if (previos.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previos.url;
    if (previos.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previos.key;
    globalThis.fetch = previos.fetch;
  }
}

/** PostgREST devolviendo 500: el "blip de la base" del enunciado. */
const FETCH_QUE_FALLA: typeof globalThis.fetch = async () =>
  new Response(JSON.stringify({ message: "server error" }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });

/** PostgREST devolviendo una ficha del padrón real (sin `demo_sesion_id`). */
const FETCH_QUE_ANDA: typeof globalThis.fetch = async () =>
  new Response(JSON.stringify({ demo_sesion_id: null }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

test("ante un error de lectura, el mundo de la ficha es `null` y NO se inventa", async () => {
  const { cuentasDeDemostracion } = await import("@/lib/institucional/demo");
  const res = await conInstanciaInstitucional(FETCH_QUE_FALLA, () =>
    cuentasDeDemostracion({ medicoId: "00000000-0000-0000-0000-000000000001" })
  );
  assert.equal(
    res,
    null,
    "volvió el fail-open: ante un error de lectura se responde 'no es demo' y el nombre real " +
      "del participante queda congelado para siempre en un registro que no se puede borrar"
  );
});

test("cuando la lectura anda, la respuesta sigue siendo la de siempre", async () => {
  const { cuentasDeDemostracion } = await import("@/lib/institucional/demo");
  const res = await conInstanciaInstitucional(FETCH_QUE_ANDA, () =>
    cuentasDeDemostracion({ medicoId: "00000000-0000-0000-0000-000000000001" })
  );
  assert.deepEqual(res, { medico: false, paciente: false });
});

test("en B2C nunca es `null`: el camino de la firma no cambia ni un paso", async () => {
  // El gate de modo corta antes de tocar la base, así que ni siquiera hace falta
  // un fetch. Es lo que garantiza que el fail-closed sea un delta institucional.
  const previo = process.env.INSTITUCIONAL;
  delete process.env.INSTITUCIONAL;
  try {
    const { cuentasDeDemostracion } = await import("@/lib/institucional/demo");
    const res = await cuentasDeDemostracion({ medicoId: "x", pacienteId: "y" });
    assert.deepEqual(res, { medico: false, paciente: false });
  } finally {
    if (previo !== undefined) process.env.INSTITUCIONAL = previo;
  }
});

test("los tres lugares que preguntan el mundo abortan si la respuesta es `null`", () => {
  const identidad = fuente("src/lib/firma/identidad.ts");
  assert.match(
    identidad,
    /const demo = await cuentasDeDemostracion\([\s\S]{0,80}?\);\s*\n\s*if \(!demo\) return null;/,
    "construirIdentidadDocumento volvió a firmar sin saber de qué mundo es la ficha"
  );

  const documento = fuente("src/lib/firma/documento.ts");
  assert.match(
    documento,
    /const demo = await cuentasDeDemostracion\(\{ medicoId: doc\.medico_id \}\);\s*\n\s*if \(!demo\) \{/,
    "sellarDocumento volvió a decidir sola si guarda la IP y el user-agent del participante"
  );
  assert.match(
    documento,
    /const mundo = await cuentasDeDemostracion\(\{ medicoId \}\);\s*\n\s*if \(!mundo\) return null;/,
    "snapshotFirmante volvió a elegir un nombre sin saber cuál corresponde"
  );

  // Y el orden importa: en `sellarDocumento` la pregunta va ANTES del UPDATE de
  // `documentos`. Preguntarla después obliga a elegir entre revertir o inventar.
  const iPregunta = documento.indexOf("cuentasDeDemostracion({ medicoId: doc.medico_id })");
  const iUpdate = documento.indexOf('.update({ firma_digital: firmaDigital })');
  assert.ok(iPregunta > 0 && iUpdate > 0, "cambió la forma de sellarDocumento: revisá este test");
  assert.ok(
    iPregunta < iUpdate,
    "la pregunta por el mundo volvió DESPUÉS de escribir la firma: ahí ya no se puede abortar limpio"
  );
});

test("el rastro del incidente dice qué se abortó y no lleva nombres", () => {
  const codigo = readFileSync(resolve(process.cwd(), "src/lib/institucional/demo.ts"), "utf8");
  const i = codigo.indexOf("export async function cuentasDeDemostracion");
  assert.ok(i > 0, "cambió el nombre de cuentasDeDemostracion: revisá este test");
  // Hasta el próximo `export` de nivel superior (o el final del archivo): el
  // corte por `\n}` se comía la función en el cierre del objeto de parámetros.
  const desde = codigo.slice(i);
  const fin = desde.indexOf("\nexport ", 1);
  const cuerpo = fin === -1 ? desde : desde.slice(0, fin);
  assert.match(cuerpo, /FIRMA-ABORTADA/, "el log dejó de decir que se abortó una firma");
  assert.ok(
    !/nombre_completo|nombre:/.test(cuerpo),
    "el log del incidente empezó a llevar nombres: los logs también se leen"
  );
});
