// src/lib/instancia.ts
// Helpers del MODO INSTITUCIONAL de la plataforma.
//
// Una instancia institucional es un deploy separado (otro proyecto Vercel +
// base de datos dedicada) del MISMO repo, con la env `INSTITUCIONAL=true`.
// Todo delta de comportamiento institucional en código compartido se gatea por
// estos helpers.
//
// ── REGLA DE ORO ─────────────────────────────────────────────────────────────
// Con `INSTITUCIONAL` sin setear, vacía o con cualquier valor distinto de
// "true", el comportamiento del B2C es IDÉNTICO, byte a byte. Cada gate es
// aditivo y se apaga solo. Ningún código puede asumir el modo institucional
// por defecto: el default es SIEMPRE B2C.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ¿Este deploy corre en modo institucional? (server-side)
 * Lee `INSTITUCIONAL`; solo el string exacto "true" activa el modo.
 */
export function esInstitucional(): boolean {
  return process.env.INSTITUCIONAL === "true";
}

/**
 * Variante client-side: lee `NEXT_PUBLIC_INSTITUCIONAL` (inlineada por Next
 * en build). Misma regla: solo "true" activa el modo.
 *
 * ⚠ PAR ACOPLADO: si algún gate client la usa, `NEXT_PUBLIC_INSTITUCIONAL`
 * debe setearse JUNTO a `INSTITUCIONAL` en el MISMO deploy — y como se
 * inlinea en build, cambiarla exige deploy fresco, nunca redeploy (mismo
 * pitfall que BETA_PASSWORD). Si divergen: links a 404 o pantallas vivas
 * invisibles. Por eso el sidebar de /admin NO la lee: recibe el flag por
 * prop desde el layout server (esInstitucional() = una sola fuente). Antes
 * de sumar un consumer client, preferir ese mismo patrón (prop desde un
 * server component). Runbook: supabase/migrations-institucional/README.md.
 */
export function esInstitucionalClient(): boolean {
  return process.env.NEXT_PUBLIC_INSTITUCIONAL === "true";
}

/**
 * Guard para routes de API que NO existen en modo institucional (Capa B:
 * pagos / Mercado Pago).
 *
 * Devuelve `true` si la route puede seguir (modo B2C — la aserción "no es
 * institucional" se cumple) y `false` si el deploy es institucional y la
 * route debe cortar. El 404 lo arma cada route, no este helper:
 *
 *   if (!assertNoInstitucional()) {
 *     return NextResponse.json({ error: "Not found" }, { status: 404 });
 *   }
 */
export function assertNoInstitucional(): boolean {
  return !esInstitucional();
}
