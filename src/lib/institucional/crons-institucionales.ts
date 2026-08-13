// src/lib/institucional/crons-institucionales.ts
// El ESPEJO de la Capa C: los crons que solo tienen trabajo en la instancia
// institucional (spec §9, tabla de crons — fila "metering-clasificar,
// acuerdo-cerrar-semana [NUEVOS]: solo hacen trabajo en modo institucional").
//
// `vercel.json` es uno solo por repo, así que estos dos también se invocan en
// el deploy del B2C. Ahí no tienen NADA que hacer: `encuentros_metering` y
// `acuerdo_semanas` ni siquiera existen en esa base. Sin este corte, cada
// corrida terminaría en un error de PostgREST ("relation does not exist"), el
// heartbeat lo registraría como fallo y el watchdog empezaría a mandar mails
// rojos por una tarea que en el B2C no significa nada.
//
// ── REGLA DE ORO ─────────────────────────────────────────────────────────────
// Es la misma que la de `capa-c.ts`, con el signo dado vuelta: allá el cron del
// B2C sigue de largo y la instancia corta; acá la instancia sigue de largo y el
// B2C corta. Un gate escrito al revés apagaría el metering en la instancia (la
// factura dejaría de contar sola, en silencio) — por eso el golden test recorre
// esta lista igual que la otra.

import { NextResponse } from "next/server";
import { esInstitucional } from "@/lib/instancia";

/** Los crons que nacieron con el modo institucional. El test recorre la lista. */
export const CRONS_SOLO_INSTITUCIONALES = [
  "metering-clasificar", // el contador contractual (spec §6.3)
  "acuerdo-cerrar-semana", // sella la bolsa de horas de la semana que pasó (§6.4)
] as const;

export type CronSoloInstitucional = (typeof CRONS_SOLO_INSTITUCIONALES)[number];

/**
 * `null` → el cron sigue con su trabajo (instancia institucional).
 * Response → estamos en el B2C y no hay nada que hacer.
 *
 * El body imita el de la Capa C a propósito: el heartbeat de `withCron` y el
 * watchdog ya saben leer esa forma.
 */
export function cortarSiB2C(key: CronSoloInstitucional): NextResponse | null {
  if (esInstitucional()) return null;
  console.log(`[${key}] modo B2C: no aplica`);
  return NextResponse.json({ ok: true, mensaje: "modo B2C: no aplica" });
}
