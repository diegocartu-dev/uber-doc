// Destinos de pago: lo que escribe una persona se valida antes de guardarse.
// Una transferencia hecha no vuelve: un dígito mal tiene que fallar acá.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cbuValido, normalizarDestinoDeclarado, usableDesde, etiquetaDestino, HORAS_ESPERA_CAMBIO } from "../../src/lib/pagos/destinos-puro";

// Arma un CBU/CVU válido a partir de 7 + 13 dígitos, con el mismo esquema de
// verificadores que usa el banco (calculado acá aparte, no con la función bajo prueba).
function armar(bloque1: string, bloque2: string): string {
  const dv = (digs: string, pesos: number[]) => {
    const suma = digs.split("").reduce((acc, c, i) => acc + Number(c) * pesos[i], 0);
    return String((10 - (suma % 10)) % 10);
  };
  return bloque1 + dv(bloque1, [7, 1, 3, 9, 7, 1, 3]) + bloque2 + dv(bloque2, [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3]);
}

const CBU = armar("0170099", "2000004567890"); // banco (no arranca en 000)
const CVU = armar("0000003", "1000012345678"); // billetera (arranca en 000)

test("un CBU con verificadores correctos pasa; un dígito cambiado no", () => {
  assert.equal(CBU.length, 22);
  assert.equal(cbuValido(CBU), true);
  const roto = CBU.slice(0, 10) + (CBU[10] === "9" ? "0" : "9") + CBU.slice(11);
  assert.equal(cbuValido(roto), false);
});

test("22 dígitos válidos: CVU si arranca en 000, CBU si no; se aceptan espacios y guiones", () => {
  const a = normalizarDestinoDeclarado(CVU);
  assert.deepEqual(a, { ok: true, destino: { tipo: "cvu", valor: CVU } });
  const b = normalizarDestinoDeclarado(CBU.slice(0, 8) + "-" + CBU.slice(8, 15) + " " + CBU.slice(15));
  assert.deepEqual(b, { ok: true, destino: { tipo: "cbu", valor: CBU } });
});

test("22 dígitos con un verificador mal → error que dice que hay un dígito mal", () => {
  const roto = CBU.slice(0, 21) + (CBU[21] === "9" ? "0" : "9");
  const r = normalizarDestinoDeclarado(roto);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /dígito mal/);
});

test("21 dígitos no es un CVU", () => {
  const r = normalizarDestinoDeclarado(CBU.slice(0, 21));
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /22 dígitos/);
});

test("alias: 6 a 20 caracteres, letras, números, punto y guion; se guarda en minúsculas", () => {
  assert.deepEqual(normalizarDestinoDeclarado("  Juan.Perez-MP "), { ok: true, destino: { tipo: "alias", valor: "juan.perez-mp" } });
  assert.equal(normalizarDestinoDeclarado("corto").ok, false);
  assert.equal(normalizarDestinoDeclarado("con espacio adentro").ok, false);
  assert.equal(normalizarDestinoDeclarado("a".repeat(21)).ok, false);
  assert.equal(normalizarDestinoDeclarado("").ok, false);
});

test("el primer destino y todo lo que viene de Mercado Pago valen ya; un cambio declarado espera 24 h", () => {
  const ahora = new Date("2026-09-30T12:00:00Z");
  assert.equal(usableDesde({ reemplaza: false, origen: "declarado", ahora }).getTime(), ahora.getTime());
  assert.equal(usableDesde({ reemplaza: true, origen: "oauth_mp", ahora }).getTime(), ahora.getTime());
  assert.equal(usableDesde({ reemplaza: true, origen: "admin", ahora }).getTime(), ahora.getTime());
  const despues = usableDesde({ reemplaza: true, origen: "declarado", ahora });
  assert.equal(despues.getTime() - ahora.getTime(), HORAS_ESPERA_CAMBIO * 60 * 60 * 1000);
});

test("etiqueta para pantalla", () => {
  assert.equal(etiquetaDestino({ tipo: "alias", valor: "juan.perez" }), "Alias juan.perez");
  assert.equal(etiquetaDestino({ tipo: "mp_email", valor: "x@y.com" }), "Cuenta de Mercado Pago (x@y.com)");
});
