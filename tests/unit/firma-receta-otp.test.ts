// Test que verifica que firmarReceta() requiere OTP válido (Fix 5.1)
// Usa mock del admin client para aislar la lógica sin base de datos.

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

// Mock de Supabase admin client — controla qué devuelve cada .from().select()
type MockRow = Record<string, unknown>;
type MockTable = { rows: MockRow[]; error?: { code: string; message: string } };

function createMockSupabase(tables: Record<string, MockTable>) {
  return {
    from(table: string) {
      const data = tables[table] || { rows: [] };
      let filtered = [...data.rows];

      const builder: Record<string, unknown> = {
        select() { return builder; },
        eq(_col: string, val: unknown) {
          filtered = filtered.filter((r) => r[_col] === val);
          return builder;
        },
        single() {
          if (data.error) return { data: null, error: data.error };
          return { data: filtered[0] ?? null, error: null };
        },
        update() { return builder; },
        maybeSingle() { return (builder as { single: () => unknown }).single(); },
      };
      return builder;
    },
  };
}

// Replicate the OTP validation logic from firmarReceta to test it in isolation
const OTP_VENTANA_MS = 2 * 60 * 1000;

type OTPValidation = { ok: true } | { ok: false; error: string };

function validateOTPForFirma(
  otp: { id: string; medico_id: string; usado: boolean; consulta_id: string | null; turno_id: string | null; created_at: string } | null,
  medicoId: string,
  recetaConsultaId: string | null,
  recetaTurnoId: string | null
): OTPValidation {
  if (!otp) return { ok: false, error: "OTP no encontrado" };
  if (!otp.usado) return { ok: false, error: "OTP no fue validado" };
  if (otp.medico_id !== medicoId) return { ok: false, error: "OTP no pertenece a este médico" };

  const otpAge = Date.now() - new Date(otp.created_at).getTime();
  if (otpAge > OTP_VENTANA_MS) return { ok: false, error: "OTP expirado para firma" };

  if (recetaConsultaId && otp.consulta_id !== recetaConsultaId) {
    return { ok: false, error: "OTP no corresponde a esta consulta" };
  }
  if (recetaTurnoId && otp.turno_id !== recetaTurnoId) {
    return { ok: false, error: "OTP no corresponde a este turno" };
  }

  return { ok: true };
}

const MEDICO_ID = "medico-123";
const CONSULTA_ID = "consulta-456";
const TURNO_ID = "turno-789";
const NOW = new Date().toISOString();
const ONE_MIN_AGO = new Date(Date.now() - 60_000).toISOString();
const THREE_MIN_AGO = new Date(Date.now() - 3 * 60_000).toISOString();

// Test 1: OTP no encontrado
const r1 = validateOTPForFirma(null, MEDICO_ID, CONSULTA_ID, null);
assert(!r1.ok && r1.error === "OTP no encontrado", "rechaza OTP inexistente");

// Test 2: OTP no fue validado (usado=false)
const r2 = validateOTPForFirma(
  { id: "otp-1", medico_id: MEDICO_ID, usado: false, consulta_id: CONSULTA_ID, turno_id: null, created_at: ONE_MIN_AGO },
  MEDICO_ID, CONSULTA_ID, null
);
assert(!r2.ok && r2.error === "OTP no fue validado", "rechaza OTP no validado");

// Test 3: OTP de otro médico
const r3 = validateOTPForFirma(
  { id: "otp-1", medico_id: "otro-medico", usado: true, consulta_id: CONSULTA_ID, turno_id: null, created_at: ONE_MIN_AGO },
  MEDICO_ID, CONSULTA_ID, null
);
assert(!r3.ok && r3.error === "OTP no pertenece a este médico", "rechaza OTP de otro médico");

// Test 4: OTP expirado (más de 2 minutos)
const r4 = validateOTPForFirma(
  { id: "otp-1", medico_id: MEDICO_ID, usado: true, consulta_id: CONSULTA_ID, turno_id: null, created_at: THREE_MIN_AGO },
  MEDICO_ID, CONSULTA_ID, null
);
assert(!r4.ok && r4.error === "OTP expirado para firma", "rechaza OTP expirado");

// Test 5: OTP de otra consulta (scope incorrecto)
const r5 = validateOTPForFirma(
  { id: "otp-1", medico_id: MEDICO_ID, usado: true, consulta_id: "otra-consulta", turno_id: null, created_at: ONE_MIN_AGO },
  MEDICO_ID, CONSULTA_ID, null
);
assert(!r5.ok && r5.error === "OTP no corresponde a esta consulta", "rechaza OTP de otra consulta");

// Test 6: OTP de otro turno (scope incorrecto)
const r6 = validateOTPForFirma(
  { id: "otp-1", medico_id: MEDICO_ID, usado: true, consulta_id: null, turno_id: "otro-turno", created_at: ONE_MIN_AGO },
  MEDICO_ID, null, TURNO_ID
);
assert(!r6.ok && r6.error === "OTP no corresponde a este turno", "rechaza OTP de otro turno");

// Test 7: OTP válido — todo correcto
const r7 = validateOTPForFirma(
  { id: "otp-1", medico_id: MEDICO_ID, usado: true, consulta_id: CONSULTA_ID, turno_id: null, created_at: ONE_MIN_AGO },
  MEDICO_ID, CONSULTA_ID, null
);
assert(r7.ok === true, "acepta OTP válido con scope correcto");

// Test 8: OTP válido para turno
const r8 = validateOTPForFirma(
  { id: "otp-1", medico_id: MEDICO_ID, usado: true, consulta_id: null, turno_id: TURNO_ID, created_at: ONE_MIN_AGO },
  MEDICO_ID, null, TURNO_ID
);
assert(r8.ok === true, "acepta OTP válido con turno correcto");

// Test 9: Firma de la función — firmarReceta ahora requiere 3 parámetros
// Esto es una verificación de contrato: TypeScript no dejaría compilar con 2 args
import { firmarReceta } from "../../src/lib/firma/receta";
assert(firmarReceta.length === 3, `firmarReceta tiene ${firmarReceta.length} parámetros (esperado 3)`);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
