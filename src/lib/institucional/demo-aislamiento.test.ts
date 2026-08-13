// EL AISLAMIENTO DE LA REUNIÓN — que lo de la demo no se mezcle con lo real.
// Runner: node:test + node:assert con tsx (`npm run test:unit`).
//
// ── POR QUÉ ESTE ARCHIVO LEE CÓDIGO FUENTE Y NO EJECUTA NADA ─────────────────
// Lo que hay que fijar acá es un PREDICADO DE UNA QUERY: que el SELECT de
// `medicos` que arma la oferta del call center excluya las fichas de
// demostración, que el padrón del panel de cumplimiento haga lo mismo, y que el
// KPI de slots sin asignar no cuente la escenografía. Ninguna de las tres se
// puede probar sin una base — y la que importa es justamente la línea del
// filtro, que es lo que un refactor se lleva puesto sin que ningún test rojo lo
// note.
//
// Es la misma disciplina que `correcciones.test.ts` usa con el SQL de la 022:
// leer el archivo y exigir que la línea esté. Feo y efectivo.
//
// ── QUÉ PASA SI ESTO SE ROMPE ────────────────────────────────────────────────
// El participante de una reunión de venta —que no está matriculado— aparece en
// la pantalla del call center como candidato PREFERENTE (cuenta cero asignados,
// y el reparto parejo pone primero al que menos lleva). Un paciente real del
// padrón provincial termina atendido por él, con una receta que dice
// "DEMOSTRACIÓN — SIN VALIDEZ LEGAL", fuera del contador contractual, y con su
// historia clínica borrada cuando alguien toque "limpiar reunión".

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * El archivo SIN comentarios. Hace falta: los comentarios de este repo tienen
 * puntos y comas adentro, y el recorte de abajo termina cada query en el primer
 * `;` — un `//` explicando por qué existe el filtro cortaba la query justo
 * antes del filtro.
 */
function fuente(ruta: string): string {
  return readFileSync(resolve(process.cwd(), ruta), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Los bloques de query que arrancan en `.from("<tabla>")` y terminan en el
 * primer `;` — que es donde termina el encadenamiento de PostgREST.
 */
function queriesDe(codigo: string, tabla: string): string[] {
  const marca = `.from("${tabla}")`;
  const bloques: string[] = [];
  let desde = 0;
  for (;;) {
    const i = codigo.indexOf(marca, desde);
    if (i === -1) break;
    const fin = codigo.indexOf(";", i);
    bloques.push(codigo.slice(i, fin === -1 ? codigo.length : fin));
    desde = i + marca.length;
  }
  return bloques;
}

test("la oferta del call center nunca incluye a un profesional de demostración", () => {
  const codigo = fuente("src/lib/otorgador/oferta.ts");
  const queries = queriesDe(codigo, "medicos");
  assert.ok(queries.length >= 2, "cambió la forma de oferta.ts: revisá este test");
  for (const q of queries) {
    assert.match(
      q,
      /\.is\("demo_sesion_id", null\)/,
      "un SELECT de médicos de la oferta perdió el filtro de demostración: " +
        "el participante de una reunión vuelve a ser candidato para un paciente real"
    );
  }
});

test("el padrón del panel de cumplimiento excluye a los profesionales de demostración", () => {
  const codigo = fuente("src/lib/metering/bolsa.ts");
  // Solo las que arman un UNIVERSO (filtran por estado y especialidad). La otra
  // query de `medicos` de este archivo lee nombres de ids YA SELLADOS: filtrarla
  // dejaría filas selladas sin nombre, que es el bug contrario.
  const queries = queriesDe(codigo, "medicos").filter((q) => q.includes("estado_registro"));
  assert.ok(queries.length >= 1, "cambió la forma de bolsa.ts: revisá este test");
  for (const q of queries) {
    assert.match(
      q,
      /\.is\("demo_sesion_id", null\)/,
      "el universo del cumplimiento volvió a incluir fichas de demostración"
    );
  }
});

test("los slots de la escenografía no se cuentan como oferta que nadie tomó", () => {
  const codigo = fuente("src/lib/metering/panel.ts");
  const queries = queriesDe(codigo, "turnos");
  assert.ok(queries.length >= 1, "cambió la forma de panel.ts: revisá este test");
  for (const q of queries) {
    assert.match(
      q,
      /\.not\("es_demo", "is", true\)/,
      "el KPI de slots sin asignar volvió a contar la agenda de una demo"
    );
  }
});
