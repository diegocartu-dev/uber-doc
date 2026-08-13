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

// ── Capa A (la puerta): rutas del B2C que NO existen en la instancia ─────────
// Registro abierto (el alta es provisionada), marketplace/clínica pública,
// triage, arrepentimiento (no hay consumo pagado) e insights (mide plata de
// MP; el panel institucional es otro).
//
// Las tres últimas se sumaron en la Etapa 3: son la biblioteca personal del
// paciente del B2C (sus consultas, sus datos, sus documentos), con branding
// Docto y menú. La regla de la pantalla institucional es "una sola, sin menú y
// sin callejones", y el que entra por un link tenía esa superficie entera
// navegable — con la sesión que el propio link le acababa de mintear.
//
// NO están acá, a propósito, dos que a primera vista pintarían:
//   · `/dashboard` — es la casa del PROFESIONAL en la instancia (turnos en
//     espera, agenda del día). Bloquearla dejaría al médico sin dónde trabajar.
//   · `/consulta`  — el destino de la CI institucional sigue siendo
//     `/consulta/[id]/confirmacion` (el clon del B2C, pendiente de la pantalla
//     propia). Bloquearla apagaría la consulta inmediata.
// Las dos quedan registradas como pendientes: la primera necesita un gate por
// ROL, no por ruta; la segunda se cierra cuando la CI tenga su pantalla.
//
// ⚠ CONSECUENCIA ACEPTADA: la pantalla de cierre de la CI (que hoy es el clon
// del B2C) tiene links a `/documentos` y `/mis-consultas` que ahora dan 404.
// Es el precio de cortar la superficie navegable hasta que la CI tenga su
// pantalla propia — la misma que ya figuraba como pendiente de esta etapa. En
// el TURNO, que es el caso de la demo, no falta nada: los documentos se listan
// dentro de la pantalla del paciente (estado E).
//
// La lista vive acá y no en el middleware porque es POLÍTICA del modo, no
// ruteo — y porque así se puede recorrer desde un test sin levantar el
// middleware entero.
const INSTITUCIONAL_BLOCKED = [
  "/auth/register",
  "/auth/registro-medico",
  "/clinica",
  "/dr",
  "/medicos",
  "/triage",
  "/arrepentimiento",
  "/insights",
  "/mis-consultas",
  "/mis-datos",
  "/documentos",
];

/**
 * ¿El modo institucional bloquea esta ruta? (404)
 *
 * EL GATE VA PRIMERO, antes de mirar la lista: en B2C esto devuelve false sin
 * recorrer nada — el hot path del middleware del B2C no evalúa ni una ruta.
 */
export function bloqueaRutaInstitucional(pathname: string): boolean {
  if (!esInstitucional()) return false;
  return INSTITUCIONAL_BLOCKED.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * ¿Hay plata que devolver? (spec institucional §6.3, gate #401)
 *
 * En B2C: sí, si hay un pago registrado — la rama de refund de siempre.
 * En la instancia: NUNCA. El paciente no pagó nada; `pago_id` debería ser NULL
 * siempre y el gate por modo es cinturón y tirantes — si un dato sucio trajera
 * un pago_id, ejecutar el refund encolaría devoluciones imposibles contra
 * cuentas de Mercado Pago que en esa base no existen.
 *
 * Es una función y no un `pago_id && !esInstitucional()` suelto porque la
 * pregunta se hace en dos lugares (el plazo de la CI y la ausencia del
 * profesional en un turno) y las dos respuestas tienen que ser LA MISMA.
 *
 * Devuelve un type guard para que adentro del `if` el `pago_id` siga siendo un
 * string y no haya que repetir el chequeo de null.
 */
export function correspondeRefund(pagoId: string | null | undefined): pagoId is string {
  return !!pagoId && !esInstitucional();
}

/**
 * ¿Se le puede crear la ficha de paciente a un usuario que acaba de confirmar
 * su mail / volver de OAuth? (spec institucional §5.3)
 *
 * En B2C SÍ: ese auto-create ES el onboarding — alguien se registró y su fila
 * de `pacientes` nace en el callback.
 *
 * En la instancia NO, nunca: el padrón es de ALTA PROVISIONADA (R17) y una
 * sesión sin fila de paciente no es un usuario nuevo, es un error — un
 * profesional, un operador, o un enlace apuntando a un alta a medias. Crearle
 * una ficha en ese momento mete basura en el padrón de la provincia.
 *
 * Se lee como una pregunta y no como `!esInstitucional()` suelto para que el
 * gate quede visible en los dos callbacks y testeable de un lado solo.
 */
export function permiteAutoCrearPaciente(): boolean {
  return !esInstitucional();
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
