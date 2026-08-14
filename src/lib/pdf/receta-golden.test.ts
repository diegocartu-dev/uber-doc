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

/**
 * Huella esperada por fixture (generador de `origin/main`, re-sellado el
 * 13/08/2026 al hacer PORTABLE la huella — ver `normalizarStreams` en las
 * fixtures).
 *
 * ⚠ RE-SELLAR SOLO CON `scripts/pdf-golden-huellas.mts` Y SOBRE `origin/main`.
 * Estas huellas ya no dependen de la versión de Node: verificadas idénticas en
 * Node 20.19 (el del CI) y en Node 25.8, con archivos que difieren ~3 KB entre
 * sí porque cada zlib comprime distinto.
 */
const HUELLAS: Record<string, string> = {
  "receta firmada con Rp/ estructurado":
    "fc9d5cda3816dc9de2f2d5f226d191813402f847677f199370fde3233a76c188",
  "receta SIN firma (leyenda de sello ausente)":
    "b925ace7afac2ac165752228b602f4873f94daea9478342afc805f423d04b30e",
  "certificado de reposo firmado":
    "396efe8468b7a3eac29fc14358cf5d5fba35c66ed9c4bbffefeb6970f90d5c05",
  "receta de TRES medicamentos (presupuesto de alto del pie)":
    "9c4d706d2c329d4947a285dcb6ce8a6148ca24f6b01b18c8df89b6368e2bd35b",
  "orden médica (rama de texto plano)":
    "abd21acdfc86a9b9e1d4a394578c940bf15feb5d5f322a27e2791a018cc2bae4",
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

// ─────────────────────────────────────────────────────────────────────────────
// MARCA DE DEMOSTRACIÓN — el papel de la reunión no se puede confundir
// ─────────────────────────────────────────────────────────────────────────────
//
// En una demo, el que firma es un participante que no es médico matriculado. El
// documento tiene que verse entero (es lo que se está mostrando) y ser
// imposible de confundir con uno real. Las huellas de arriba ya prueban la
// mitad que más importa: SIN branding —o sea, en todo el B2C— el papel no
// cambió ni un byte, así que la marca no puede aparecer donde no corresponde.
// Lo de acá abajo prueba la otra mitad.

test("con `demo`, el papel CAMBIA respecto del mismo documento institucional", async () => {
  for (const f of FIXTURES) {
    const normal = await generarRecetaPDF(f.doc, BRANDING_SINTETICO);
    const demo = await generarRecetaPDF(f.doc, { ...BRANDING_SINTETICO, demo: true });
    assert.notEqual(
      huellaPDF(demo),
      huellaPDF(normal),
      `la marca de demostración no cambió nada en ${f.nombre}: el gate quedó muerto`
    );
  }
});

test("la marca de agua se dibuja translúcida, no tapa el QR ni el barcode", async () => {
  // El QR y el barcode son las dos cosas del papel que una MÁQUINA tiene que
  // poder leer. Una marca opaca encima los inutilizaría, y eso no lo detecta
  // ningún test de "cambió el hash".
  const demo = await generarRecetaPDF(FIXTURES[0].doc, { ...BRANDING_SINTETICO, demo: true });
  const crudo = demo.toString("latin1");
  assert.match(crudo, /\/ca 0\.11/, "la marca de agua tiene que ir con opacidad baja");
  // Y la opacidad vuelve a 1: si quedara pisada, todo lo dibujado después
  // saldría fantasma.
  assert.match(crudo, /\/ca 1\b/);
});

test("el papel de demostración sigue entrando en UNA página, hasta en el caso apretado", async () => {
  // El caso apretado es la receta de tres medicamentos con la Sección C larga
  // del abogado: si la leyenda de demo no estuviera en el presupuesto de alto
  // del pie, el número de receta y el barcode se irían a una página 2 —
  // dibujados en coordenadas absolutas, o sea fuera del borde.
  for (const f of FIXTURES) {
    const pdf = await generarRecetaPDF(f.doc, {
      ...BRANDING_SINTETICO,
      demo: true,
      efectorTexto: EFECTOR_LEGAL_LARGO,
    });
    assert.equal(paginasDePDF(pdf), 1, `${f.nombre} se partió en dos con la marca de demostración`);
  }
});

test("`demo` es opt-in: el documento institucional normal no lleva ninguna marca", async () => {
  const normal = await generarRecetaPDF(FIXTURES[0].doc, BRANDING_SINTETICO);
  assert.equal(/\/ca 0\.11/.test(normal.toString("latin1")), false);
  const explicito = await generarRecetaPDF(FIXTURES[0].doc, { ...BRANDING_SINTETICO, demo: false });
  assert.equal(huellaPDF(explicito), huellaPDF(normal));
});
