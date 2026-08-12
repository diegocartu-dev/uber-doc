// Contrato de src/lib/instancia.ts — el flag del modo institucional.
// Runner: script tsx (patrón tests/unit). Ejecutar: npx tsx tests/unit/instancia.test.ts
//
// Lo que este test fija (regla de oro): sin la env seteada, o con cualquier
// valor distinto del string exacto "true", el modo es B2C. Un deploy B2C que
// no conoce la variable JAMÁS puede caer en modo institucional.

import {
  esInstitucional,
  esInstitucionalClient,
  assertNoInstitucional,
} from "../../src/lib/instancia";

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label} — esperado ${expected}, obtuve ${actual}`);
  }
}

function conEnv(
  valores: { INSTITUCIONAL?: string; NEXT_PUBLIC_INSTITUCIONAL?: string },
  fn: () => void
) {
  const prevServer = process.env.INSTITUCIONAL;
  const prevClient = process.env.NEXT_PUBLIC_INSTITUCIONAL;
  if (valores.INSTITUCIONAL === undefined) delete process.env.INSTITUCIONAL;
  else process.env.INSTITUCIONAL = valores.INSTITUCIONAL;
  if (valores.NEXT_PUBLIC_INSTITUCIONAL === undefined)
    delete process.env.NEXT_PUBLIC_INSTITUCIONAL;
  else process.env.NEXT_PUBLIC_INSTITUCIONAL = valores.NEXT_PUBLIC_INSTITUCIONAL;
  try {
    fn();
  } finally {
    if (prevServer === undefined) delete process.env.INSTITUCIONAL;
    else process.env.INSTITUCIONAL = prevServer;
    if (prevClient === undefined) delete process.env.NEXT_PUBLIC_INSTITUCIONAL;
    else process.env.NEXT_PUBLIC_INSTITUCIONAL = prevClient;
  }
}

// ── Regla de oro: flag ausente ⇒ B2C ─────────────────────────────────────────
conEnv({}, () => {
  check("flag ausente ⇒ esInstitucional() false", esInstitucional(), false);
  check(
    "flag ausente ⇒ esInstitucionalClient() false",
    esInstitucionalClient(),
    false
  );
  check(
    "flag ausente ⇒ assertNoInstitucional() true (la route sigue)",
    assertNoInstitucional(),
    true
  );
});

// ── Flag vacío o con valores "casi true" ⇒ B2C (solo "true" exacto activa) ──
for (const valor of ["", "false", "TRUE", "True", "1", "yes", " true"]) {
  conEnv({ INSTITUCIONAL: valor }, () => {
    check(
      `INSTITUCIONAL=${JSON.stringify(valor)} ⇒ esInstitucional() false`,
      esInstitucional(),
      false
    );
    check(
      `INSTITUCIONAL=${JSON.stringify(valor)} ⇒ assertNoInstitucional() true`,
      assertNoInstitucional(),
      true
    );
  });
}

// ── Flag "true" exacto ⇒ modo institucional ──────────────────────────────────
conEnv({ INSTITUCIONAL: "true" }, () => {
  check("INSTITUCIONAL=true ⇒ esInstitucional() true", esInstitucional(), true);
  check(
    "INSTITUCIONAL=true ⇒ assertNoInstitucional() false (la route corta con 404)",
    assertNoInstitucional(),
    false
  );
});

// ── El flag server y el client son independientes ────────────────────────────
conEnv({ INSTITUCIONAL: "true" }, () => {
  check(
    "INSTITUCIONAL=true sin NEXT_PUBLIC ⇒ esInstitucionalClient() false",
    esInstitucionalClient(),
    false
  );
});
conEnv({ NEXT_PUBLIC_INSTITUCIONAL: "true" }, () => {
  check(
    "NEXT_PUBLIC_INSTITUCIONAL=true ⇒ esInstitucionalClient() true",
    esInstitucionalClient(),
    true
  );
  check(
    "NEXT_PUBLIC_INSTITUCIONAL=true NO activa el modo server",
    esInstitucional(),
    false
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
