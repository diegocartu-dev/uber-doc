// GOLDEN TEST DEL PDF — el papel del B2C no cambia ni un byte.
// Runner: node:test + node:assert con tsx (`npm run test:unit`).
//
// ── QUÉ FIJA ESTE ARCHIVO ────────────────────────────────────────────────────
// La Etapa 5 le agregó a `generarRecetaPDF` un parámetro de marca blanca para
// el documento institucional. La regla de oro dice que con el parámetro
// AUSENTE —o sea, en todo el B2C, que no lo pasa— el documento sale idéntico.
//
// Y "idéntico" acá no es una opinión de diseño: este PDF es una receta con
// validez legal, con leyendas dictaminadas, un QR de verificación y un barcode
// que lee una farmacia. Un corrimiento de 2 puntos en el pie o un color que se
// movió no rompe ningún test funcional y sí rompe un papel que ya está impreso.
//
// Las huellas de abajo se sellaron corriendo `scripts/pdf-golden-huellas.mts`
// sobre el generador de `main` ANTES de tocarlo, y se verificaron de nuevo
// contra `origin/main` después del cambio. Si alguna falla y nadie decidió
// cambiar el papel, es una regresión: se arregla el código, no el hash.
//
// El día que el papel CAMBIE A PROPÓSITO (con la aprobación que corresponda),
// se re-sellan con ese mismo script y el commit que las cambia tiene que decir
// qué cambió del documento y quién lo aprobó.

import { test } from "node:test";
import assert from "node:assert/strict";
import { generarRecetaPDF, accentDe } from "@/lib/pdf/receta";
import {
  FIXTURES,
  BRANDING_SINTETICO,
  EFECTOR_LEGAL_LARGO,
  huellaPDF,
  paginasDePDF,
} from "@/lib/pdf/receta-golden.fixtures";

/** Huella esperada por fixture (generador de `main`, sellado el 13/08/2026). */
const HUELLAS: Record<string, string> = {
  "receta firmada con Rp/ estructurado":
    "b01f77411177da76ebe903e7a0071f53ad23efecb44509ace75db7a6c5cf9238",
  "receta SIN firma (leyenda de sello ausente)":
    "ee9ea2cb05629a6044028092d71b113d2bc6035b9488ea89896b9924850ae92a",
  "certificado de reposo firmado":
    "8b3e7231dbfc73cc1c9af06cd94c4753e16cc18dda32d15c67f01349ff9bbf65",
  "receta de TRES medicamentos (presupuesto de alto del pie)":
    "3a13735847ffee0a652381934610abb72345e4312ed722eff1d33c6d459a68af",
  "orden médica (rama de texto plano)":
    "28524a1a8ebf3f6cb18d8c6f27881b62f193cead3cd5e4e4ecc4e53037452055",
};

// ─────────────────────────────────────────────────────────────────────────────
// SIN BRANDING — el B2C, byte a byte
// ─────────────────────────────────────────────────────────────────────────────

for (const f of FIXTURES) {
  test(`B2C sin cambios: ${f.nombre}`, async () => {
    const pdf = await generarRecetaPDF(f.doc);
    assert.equal(
      huellaPDF(pdf),
      HUELLAS[f.nombre],
      `El PDF del B2C cambió (${f.nombre}). Si NO fue a propósito, es una regresión.`
    );
  });
}

test("B2C: el documento entra en UNA página, incluso con tres medicamentos", async () => {
  for (const f of FIXTURES) {
    const pdf = await generarRecetaPDF(f.doc);
    assert.equal(paginasDePDF(pdf), 1, f.nombre);
  }
});

test("pasar `null` como branding es lo mismo que no pasar nada", async () => {
  // Los callers del B2C no pasan el parámetro, pero un caller institucional
  // puede pasar `null` cuando todavía no leyó la config. Ese camino tiene que
  // caer en el papel de siempre, no en uno a medio brandear.
  const pdf = await generarRecetaPDF(FIXTURES[0].doc, null);
  assert.equal(huellaPDF(pdf), HUELLAS[FIXTURES[0].nombre]);
});

// ─────────────────────────────────────────────────────────────────────────────
// CON BRANDING — sin esto, borrar la marca blanca también pasaría los tests
// ─────────────────────────────────────────────────────────────────────────────

test("con branding, el documento CAMBIA (y sigue entrando en una página)", async () => {
  for (const f of FIXTURES) {
    const brandeado = await generarRecetaPDF(f.doc, BRANDING_SINTETICO);
    assert.notEqual(
      huellaPDF(brandeado),
      HUELLAS[f.nombre],
      `El branding no cambió nada en ${f.nombre}: el gate quedó al revés o muerto.`
    );
    // El presupuesto de alto del pie: la Sección C suma ~13pt y la receta de
    // tres medicamentos es el caso apretado de la spec (§7.3).
    assert.equal(paginasDePDF(brandeado), 1, `${f.nombre} se fue a dos páginas con el pie institucional`);
  }
});

test("la Sección C definitiva del abogado tampoco parte el documento en dos", async () => {
  // El texto del pie sale del CONFIG, no del código: el camino previsto para
  // cambiarlo es "se cambia el config y NO el código". Con el presupuesto de
  // pie hardcodeado en 13 pt, una redacción legal de cuatro oraciones mandaba
  // el número de receta a una segunda página y el barcode —el que escanea la
  // farmacia— se dibujaba en coordenadas absolutas con `pdf.y` ya pasado el
  // borde inferior. Nada avisaba, porque el golden solo probaba con el string
  // sintético corto.
  for (const f of FIXTURES) {
    const pdf = await generarRecetaPDF(f.doc, {
      ...BRANDING_SINTETICO,
      efectorTexto: EFECTOR_LEGAL_LARGO,
    });
    assert.equal(paginasDePDF(pdf), 1, `${f.nombre} se partió en dos con la Sección C larga`);
  }
});

test("un isologo ilegible no se lleva puesto el documento", async () => {
  // El buffer viene de un bucket: puede estar cortado, ser un PDF renombrado o
  // un SVG. El papel es clínico y ya se le prometió al paciente: sale igual,
  // con la marca en texto.
  const pdf = await generarRecetaPDF(FIXTURES[0].doc, {
    ...BRANDING_SINTETICO,
    isologoBuffer: Buffer.from("esto no es una imagen"),
  });
  assert.ok(pdf.length > 10_000);
  assert.equal(paginasDePDF(pdf), 1);
});

test("un color de acento inválido cae al azul de siempre, no rompe el papel", () => {
  assert.equal(accentDe({ nombre: "X", efectorTexto: "", accent: "#12345" }), "#378ADD");
  assert.equal(accentDe({ nombre: "X", efectorTexto: "", accent: "azul" }), "#378ADD");
  assert.equal(accentDe({ nombre: "X", efectorTexto: "", accent: "" }), "#378ADD");
  assert.equal(accentDe({ nombre: "X", efectorTexto: "", accent: null }), "#378ADD");
  assert.equal(accentDe(undefined), "#378ADD");
  assert.equal(accentDe({ nombre: "X", efectorTexto: "", accent: " #7A3E9D " }), "#7A3E9D");
  assert.equal(accentDe({ nombre: "X", efectorTexto: "", accent: "#abc" }), "#abc");
});

test("el texto del efector es dato de config: sin él, el pie no inventa nada", async () => {
  const sinEfector = await generarRecetaPDF(FIXTURES[0].doc, {
    ...BRANDING_SINTETICO,
    efectorTexto: "   ",
  });
  const conEfector = await generarRecetaPDF(FIXTURES[0].doc, BRANDING_SINTETICO);
  assert.notEqual(huellaPDF(sinEfector), huellaPDF(conEfector));
  assert.equal(paginasDePDF(sinEfector), 1);
});
