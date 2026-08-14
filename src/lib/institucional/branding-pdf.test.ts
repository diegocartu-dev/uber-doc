// El puente entre la config de la institución y el papel que sale impreso.
// Runner: node:test + node:assert con tsx (`npm run test:unit`).

import { test } from "node:test";
import assert from "node:assert/strict";
import { accentEfectivo, brandingParaPDF } from "@/lib/institucional/branding-pdf";
import { invalidarCacheConfigInstitucion } from "@/lib/institucional/config";
import { accentDe, baseDeVerificacion } from "@/lib/pdf/receta";

// ─────────────────────────────────────────────────────────────────────────────
// EL ACENTO DEL DOCUMENTO — sin `pdf_accent`, manda el primario de la
// institución. NUNCA el azul de Docto.
// ─────────────────────────────────────────────────────────────────────────────

test("sin pdf_accent, el acento del documento es el primario de la institución", () => {
  assert.equal(accentEfectivo({ pdf_accent: null, color_primary: "#4A3F8C" }), "#4A3F8C");
  assert.equal(accentEfectivo({ pdf_accent: "", color_primary: "#4A3F8C" }), "#4A3F8C");
  assert.equal(accentEfectivo({ pdf_accent: "   ", color_primary: "#4A3F8C" }), "#4A3F8C");
});

test("con pdf_accent, manda pdf_accent (el color del chrome puede no servir impreso)", () => {
  assert.equal(accentEfectivo({ pdf_accent: "#7A3E9D", color_primary: "#4A3F8C" }), "#7A3E9D");
});

test("el acento efectivo llega entero al generador: el papel del ministerio NO sale azul Docto", () => {
  // Es la cadena completa del hallazgo: config sin pdf_accent → branding →
  // accentDe(). Antes daba #378ADD, el azul de marca de Docto, en los labels
  // PROFESIONAL / PACIENTE / DIAGNÓSTICO, la línea del header y los "1. Rp/".
  const accent = accentEfectivo({ pdf_accent: null, color_primary: "#4A3F8C" });
  assert.equal(accentDe({ nombre: "X", efectorTexto: "", accent }), "#4A3F8C");
  assert.notEqual(accentDe({ nombre: "X", efectorTexto: "", accent }), "#378ADD");
});

// ─────────────────────────────────────────────────────────────────────────────
// EL GATE POR MODO — la mitad de la regla de oro que el golden del PDF no fija
// ─────────────────────────────────────────────────────────────────────────────
//
// El golden de `receta-golden.test.ts` fija el GENERADOR: `generarRecetaPDF(doc)`
// sin branding sale byte a byte igual. Pero no fija el GATE, y el gate es lo
// que decide si el B2C pasa por acá: `brandingParaPDF()` promete devolver
// `undefined` en B2C SIN TOCAR LA DB NI EL STORAGE, y eso no lo probaba nadie.
// `regla-de-oro.test.ts` recorre los crons, el callback y el middleware — no
// incluye ninguna pieza de las Etapas 5-6.
//
// Sin esto, un `esInstitucional()` invertido acá haría que el B2C intente bajar
// un isologo de un bucket que no existe en CADA descarga de receta, y el golden
// seguiría verde.
//
// El instrumento es un espía sobre `globalThis.fetch`: supabase-js sale a la
// red por ahí, así que "cero llamadas" es la prueba literal de "no tocó la DB
// ni el Storage" — el mismo criterio que el sprint ya usó con el callback
// ("cero llamadas a la DB").

async function conEspiaDeRed<T>(fn: () => Promise<T>): Promise<{ valor: T; llamadas: number }> {
  const original = globalThis.fetch;
  let llamadas = 0;
  globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
    llamadas++;
    void args;
    throw new Error("red bloqueada en el test");
  }) as typeof fetch;
  try {
    return { valor: await fn(), llamadas };
  } finally {
    globalThis.fetch = original;
  }
}

test("B2C: brandingParaPDF devuelve undefined SIN tocar la DB ni el Storage", async () => {
  const antes = process.env.INSTITUCIONAL;
  delete process.env.INSTITUCIONAL;
  invalidarCacheConfigInstitucion();
  try {
    const { valor, llamadas } = await conEspiaDeRed(() => brandingParaPDF());
    assert.equal(valor, undefined, "el B2C recibió branding: el gate está al revés");
    assert.equal(llamadas, 0, "el B2C salió a la red: el gate no corta antes de la config");
  } finally {
    if (antes === undefined) delete process.env.INSTITUCIONAL;
    else process.env.INSTITUCIONAL = antes;
    invalidarCacheConfigInstitucion();
  }
});

test("el espía de red detecta de verdad: en modo institucional SÍ sale a buscar la config", async () => {
  // Sin esta mitad, el test de arriba pasaría igual con un espía roto.
  const antesModo = process.env.INSTITUCIONAL;
  const antesUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const antesKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.INSTITUCIONAL = "true";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://instancia-de-test.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "clave-de-test";
  invalidarCacheConfigInstitucion();
  try {
    const { valor, llamadas } = await conEspiaDeRed(() => brandingParaPDF());
    assert.ok(llamadas > 0, "el modo institucional no consultó la config");
    // La red falla ⇒ falla blanda a propósito: el paciente recibe su receta con
    // la marca de Docto antes que un 500 en la cara.
    assert.equal(valor, undefined);
  } finally {
    if (antesModo === undefined) delete process.env.INSTITUCIONAL;
    else process.env.INSTITUCIONAL = antesModo;
    if (antesUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = antesUrl;
    if (antesKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = antesKey;
    invalidarCacheConfigInstitucion();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EL QR DEL DOCUMENTO — al dominio de quien emite el papel
// ─────────────────────────────────────────────────────────────────────────────

test("con branding institucional, el QR apunta al dominio de la instancia", () => {
  // Era la única parte del papel que no pasaba por la marca blanca: el isologo,
  // el acento y el pie salían del config, y el QR de `NEXT_PUBLIC_SITE_URL`. Si
  // el deploy de la instancia no la tiene apuntando a su propio dominio, ese QR
  // lleva al B2C — otra base, donde el id del documento no existe — y lo que se
  // proyecta en la reunión es un "documento no encontrado".
  assert.equal(
    baseDeVerificacion({
      nombre: "Ministerio",
      efectorTexto: "",
      verificarBaseUrl: "https://salud.gob.ar",
    }),
    "https://salud.gob.ar"
  );
  assert.equal(
    baseDeVerificacion({
      nombre: "Ministerio",
      efectorTexto: "",
      verificarBaseUrl: "https://salud.gob.ar/",
    }),
    "https://salud.gob.ar",
    "una barra final duplicaría la de /verificar"
  );
});

test("sin branding, el QR sigue saliendo como siempre (B2C intacto)", () => {
  const deSiempre = baseDeVerificacion(undefined);
  assert.ok(deSiempre.startsWith("http"));
  assert.equal(baseDeVerificacion(null), deSiempre);
  assert.equal(baseDeVerificacion({ nombre: "X", efectorTexto: "" }), deSiempre);
  assert.equal(
    baseDeVerificacion({ nombre: "X", efectorTexto: "", verificarBaseUrl: "  " }),
    deSiempre,
    "un dominio en blanco no puede dejar el papel sin URL de verificación"
  );
});
