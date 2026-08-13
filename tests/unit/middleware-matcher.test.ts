// El MATCHER del middleware — runner: node:test con tsx (npm run test:unit).
//
// ── QUÉ FIJA ─────────────────────────────────────────────────────────────────
// El cambio de más riesgo para el B2C de toda la Etapa 3 no es un gate por
// modo: es el regex del matcher, que se tocó para sacar `/acceso` de encima del
// middleware. Ese regex se aplica a TODAS las rutas del producto, en los dos
// modos, y un `.*` de más ahí apaga el middleware del B2C entero — beta gate,
// timeout de inactividad y refresh de sesión, todo junto, sin que ningún test
// se entere.
//
// El matcher tiene que estar escrito como literal dentro de `export const
// config` (Next lo extrae en build: no acepta una constante importada), así que
// no se puede importar. En vez de copiarlo acá —una copia se despega y el test
// pasa a mentir— se LEE del archivo y se compila. Si alguien lo edita, este
// test corre contra la versión editada.

import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const fuente = readFileSync(new URL("../../src/middleware.ts", import.meta.url), "utf8");

// El literal del matcher: la única string del archivo que empieza con "/((?!".
const encontrado = fuente.match(/"(\/\(\(\?![^"]*)"/);
assert.ok(encontrado, "No se encontró el literal del matcher en src/middleware.ts");

// El archivo es código fuente: lo que ahí se lee como \\. es un \. en runtime.
const patron = encontrado[1].replace(/\\\\/g, "\\");
const matcher = new RegExp(`^${patron}$`);

/** Rutas que TIENEN que pasar por el middleware. */
const PASAN = [
  "/",
  "/dashboard",
  "/mis-consultas",
  "/medico/agenda",
  "/consulta/abc/sala",
  "/turno/abc/acceso",
  "/turno/abc/espera",
  "/admin",
  "/auth/login",
  "/auth/register",
  "/clinica",
  "/api/turno-estado",
  "/beta-access",
];

/** Rutas EXCLUIDAS a propósito. Cada una con su razón en el middleware. */
const NO_PASAN = [
  "/auth/callback", // setea cookies de sesión en el route handler
  "/auth/confirmar", // ídem
  "/acceso/t/abc123", // la puerta del paciente institucional: ni el bot de
  "/acceso/entrar", // preview de WhatsApp dispara un refresh de sesión acá
  "/acceso/reenviar",
  "/_next/static/chunk.js",
  "/_next/image",
  "/favicon.ico",
  "/logo.svg",
  "/foto.png",
];

test("el matcher deja pasar TODAS las rutas del producto", () => {
  for (const ruta of PASAN) {
    assert.equal(matcher.test(ruta), true, `${ruta} tiene que pasar por el middleware`);
  }
});

test("el matcher excluye exactamente lo que tiene que excluir", () => {
  for (const ruta of NO_PASAN) {
    assert.equal(matcher.test(ruta), false, `${ruta} NO puede pasar por el middleware`);
  }
});

test("sacar /acceso no se comió /turno/[id]/acceso ni ninguna ruta parecida", () => {
  // La exclusión es por PREFIJO de path, no por segmento suelto: la pantalla
  // del paciente vive bajo /turno y necesita el middleware (sesión + timeout).
  for (const ruta of ["/turno/abc/acceso", "/accesorios", "/medico/accesos"]) {
    assert.equal(matcher.test(ruta), true, ruta);
  }
});
