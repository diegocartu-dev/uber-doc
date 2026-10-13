// Todo texto de emergencias remite al servicio de emergencias de la zona.
// Ejecutar:  npx tsx --test tests/unit/emergencias-zona.test.ts
//
// POR QUÉ (13/10/2026): regla de Diego. Docto no atiende emergencias en ninguna
// especialidad; los textos nuevos no publican números (no sabemos si están
// actualizados), los que ya estaban (107 / 911) se quedan, y TODO texto de
// emergencias suma "o el servicio de emergencias de tu zona". Ese mismo día la
// regla se perdió dos veces entre sesiones: un texto sacó los números que
// estaban publicados y otro quedó sin la frase de la zona. Una regla que vive
// solo en la memoria de quien escribe se pierde; este test hace que un texto
// con 107 o 911 sin la zona cerca no se pueda mergear.
//
// Cerca = la misma línea o hasta 6 líneas antes o después (un botón y la línea
// que lo acompaña, un párrafo partido en varias líneas de JSX).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const RAIZ = resolve(__dirname, "../../src");
const CERCA = 6;
const NUMERO = /\b(107|911)\b/;
const ZONA = /servicio de emergencias de (tu|su) zona|REMITIR_EMERGENCIAS|TEXTO_EMERGENCIAS/;

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return archivos(p);
    return /\.(tsx?|mts)$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
}

test("cada 107 / 911 de un texto tiene la zona cerca", () => {
  const sinZona: string[] = [];
  for (const archivo of archivos(RAIZ)) {
    const lineas = readFileSync(archivo, "utf8").split("\n");
    lineas.forEach((linea, i) => {
      if (!NUMERO.test(linea)) return;
      if (/^\s*(\/\/|\*)/.test(linea)) return; // comentario: no lo lee nadie de afuera
      const entorno = lineas.slice(Math.max(0, i - CERCA), i + CERCA + 1).join("\n");
      if (!ZONA.test(entorno)) sinZona.push(`${archivo.replace(RAIZ, "src")}:${i + 1}  ${linea.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(sinZona, [], `Textos de emergencias sin "servicio de emergencias de tu zona":\n${sinZona.join("\n")}`);
});

test("el detector reconoce un texto sin la zona", () => {
  assert.ok(NUMERO.test("Llamá al 107 de inmediato"));
  assert.ok(!ZONA.test("Llamá al 107 de inmediato"));
  assert.ok(ZONA.test("o comunicate con el servicio de emergencias de tu zona"));
  assert.ok(!NUMERO.test("turno 1107")); // un número que contiene 107 no es el 107
});
