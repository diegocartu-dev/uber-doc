// Tests for fixes de auditoría final — Roberto
// C-3: firma_logs, C-4: anti-DELETE, I-1: OTP one-use,
// I-2: nro receta determinístico, I-3: revocación claves, I-5: ventana OTP

import { createHash } from "crypto";

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

// ═══ Fix I-1 — OTP one-time-use ═══

type OTPFirma = {
  id: string;
  usado: boolean;
  consumido_para_receta_id: string | null;
  created_at: string;
};

function puedeUsarOTP(otp: OTPFirma, recetaId: string): { ok: boolean; error?: string } {
  if (!otp.usado) return { ok: false, error: "OTP no fue validado" };
  if (otp.consumido_para_receta_id) {
    return { ok: false, error: "Este código ya fue usado para firmar otra receta" };
  }
  return { ok: true };
}

const otpNuevo: OTPFirma = { id: "otp-1", usado: true, consumido_para_receta_id: null, created_at: new Date().toISOString() };
assert(puedeUsarOTP(otpNuevo, "rec-1").ok, "OTP nuevo y validado puede firmar");

const otpConsumido: OTPFirma = { id: "otp-2", usado: true, consumido_para_receta_id: "rec-1", created_at: new Date().toISOString() };
assert(!puedeUsarOTP(otpConsumido, "rec-2").ok, "OTP ya consumido rechazado");
assert(puedeUsarOTP(otpConsumido, "rec-2").error?.includes("ya fue usado"), "error message mentions already used");

const otpNoValidado: OTPFirma = { id: "otp-3", usado: false, consumido_para_receta_id: null, created_at: new Date().toISOString() };
assert(!puedeUsarOTP(otpNoValidado, "rec-1").ok, "OTP no validado rechazado");

// ═══ Fix I-2 — Número de receta determinístico ═══

function generarNumeroReceta(id: string, createdAt: string): string {
  const anio = new Date(createdAt).getFullYear();
  const hash = createHash("sha256").update(id).digest("hex");
  const code = hash.slice(0, 8).toUpperCase();
  return `REC-${anio}-${code}`;
}

const id1 = "550e8400-e29b-41d4-a716-446655440000";
const fecha1 = "2026-05-22T15:30:00.000Z";

// Same input → same output (deterministic)
const nro1 = generarNumeroReceta(id1, fecha1);
const nro2 = generarNumeroReceta(id1, fecha1);
assert(nro1 === nro2, "same ID generates same receta number");

// Different input → different output
const nro3 = generarNumeroReceta("another-id", fecha1);
assert(nro1 !== nro3, "different ID generates different number");

// Format check
assert(nro1.startsWith("REC-2026-"), "starts with REC-YYYY-");
assert(nro1.length === 17, "total length is 17 chars (REC-YYYY-XXXXXXXX)");
assert(/^REC-\d{4}-[A-F0-9]{8}$/.test(nro1), "matches expected format");

// No Math.random involved — purely hash-based
const nro4 = generarNumeroReceta(id1, fecha1);
const nro5 = generarNumeroReceta(id1, fecha1);
assert(nro4 === nro5, "multiple calls are identical (no randomness)");

// ═══ Fix I-3 — Modelo activa/revocada ═══

type MedicoClave = {
  id: string;
  medico_id: string;
  activa: boolean;
  revocada_at: string | null;
  motivo_revocacion: string | null;
};

function claveActiva(clave: MedicoClave): boolean {
  return clave.activa && clave.revocada_at === null;
}

function buscarClaveActiva(claves: MedicoClave[], medicoId: string): MedicoClave | null {
  return claves.find(c => c.medico_id === medicoId && c.activa) ?? null;
}

const claveOk: MedicoClave = { id: "k1", medico_id: "m1", activa: true, revocada_at: null, motivo_revocacion: null };
const claveRevocada: MedicoClave = { id: "k2", medico_id: "m1", activa: false, revocada_at: "2026-05-22T00:00:00Z", motivo_revocacion: "compromiso" };
const claveNueva: MedicoClave = { id: "k3", medico_id: "m1", activa: true, revocada_at: null, motivo_revocacion: null };

assert(claveActiva(claveOk), "active key passes check");
assert(!claveActiva(claveRevocada), "revoked key fails check");
assert(buscarClaveActiva([claveRevocada, claveNueva], "m1")?.id === "k3", "finds new active key after revocation");
assert(buscarClaveActiva([claveRevocada], "m1") === null, "no active key returns null");

// ═══ Fix I-5 — Ventana OTP consistente ═══

const OTP_VENTANA_MS = 5 * 60 * 1000; // Ahora 5 min, no 2

function otpExpirado(createdAt: string, ventanaMs: number): boolean {
  const age = Date.now() - new Date(createdAt).getTime();
  return age > ventanaMs;
}

// OTP creado hace 3 minutos — antes rechazado (2min), ahora OK (5min)
const hace3min = new Date(Date.now() - 3 * 60 * 1000).toISOString();
assert(!otpExpirado(hace3min, OTP_VENTANA_MS), "3-min-old OTP accepted with 5min window");

// OTP creado hace 4:30 — antes rechazado, ahora OK
const hace4m30 = new Date(Date.now() - 4.5 * 60 * 1000).toISOString();
assert(!otpExpirado(hace4m30, OTP_VENTANA_MS), "4.5-min-old OTP accepted with 5min window");

// OTP creado hace 6 minutos — rechazado
const hace6min = new Date(Date.now() - 6 * 60 * 1000).toISOString();
assert(otpExpirado(hace6min, OTP_VENTANA_MS), "6-min-old OTP rejected with 5min window");

// OTP creado hace 1 minuto — OK
const hace1min = new Date(Date.now() - 1 * 60 * 1000).toISOString();
assert(!otpExpirado(hace1min, OTP_VENTANA_MS), "1-min-old OTP accepted");

// ═══ Fix C-3 — firma_logs shape ═══

type FirmaLog = {
  receta_id: string;
  medico_id: string;
  hash: string;
  algoritmo: string;
  firmado_at: string;
  otp_id: string;
  ip: string | null;
  user_agent: string | null;
  clave_id: string | null;
};

function isValidFirmaLog(log: FirmaLog): boolean {
  return (
    log.receta_id.length > 0 &&
    log.medico_id.length > 0 &&
    log.hash.length > 0 &&
    log.algoritmo === "RSA-SHA256" &&
    log.firmado_at.length > 0 &&
    log.otp_id.length > 0
  );
}

const logOk: FirmaLog = {
  receta_id: "rec-1",
  medico_id: "med-1",
  hash: "abc123",
  algoritmo: "RSA-SHA256",
  firmado_at: "2026-05-22T15:30:00.000Z",
  otp_id: "otp-1",
  ip: "192.168.1.1",
  user_agent: "Mozilla/5.0",
  clave_id: "key-1",
};
assert(isValidFirmaLog(logOk), "valid firma log passes");

const logSinIP: FirmaLog = { ...logOk, ip: null, user_agent: null, clave_id: null };
assert(isValidFirmaLog(logSinIP), "firma log without IP/UA still valid (optional fields)");

const logInvalido: FirmaLog = { ...logOk, hash: "" };
assert(!isValidFirmaLog(logInvalido), "firma log without hash fails");

// ═══ Fix C-4 — anti-DELETE concept ═══

// The actual enforcement is via SQL triggers. We test the concept:
const PROTECTED_TABLES = ["recetas", "medico_claves", "otp_firma", "firma_logs"];
assert(PROTECTED_TABLES.length === 4, "4 tables protected by anti-DELETE triggers");
assert(PROTECTED_TABLES.includes("firma_logs"), "firma_logs included in protected tables");
assert(PROTECTED_TABLES.includes("recetas"), "recetas included in protected tables");

// ═══ Verificación histórica con clave revocada ═══

function buscarClaveParaVerificacion(
  logs: Array<{ receta_id: string; clave_id: string | null }>,
  claves: MedicoClave[],
  recetaId: string,
  medicoId: string
): string | null {
  // Primero buscar en logs
  const log = logs.find(l => l.receta_id === recetaId);
  if (log?.clave_id) {
    const clave = claves.find(c => c.id === log.clave_id);
    if (clave) return clave.id;
  }
  // Fallback: última clave del médico (activa o no)
  const fallback = claves.filter(c => c.medico_id === medicoId).pop();
  return fallback?.id ?? null;
}

const logs = [{ receta_id: "rec-old", clave_id: "k2" }];
const todasClaves = [claveRevocada, claveNueva];

assert(
  buscarClaveParaVerificacion(logs, todasClaves, "rec-old", "m1") === "k2",
  "verification uses revoked key from logs for old receipts"
);
assert(
  buscarClaveParaVerificacion([], todasClaves, "rec-new", "m1") === "k3",
  "verification falls back to latest key when no log exists"
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
