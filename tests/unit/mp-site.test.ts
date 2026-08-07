// Chequeo del país de la cuenta de Mercado Pago (caso real 07/08/2026).
// Lo que este test protege: que un problema de la API de Mercado Pago NUNCA se
// confunda con "cuenta de otro país". Marcar a un médico por un timeout sería
// peor que el bug original.
import { consultarSiteMp, paisDeSite, esSiteArgentino } from "../../src/lib/mp-site";

let passed = 0;
let failed = 0;

function check(label: string, cond: boolean) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

const fetchOriginal = globalThis.fetch;

function stubFetch(impl: () => Promise<Response> | never) {
  globalThis.fetch = (async () => impl()) as typeof globalThis.fetch;
}

function respuesta(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

async function main() {
  // 1. Cuenta argentina
  stubFetch(async () => respuesta({ site_id: "MLA" }));
  const ar = await consultarSiteMp("token");
  check("MLA → argentina", ar.estado === "argentina");

  // 2. Cuenta de otro país
  stubFetch(async () => respuesta({ site_id: "MLB" }));
  const br = await consultarSiteMp("token");
  check("MLB → extranjera", br.estado === "extranjera");
  check("MLB conserva el site_id", br.estado === "extranjera" && br.siteId === "MLB");

  // 3. Timeout / error de red → NO es extranjera
  stubFetch(() => {
    throw new Error("The operation was aborted due to timeout");
  });
  const timeout = await consultarSiteMp("token");
  check("timeout → no_verificable (NUNCA extranjera)", timeout.estado === "no_verificable");

  // 4. MP caído (5xx) → NO es extranjera
  stubFetch(async () => respuesta({}, 502));
  const caido = await consultarSiteMp("token");
  check("HTTP 502 → no_verificable", caido.estado === "no_verificable");

  // 5. Token vencido/revocado (401) → NO es extranjera
  stubFetch(async () => respuesta({}, 401));
  const noAuth = await consultarSiteMp("token");
  check("HTTP 401 → no_verificable", noAuth.estado === "no_verificable");

  // 6. Respuesta rara (sin site_id) → NO es extranjera
  stubFetch(async () => respuesta({ id: 123 }));
  const raro = await consultarSiteMp("token");
  check("sin site_id → no_verificable", raro.estado === "no_verificable");

  // 7. Nombres de país y helper de comparación
  check("MLB → Brasil", paisDeSite("MLB") === "Brasil");
  check("site desconocido → 'otro país'", paisDeSite("MXX") === "otro país");
  check("null → 'otro país'", paisDeSite(null) === "otro país");
  check("esSiteArgentino('mla') case-insensitive", esSiteArgentino("mla") === true);
  check("esSiteArgentino(null) === false", esSiteArgentino(null) === false);

  globalThis.fetch = fetchOriginal;

  console.log(`\nmp-site: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
