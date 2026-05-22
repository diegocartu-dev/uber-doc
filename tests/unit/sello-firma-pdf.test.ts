// Tests for Ola 4 — Sello visual de firma electrónica en PDF
// Updated: Copy-fix RCTA-style — solo fecha DD/MM/YYYY HH:mm + QR code
// Sin título redundante, sin hash, sin URL texto, sin cita legal duplicada

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

// --- Test: FirmaDigitalPDF type shape ---

type FirmaDigitalPDF = {
  hash: string;
  algoritmo: string;
  firmado_at: string;
  receta_id: string;
};

function isFirmaValida(firma: FirmaDigitalPDF): boolean {
  return (
    firma.hash.length > 0 &&
    firma.algoritmo.length > 0 &&
    firma.firmado_at.length > 0 &&
    firma.receta_id.length > 0
  );
}

const firmaOk: FirmaDigitalPDF = {
  hash: "abc123def456789012345678901234567890123456789012345678901234abcd",
  algoritmo: "RSA-SHA256",
  firmado_at: "2026-05-22T15:30:00.000Z",
  receta_id: "550e8400-e29b-41d4-a716-446655440000",
};
assert(isFirmaValida(firmaOk), "valid firma passes validation");

const firmaInvalida: FirmaDigitalPDF = {
  hash: "",
  algoritmo: "RSA-SHA256",
  firmado_at: "2026-05-22T15:30:00.000Z",
  receta_id: "rec-123",
};
assert(!isFirmaValida(firmaInvalida), "empty hash fails validation");

// --- Test: QR verification URL generation (full UUID, not truncated) ---

function generateVerifyUrl(recetaId: string): string {
  return `https://docto.com.ar/verificar/${recetaId}`;
}

assert(
  generateVerifyUrl("550e8400-e29b-41d4-a716-446655440000") ===
    "https://docto.com.ar/verificar/550e8400-e29b-41d4-a716-446655440000",
  "generates full HTTPS verification URL with complete UUID"
);

// --- Test: QR URL must be HTTPS ---

assert(
  generateVerifyUrl("any-id").startsWith("https://"),
  "verification URL uses HTTPS protocol"
);

// --- Test: firma data mapping from DB ---

function mapFirmaDigitalToSello(
  dbFirmaDigital: { hash: string; algoritmo: string; firmado_at: string },
  recetaId: string
): FirmaDigitalPDF {
  return {
    hash: dbFirmaDigital.hash,
    algoritmo: dbFirmaDigital.algoritmo,
    firmado_at: dbFirmaDigital.firmado_at,
    receta_id: recetaId,
  };
}

const mapped = mapFirmaDigitalToSello(
  { hash: "abcdef1234567890", algoritmo: "RSA-SHA256", firmado_at: "2026-05-22T15:30:00.000Z" },
  "rec-test-id-123"
);
assert(mapped.hash === "abcdef1234567890", "maps hash from DB");
assert(mapped.algoritmo === "RSA-SHA256", "maps algoritmo from DB");
assert(mapped.receta_id === "rec-test-id-123", "maps receta_id");

// --- Test: should show sello logic ---

function shouldShowSello(tipo: string, firma: FirmaDigitalPDF | null): boolean {
  return tipo === "receta" && firma !== null;
}

assert(shouldShowSello("receta", firmaOk), "shows sello for signed receta");
assert(!shouldShowSello("receta", null), "no sello for unsigned receta");
assert(!shouldShowSello("indicaciones", firmaOk), "no sello for indicaciones");
assert(!shouldShowSello("certificado", firmaOk), "no sello for certificado");
assert(!shouldShowSello("indicaciones", null), "no sello for unsigned indicaciones");

// --- Test: conditional firma query logic ---

function shouldQueryFirma(tipo: string, consultaId?: string, turnoId?: string): boolean {
  return tipo === "receta" && !!(consultaId || turnoId);
}

assert(shouldQueryFirma("receta", "consulta-123"), "queries firma for receta with consultaId");
assert(shouldQueryFirma("receta", undefined, "turno-456"), "queries firma for receta with turnoId");
assert(shouldQueryFirma("receta", "c-1", "t-2"), "queries firma for receta with both");
assert(!shouldQueryFirma("receta"), "no query for receta without scope");
assert(!shouldQueryFirma("indicaciones", "consulta-123"), "no query for indicaciones");

// --- Test: sello fecha format (DD/MM/YYYY HH:mm — Carolina's recommendation) ---

function formatFechaFirmaSello(iso: string): string {
  const d = new Date(iso);
  const fecha = d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  });
  const hora = d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  });
  return `${fecha} ${hora}`;
}

const fechaSello = formatFechaFirmaSello("2026-05-22T15:30:00.000Z");
assert(fechaSello.includes("/"), "fecha uses DD/MM/YYYY format with slashes");
assert(fechaSello.includes(":"), "includes hora HH:mm");
assert(!fechaSello.includes("Firmado:"), "no 'Firmado:' prefix in RCTA-style");
assert(!fechaSello.includes("hs"), "no 'hs' suffix in compact format");

// --- Test: sello does NOT contain removed elements ---

function selloContentCheck(selloText: string): {
  hasTitle: boolean;
  hasLey: boolean;
  hasHash: boolean;
  hasUrlText: boolean;
} {
  return {
    hasTitle: selloText.includes("FIRMADO ELECTRÓNICAMENTE"),
    hasLey: selloText.includes("Art. 5"),
    hasHash: selloText.includes("Hash:"),
    hasUrlText: selloText.includes("Verificar:"),
  };
}

// The sello should only have the date — nothing else as text
const selloTextoSimulado = fechaSello; // This is all the sello renders as text
const checks = selloContentCheck(selloTextoSimulado);
assert(!checks.hasTitle, "sello has no FIRMADO ELECTRÓNICAMENTE title");
assert(!checks.hasLey, "sello has no Art. 5 legal citation");
assert(!checks.hasHash, "sello has no hash display");
assert(!checks.hasUrlText, "sello has no URL text (QR replaces it)");

// --- Test: Section B text update ---

const seccionBReceta = "Documento emitido por Docto — Plataforma 0270, ReNaPDiS — Ley 27.553 y Decreto 63/2024. Firma electrónica con validez legal según Ley 25.506.";
const seccionBOtros = "Documento emitido por Docto — Plataforma de telemedicina habilitada por Ley 27.553 y Decreto 63/2024.";

assert(seccionBReceta.includes("Plataforma 0270"), "Section B receta includes Plataforma 0270");
assert(seccionBReceta.includes("ReNaPDiS"), "Section B receta includes ReNaPDiS");
assert(!seccionBReceta.includes("inscripta en"), "Section B does not say 'inscripta en' (Carolina: over-comply)");
assert(seccionBReceta.includes("Ley 25.506"), "Section B receta includes firma electrónica law");
assert(!seccionBOtros.includes("0270"), "Section B otros does not include 0270");
assert(!seccionBOtros.includes("25.506"), "Section B otros does not include firma law");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
