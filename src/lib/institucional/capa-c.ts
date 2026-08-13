// src/lib/institucional/capa-c.ts
// Capa C del modo institucional: los crons del B2C que en la instancia NO
// APLICAN y cortan al principio (decisión §9 de la spec: early-return por modo,
// no build filtrado).
//
// Los cinco tenían las mismas cuatro líneas copiadas. Estaban bien, pero
// copiadas cinco veces: nadie puede afirmar de un vistazo que las cinco dicen
// lo mismo, y el día que una se escriba al revés (`if (!esInstitucional())`)
// el cron se apagaría en el B2C — o sea, en producción, sobre plata real, en
// silencio. Con una sola función, esa afirmación se testea una vez.
//
// ── LA REGLA DE ORO, EN UNA LÍNEA ────────────────────────────────────────────
// Con el flag apagado devuelve `null`, que significa "seguí, no pasó nada". El
// cron del B2C corre exactamente igual que antes.

import { NextResponse } from "next/server";
import { esInstitucional } from "@/lib/instancia";

/** Los cinco de la Capa C. La lista está acá para que el test la recorra. */
export const CRONS_CAPA_C = [
  "liberar-reservas", // sin pago no existe `reservado_pendiente` que liberar
  "recuperar-registros", // el alta es provisionada: no hay registro abandonado
  "reintentar-refunds", // sin Mercado Pago no hay refunds
  "saldo-servicios", // los saldos los vigila el deploy B2C (evita alertas dobles)
  "verificar-cuentas-mp", // nadie conecta cuentas de MP
] as const;

export type CronCapaC = (typeof CRONS_CAPA_C)[number];

/**
 * `null` → el cron sigue con su trabajo de siempre (B2C).
 * Response → el cron termina acá porque en la instancia no tiene sentido.
 *
 * El body es el mismo que tenían las cinco copias, a propósito: lo lee el
 * heartbeat de `withCron` y el watchdog, que ya conocen esta respuesta.
 */
export function cortarSiInstitucional(key: CronCapaC): NextResponse | null {
  if (!esInstitucional()) return null;
  console.log(`[${key}] modo institucional: no aplica`);
  return NextResponse.json({ ok: true, mensaje: "modo institucional: no aplica" });
}
