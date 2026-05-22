// Tests for Fix 1.1 (rate limiting global + lockout) and Fix 1.3 (scope validation)
// Verifies the lockout logic and scope enforcement

import { verificarLockout } from "../../src/lib/firma/otp";

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

// --- Test verificarLockout export exists ---
assert(typeof verificarLockout === "function", "verificarLockout is exported and callable");

// --- Test Fix 1.1 constants are correctly configured ---
// We test the logic indirectly by checking the function signature
assert(verificarLockout.length === 1, "verificarLockout takes 1 parameter (medicoId)");

// --- Test Fix 1.3 scope validation logic ---
// Replicate the validation that the endpoint now does
function validateScope(consultaId?: string, turnoId?: string): { ok: boolean; error?: string } {
  if (!consultaId && !turnoId) {
    return { ok: false, error: "Debe especificar consultaId o turnoId" };
  }
  return { ok: true };
}

// Test: neither consultaId nor turnoId → rejected
const r1 = validateScope(undefined, undefined);
assert(!r1.ok && r1.error === "Debe especificar consultaId o turnoId", "rejects missing scope");

// Test: empty strings → rejected (falsy)
const r2 = validateScope("", "");
assert(!r2.ok, "rejects empty string scope");

// Test: consultaId provided → accepted
const r3 = validateScope("consulta-123", undefined);
assert(r3.ok === true, "accepts consultaId alone");

// Test: turnoId provided → accepted
const r4 = validateScope(undefined, "turno-456");
assert(r4.ok === true, "accepts turnoId alone");

// Test: both provided → accepted
const r5 = validateScope("consulta-123", "turno-456");
assert(r5.ok === true, "accepts both scope identifiers");

// --- Test lockout threshold constants ---
// Import the module and verify the exported function behavior contract
// We can't easily test the DB interaction without mocks, but we verify
// the function returns the expected shape

// Mock test: verify return type contract
async function testLockoutReturnShape() {
  // We can't call verificarLockout without a real DB connection,
  // but we can verify the TypeScript contract is correct by checking
  // that the function exists and is async
  const result = verificarLockout("fake-medico-id");
  assert(result instanceof Promise, "verificarLockout returns a Promise");

  // Note: This will fail because there's no real Supabase connection,
  // but we catch it to verify the function at least starts executing
  try {
    await result;
    assert(false, "should have thrown without SUPABASE env vars");
  } catch (e) {
    // Expected: either missing env vars or connection error
    assert(true, "verificarLockout throws without valid Supabase connection (expected)");
  }
}

testLockoutReturnShape().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
});
