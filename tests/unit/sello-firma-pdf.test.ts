// Tests for Ola 4 — Sello visual de firma electrónica en PDF
// Verifies firma data mapping, hash truncation, verification URL

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
  receta_id: "rec-12345678-abcd-efgh",
};
assert(isFirmaValida(firmaOk), "valid firma passes validation");

const firmaInvalida: FirmaDigitalPDF = {
  hash: "",
  algoritmo: "RSA-SHA256",
  firmado_at: "2026-05-22T15:30:00.000Z",
  receta_id: "rec-123",
};
assert(!isFirmaValida(firmaInvalida), "empty hash fails validation");

// --- Test: hash truncation for display ---

function truncateHash(hash: string): string {
  return hash.slice(0, 16).toUpperCase() + "...";
}

assert(
  truncateHash("abc123def456789012345678901234567890") === "ABC123DEF4567890...",
  "truncates hash to 16 chars uppercase"
);
assert(
  truncateHash("a".repeat(64)) === "AAAAAAAAAAAAAAAA...",
  "truncates long hash correctly"
);

// --- Test: verification URL generation ---

function generateVerifyUrl(recetaId: string): string {
  return `docto.com.ar/verificar/${recetaId.slice(0, 8)}`;
}

assert(
  generateVerifyUrl("rec-12345678-abcd-efgh") === "docto.com.ar/verificar/rec-1234",
  "generates verification URL with truncated ID"
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

// --- Test: sello text content ---

function formatFirmadoAt(iso: string): string {
  const d = new Date(iso);
  const fecha = d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  });
  const hora = d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  });
  return `Firmado: ${fecha} — ${hora} hs`;
}

const texto = formatFirmadoAt("2026-05-22T15:30:00.000Z");
assert(texto.startsWith("Firmado:"), "starts with Firmado:");
assert(texto.includes("hs"), "includes hs suffix");
assert(texto.length > 15, "has reasonable length");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
