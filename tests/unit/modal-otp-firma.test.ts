// Tests for ModalOTPFirma component logic
// Verifies state transitions, digit handling, paste logic

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

// --- Test digit input logic ---

function handleDigitChange(digitos: string[], index: number, value: string): string[] {
  const digit = value.replace(/\D/g, "").slice(-1);
  const newDigitos = [...digitos];
  newDigitos[index] = digit;
  return newDigitos;
}

// Test: only digits accepted
const d1 = handleDigitChange(["", "", "", "", "", ""], 0, "5");
assert(d1[0] === "5", "accepts single digit");

const d2 = handleDigitChange(["", "", "", "", "", ""], 0, "abc");
assert(d2[0] === "", "rejects non-digit input");

const d3 = handleDigitChange(["", "", "", "", "", ""], 0, "a5b");
assert(d3[0] === "5", "extracts digit from mixed input");

// Test: only last digit when multiple
const d4 = handleDigitChange(["", "", "", "", "", ""], 0, "123");
assert(d4[0] === "3", "takes last digit from multiple input");

// --- Test paste logic ---

function handlePaste(clipboardText: string): string[] {
  const pasted = clipboardText.replace(/\D/g, "").slice(0, 6);
  const digitos = ["", "", "", "", "", ""];
  for (let i = 0; i < 6; i++) {
    digitos[i] = pasted[i] || "";
  }
  return digitos;
}

// Test: full 6-digit paste
const p1 = handlePaste("123456");
assert(p1.join("") === "123456", "handles full 6-digit paste");

// Test: paste with spaces (from email copy)
const p2 = handlePaste("1 2 3 4 5 6");
assert(p2.join("") === "123456", "strips spaces from pasted code");

// Test: paste with dashes
const p3 = handlePaste("123-456");
assert(p3.join("") === "123456", "strips dashes from pasted code");

// Test: partial paste
const p4 = handlePaste("12");
assert(p4[0] === "1" && p4[1] === "2" && p4[2] === "", "handles partial paste");

// Test: paste more than 6 digits
const p5 = handlePaste("12345678");
assert(p5.join("") === "123456", "truncates to 6 digits");

// Test: paste non-numeric
const p6 = handlePaste("abcdef");
assert(p6.join("") === "", "ignores non-numeric paste");

// --- Test cooldown format ---

function formatCooldown(seconds: number): string {
  return `0:${String(seconds).padStart(2, "0")}`;
}

assert(formatCooldown(30) === "0:30", "formats 30s cooldown");
assert(formatCooldown(5) === "0:05", "formats 5s cooldown with leading zero");
assert(formatCooldown(0) === "0:00", "formats 0s cooldown");

// --- Test email obfuscation helper ---

function ofuscarEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return local[0] + "****@" + domain;
}

assert(ofuscarEmail("doctor@gmail.com") === "d****@gmail.com", "obfuscates email");
assert(ofuscarEmail("a@test.com") === "a****@test.com", "obfuscates single char local");

// --- Test lockout time format ---

function formatBloqueadoHasta(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const testDate = "2026-05-22T15:42:00.000Z";
const formatted = formatBloqueadoHasta(testDate);
assert(typeof formatted === "string" && formatted.length > 0, "formats lockout time");

// --- Test code completeness check ---

function codigoCompleto(digitos: string[]): boolean {
  return digitos.every((d) => d !== "");
}

assert(codigoCompleto(["1", "2", "3", "4", "5", "6"]) === true, "detects complete code");
assert(codigoCompleto(["1", "2", "3", "4", "5", ""]) === false, "detects incomplete code");
assert(codigoCompleto(["", "", "", "", "", ""]) === false, "detects empty code");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
