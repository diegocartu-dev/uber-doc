// EL MAIL DE ALERTA DE LOS CRONS — runner: node:test + node:assert con tsx.
// Ejecutar:  npm run test:unit  (o npx tsx --test src/lib/cron-guard.test.ts)
//
// ── QUÉ FIJA ESTE ARCHIVO ────────────────────────────────────────────────────
// `withCron` envuelve a los ~25 crons del B2C, o sea que cualquier cambio acá
// sale a producción sobre plata real y sobre los mails que Diego recibe cuando
// algo se rompe. La Etapa 8 necesitó que el mail dijera POR QUÉ falló el cierre
// mensual (el motivo vivía solo en los logs de Vercel) y para eso agregó
// `detalleDelCuerpo`… que empezó a mandar hasta 600 caracteres del cuerpo de la
// respuesta en TODOS los crons del producto, varios de los cuales contestan
// listas con ids de consultas y de turnos. Un cambio de comportamiento del B2C
// que nadie pidió.
//
// La regla de oro no admite "parecido": con el flag apagado el mail tiene que
// ser EXACTAMENTE el de antes. Por eso el texto esperado del lado B2C está
// escrito acá literal, y no compuesto con las mismas piezas que produce el
// código (eso testearía que dos copias del bug coinciden).

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { detalleDelCuerpo, detalleTecnicoHTTP } from "@/lib/cron-guard";

/** Un 500 de cron con cuerpo JSON, como los del cierre mensual. */
function respuesta500(cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: 500,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  delete process.env.INSTITUCIONAL;
});

test("B2C · el cuerpo de la respuesta NO se lee: el mail es el de siempre", async () => {
  const res = respuesta500({ fallados: [{ periodo: "2026-10", error: "algo" }] });
  assert.equal(await detalleDelCuerpo(res), "");
});

test("B2C · el texto del detalle técnico es CARÁCTER POR CARÁCTER el de antes", () => {
  assert.equal(
    detalleTecnicoHTTP("liberar-reservas", 500, ""),
    "Detalle técnico (para Claude): cron liberar-reservas devolvió HTTP 500. Revisar logs en Vercel."
  );
});

test("B2C · ni siquiera con INSTITUCIONAL en cualquier otro valor", async () => {
  for (const valor of ["", "false", "TRUE", "True", "1", "si"]) {
    process.env.INSTITUCIONAL = valor;
    const res = respuesta500({ ids: ["no-tiene-que-viajar-en-el-mail"] });
    assert.equal(await detalleDelCuerpo(res), "", `INSTITUCIONAL=${JSON.stringify(valor)}`);
  }
});

test("instancia · el cuerpo SÍ viaja: es el motivo por el que el cierre no pudo", async () => {
  process.env.INSTITUCIONAL = "true";
  const res = respuesta500({ fallados: [{ periodo: "2026-10", error: "3 encuentros sin clasificar" }] });
  const cuerpo = await detalleDelCuerpo(res);
  assert.match(cuerpo, /3 encuentros sin clasificar/);
  assert.match(
    detalleTecnicoHTTP("metering-cerrar-mes", 500, cuerpo),
    /\nRespuesta: [\s\S]*sin clasificar[\s\S]*\nRevisar logs en Vercel\.$/
  );
});

test("instancia · el cuerpo se corta en 600 caracteres", async () => {
  process.env.INSTITUCIONAL = "true";
  const res = respuesta500({ detalle: "x".repeat(5000) });
  assert.equal((await detalleDelCuerpo(res)).length, 600);
});

test("instancia · una respuesta que no es JSON no rompe el mail", async () => {
  process.env.INSTITUCIONAL = "true";
  const texto = new Response("Internal Server Error", { status: 500 });
  assert.equal(await detalleDelCuerpo(texto), "");
  // Y un content-type que miente tampoco: el JSON.parse falla y se devuelve "".
  const miente = new Response("<html>502</html>", {
    status: 500,
    headers: { "content-type": "application/json" },
  });
  assert.equal(await detalleDelCuerpo(miente), "");
});

test("el body de la respuesta sigue siendo legible después de leerlo para el mail", async () => {
  // `res.clone()`: el body es un stream de un solo uso y la respuesta original
  // todavía tiene que salir hacia Vercel. Sin el clone, el cron devuelve un
  // stream ya consumido cada vez que falla.
  process.env.INSTITUCIONAL = "true";
  const res = respuesta500({ ok: false });
  await detalleDelCuerpo(res);
  assert.deepEqual(await res.json(), { ok: false });
});
