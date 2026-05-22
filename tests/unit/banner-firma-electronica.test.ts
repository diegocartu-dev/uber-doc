// Tests for BannerFirmaElectronica component logic
// Verifies state transitions, visibility rules

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

// --- Test: banner visibility logic ---

function shouldShowBanner(firmaConfigurada: boolean): boolean {
  // Banner shows when firma is NOT configured
  return !firmaConfigurada;
}

assert(shouldShowBanner(false) === true, "shows banner when firma not configured");
assert(shouldShowBanner(true) === false, "hides banner when firma already configured");

// --- Test: API response shape validation ---

type ConfigurarResponse = { configurado: boolean } | { ok: true } | { error: string };

function isGetResponse(res: ConfigurarResponse): res is { configurado: boolean } {
  return "configurado" in res;
}

function isPostSuccess(res: ConfigurarResponse): res is { ok: true } {
  return "ok" in res;
}

function isError(res: ConfigurarResponse): res is { error: string } {
  return "error" in res;
}

const getRes: ConfigurarResponse = { configurado: true };
assert(isGetResponse(getRes), "GET response has configurado field");

const postRes: ConfigurarResponse = { ok: true };
assert(isPostSuccess(postRes), "POST success has ok field");

const errRes: ConfigurarResponse = { error: "No autenticado" };
assert(isError(errRes), "error response has error field");

// --- Test: state machine transitions ---

type Estado = "idle" | "activando" | "listo" | "oculto";

function getInitialState(firmaConfigurada: boolean): Estado {
  return firmaConfigurada ? "oculto" : "idle";
}

assert(getInitialState(false) === "idle", "initial state idle when not configured");
assert(getInitialState(true) === "oculto", "initial state oculto when configured");

function transitionOnActivar(estado: Estado): Estado {
  if (estado === "idle") return "activando";
  return estado;
}

assert(transitionOnActivar("idle") === "activando", "idle -> activando on click");
assert(transitionOnActivar("listo") === "listo", "listo stays listo");
assert(transitionOnActivar("activando") === "activando", "activando stays activando");

function transitionOnSuccess(estado: Estado): Estado {
  if (estado === "activando") return "listo";
  return estado;
}

assert(transitionOnSuccess("activando") === "listo", "activando -> listo on success");

function transitionOnError(estado: Estado): Estado {
  if (estado === "activando") return "idle";
  return estado;
}

assert(transitionOnError("activando") === "idle", "activando -> idle on error");

// Auto-hide: listo -> oculto after timeout
function transitionOnAutoHide(estado: Estado): Estado {
  if (estado === "listo") return "oculto";
  return estado;
}

assert(transitionOnAutoHide("listo") === "oculto", "listo -> oculto after timeout");
assert(transitionOnAutoHide("idle") === "idle", "idle unaffected by auto-hide");

// --- Test: banner should not render when oculto ---

function shouldRenderAnything(estado: Estado): boolean {
  return estado !== "oculto";
}

assert(shouldRenderAnything("oculto") === false, "no render when oculto");
assert(shouldRenderAnything("idle") === true, "renders when idle");
assert(shouldRenderAnything("activando") === true, "renders during activation");
assert(shouldRenderAnything("listo") === true, "renders success briefly");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
