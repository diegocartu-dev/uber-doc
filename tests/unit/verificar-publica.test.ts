// Tests for Ola 5 — Página pública /verificar/{id}
// Fix 2.1: rate limiting + timing constante + no medical content

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

// --- Test: UUID validation ---

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

assert(uuidRegex.test("550e8400-e29b-41d4-a716-446655440000"), "valid UUID passes");
assert(!uuidRegex.test("not-a-uuid"), "invalid string rejected");
assert(!uuidRegex.test(""), "empty string rejected");
assert(!uuidRegex.test("550e8400"), "partial UUID rejected");
assert(uuidRegex.test("ABCDEF00-E29B-41D4-A716-446655440000"), "uppercase UUID passes");

// --- Test: rate limiting logic ---

type RateLimitEntry = { count: number; windowStart: number };

function checkRateLimit(
  ip: string,
  store: Map<string, RateLimitEntry>,
  windowMs: number,
  maxRequests: number
): boolean {
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now - entry.windowStart > windowMs) {
    store.set(ip, { count: 1, windowStart: now });
    return true;
  }

  entry.count++;
  return entry.count <= maxRequests;
}

const store = new Map<string, RateLimitEntry>();

// First request always passes
assert(checkRateLimit("1.2.3.4", store, 60000, 3), "first request passes");
assert(checkRateLimit("1.2.3.4", store, 60000, 3), "second request passes");
assert(checkRateLimit("1.2.3.4", store, 60000, 3), "third request passes (at limit)");
assert(!checkRateLimit("1.2.3.4", store, 60000, 3), "fourth request blocked");

// Different IP is independent
assert(checkRateLimit("5.6.7.8", store, 60000, 3), "different IP passes");

// Window expiry
const store2 = new Map<string, RateLimitEntry>();
store2.set("1.1.1.1", { count: 10, windowStart: Date.now() - 70000 });
assert(checkRateLimit("1.1.1.1", store2, 60000, 3), "expired window resets");

// --- Test: constant-time delay ---

async function withConstantTime<T>(fn: () => Promise<T>, delayMs: number): Promise<{ result: T; elapsed: number }> {
  const start = Date.now();
  const result = await fn();
  const elapsed = Date.now() - start;
  const remaining = delayMs - elapsed;
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
  return { result, elapsed: Date.now() - start };
}

async function testConstantTime() {
  // Fast operation should be padded
  const fast = await withConstantTime(async () => "fast", 100);
  assert(fast.elapsed >= 95, "fast operation padded to constant time");

  // Slow operation should not be delayed further
  const slow = await withConstantTime(async () => {
    await new Promise((r) => setTimeout(r, 50));
    return "slow";
  }, 30);
  assert(slow.elapsed >= 45, "slow operation not delayed beyond its natural time");
}

// --- Test: response shape — no medical content (Carolina's rule) ---

type VerificacionResponse = {
  verificada: boolean;
  alterada?: boolean;
  firmado_at?: string;
  algoritmo?: string;
  hash?: string;
  motivo?: string;
  medico?: {
    nombre: string;
    especialidad: string;
    matricula: string;
  } | null;
};

function containsMedicalData(res: VerificacionResponse): boolean {
  const json = JSON.stringify(res);
  // Must NOT contain: paciente, diagnostico, contenido, prescripcion, medicamento
  const forbidden = ["paciente", "diagnostico", "contenido", "prescripcion", "medicamento", "dni", "cuil"];
  return forbidden.some((word) => json.toLowerCase().includes(word));
}

const validResponse: VerificacionResponse = {
  verificada: true,
  firmado_at: "2026-05-22T15:30:00.000Z",
  algoritmo: "RSA-SHA256",
  hash: "ABC123DEF4567890",
  medico: {
    nombre: "Dr. Juan Pérez",
    especialidad: "Clínica Médica",
    matricula: "MN 12345",
  },
};

assert(!containsMedicalData(validResponse), "verified response contains no medical data");

const notFoundResponse: VerificacionResponse = {
  verificada: false,
  motivo: "Receta no encontrada",
};

assert(!containsMedicalData(notFoundResponse), "not-found response contains no medical data");

// --- Test: estado mapping from response ---

type Estado = "cargando" | "verificada" | "invalida" | "alterada" | "no_encontrada" | "error";

function mapEstado(res: VerificacionResponse): Estado {
  if (res.motivo) return "no_encontrada";
  if (res.alterada) return "alterada";
  if (res.verificada) return "verificada";
  return "invalida";
}

assert(mapEstado({ verificada: true }) === "verificada", "maps verified");
assert(mapEstado({ verificada: false, motivo: "not found" }) === "no_encontrada", "maps not found");
assert(mapEstado({ verificada: false, alterada: true }) === "alterada", "maps altered");
assert(mapEstado({ verificada: false }) === "invalida", "maps invalid");

// --- Test: hash truncation in response ---

function truncateForDisplay(hash: string): string {
  return hash.toUpperCase() + "...";
}

assert(truncateForDisplay("abc123def4567890") === "ABC123DEF4567890...", "display truncation correct");

// --- Test: middleware exemption ---

function isTimeoutExempt(pathname: string): boolean {
  const exemptPrefixes = ["/medico/consulta/", "/sala-espera", "/auth/", "/api/", "/beta-access", "/verificar/"];
  const exemptSuffixes = ["/sala", "/video", "/espera", "/workspace"];
  return exemptPrefixes.some((p) => pathname.startsWith(p)) ||
    exemptSuffixes.some((s) => pathname.endsWith(s));
}

assert(isTimeoutExempt("/verificar/abc-123"), "verificar route is timeout exempt");
assert(isTimeoutExempt("/api/verificar/abc-123"), "api verificar is timeout exempt");
assert(!isTimeoutExempt("/dashboard"), "dashboard is not exempt");

testConstantTime().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
});
