// El cliente de Farmalink: token en headers, cacheado, y errores sin excepciones.
// Ejecutar:  npx tsx --test src/lib/farmalink/cliente.test.ts
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { credencialesFarmalink, tokenFarmalink, operacionReceta, _olvidarToken } from "./cliente";

const cred = { host: "https://farmalink.prueba", clientId: "cli", clientSecret: "sec", usuario: "usr", clave: "pwd" };

type Llamada = { url: string; headers: Record<string, string>; body: string | undefined };

function fetchFalso(respuestas: Array<{ status: number; json?: unknown }>) {
  const llamadas: Llamada[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    llamadas.push({ url, headers: init.headers as Record<string, string>, body: init.body as string | undefined });
    const r = respuestas.shift() ?? { status: 500 };
    return new Response(r.json === undefined ? "" : JSON.stringify(r.json), { status: r.status });
  }) as unknown as typeof fetch;
  return { impl, llamadas };
}

beforeEach(() => _olvidarToken());

test("sin las cuatro credenciales no hay cliente", () => {
  assert.equal(credencialesFarmalink({ FARMALINK_TEST_CLIENT_ID: "a" } as unknown as NodeJS.ProcessEnv), null);
  const c = credencialesFarmalink({ FARMALINK_TEST_CLIENT_ID: "a", FARMALINK_TEST_CLIENT_SECRET: "b", FARMALINK_TEST_USER: "c", FARMALINK_TEST_PASSWORD: "d" } as unknown as NodeJS.ProcessEnv);
  assert.equal(c?.host, "https://test-servicios.farmalink.com.ar");
});

test("el token va todo en headers, a /generate, y se reusa hasta una hora antes de vencer", async () => {
  const { impl, llamadas } = fetchFalso([
    { status: 200, json: { access_token: "T1", expires_in: 43200 } },
    { status: 200, json: { access_token: "T2", expires_in: 43200 } },
  ]);
  const t0 = 1_000_000;
  assert.deepEqual(await tokenFarmalink(cred, t0, impl), { ok: true, status: 200, data: "T1" });
  assert.equal(llamadas[0].url, "https://farmalink.prueba/api/oauth/token/generate");
  assert.equal(llamadas[0].headers.Authorization, `Basic ${Buffer.from("cli:sec").toString("base64")}`);
  assert.equal(llamadas[0].headers.grant_type, "PASSWORD");
  assert.equal(llamadas[0].headers.scope, "Switch.RecetaElectRest");
  assert.equal(llamadas[0].headers["Content-Type"], "application/json");
  assert.equal(llamadas[0].body, undefined);
  // 10 h después: el mismo token, sin pedir otro.
  assert.equal((await tokenFarmalink(cred, t0 + 10 * 3600_000, impl)).ok, true);
  assert.equal(llamadas.length, 1);
  // 11,5 h después (falta menos de una hora): pide otro.
  const r = await tokenFarmalink(cred, t0 + 11.5 * 3600_000, impl);
  assert.deepEqual(r, { ok: true, status: 200, data: "T2" });
  assert.equal(llamadas.length, 2);
});

test("un error de Farmalink vuelve como dato, con su código", async () => {
  const { impl } = fetchFalso([
    { status: 200, json: { access_token: "T1", expires_in: 43200 } },
    { status: 400, json: { error: { idTransaccion: "Id-1", errorInterno: { codigo: "5009", descripcion: "ERROR DE SEGURIDAD", mensaje: null } } } },
  ]);
  const r = await operacionReceta("altaReceta", { altaRecetaElectRq: {} }, { cred, fetchImpl: impl });
  assert.equal(r.ok, false);
  if (!r.ok) assert.deepEqual(r.error, { status: 400, codigo: "5009", descripcion: "ERROR DE SEGURIDAD", mensaje: null, idTransaccion: "Id-1" });
});

test("la operación lleva el Bearer y el cuerpo en JSON", async () => {
  const { impl, llamadas } = fetchFalso([
    { status: 200, json: { access_token: "T1", expires_in: 43200 } },
    { status: 200, json: { altaRecetaElectRs: { ok: 1 } } },
  ]);
  const r = await operacionReceta("altaReceta", { a: 1 }, { cred, fetchImpl: impl });
  assert.deepEqual(r, { ok: true, status: 200, data: { altaRecetaElectRs: { ok: 1 } } });
  assert.equal(llamadas[1].url, "https://farmalink.prueba/api/recetaElect/v3/altaReceta");
  assert.equal(llamadas[1].headers.Authorization, "Bearer T1");
  assert.equal(llamadas[1].body, JSON.stringify({ a: 1 }));
});

test("un 401 descarta el token; sin red, error con status 0 y sin excepción", async () => {
  const { impl, llamadas } = fetchFalso([
    { status: 200, json: { access_token: "T1", expires_in: 43200 } },
    { status: 401 },
    { status: 200, json: { access_token: "T2", expires_in: 43200 } },
    { status: 200, json: {} },
  ]);
  assert.equal((await operacionReceta("consultaReceta", {}, { cred, fetchImpl: impl })).ok, false);
  assert.equal((await operacionReceta("consultaReceta", {}, { cred, fetchImpl: impl })).ok, true);
  assert.equal(llamadas[2].url.endsWith("/token/generate"), true);

  const sinRed = (async () => {
    throw new Error("ECONNRESET");
  }) as unknown as typeof fetch;
  _olvidarToken();
  const r = await operacionReceta("altaReceta", {}, { cred, fetchImpl: sinRed });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error.status, 0);
});

test("sin credenciales no llama a nadie", async () => {
  const r = await operacionReceta("altaReceta", {}, { cred: null });
  assert.equal(r.ok, false);
});
