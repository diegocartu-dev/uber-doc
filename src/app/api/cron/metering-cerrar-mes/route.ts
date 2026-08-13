import { NextResponse } from "next/server";
import { withCron } from "@/lib/cron-guard";
import { cortarSiB2C } from "@/lib/institucional/crons-institucionales";
import { cerrarMes, periodoASellar } from "@/lib/metering/facturacion";

/**
 * Cron del día 1 a las 02:00 ART — CIERRA EL MES QUE TERMINÓ (R31).
 *
 * "El mes se cierra solo, el último día a las 24:00. Nadie tiene que cerrar
 * nada a mano." El corte de datos es el mes calendario completo (hasta las
 * 23:59:59 del último día, hora argentina); el sello se estampa unas horas
 * después, ya en el día 1, porque el contador necesita terminar de clasificar
 * los últimos encuentros: una consulta que termina 23:55 se clasifica pasada la
 * medianoche. La foto siempre es del mes; lo que se demora es el revelado.
 *
 * ── POR QUÉ 02:00 Y NO 00:05 ────────────────────────────────────────────────
 * Mismo motivo que el cierre semanal, que corre a la misma hora los lunes: un
 * encuentro se clasifica recién 15 minutos después de su cierre y el job corre
 * cada 10, así que lo que cerró 23:55 entra a `encuentros_metering` a las
 * 00:15-00:20. Sellar a las 00:05 lo dejaría afuera del mes que sí lo cobra.
 *
 * (Los crons de Vercel se programan en UTC: `0 5 1 * *` = 02:00 ART del día 1.)
 *
 * ── SI FALTA ALGO, NO SELLA: ABORTA Y AVISA ─────────────────────────────────
 * La precondición es la misma del cierre semanal, extendida al rango del mes:
 * si queda un encuentro terminal sin clasificar —o uno TODAVÍA VIVO del último
 * día— `cerrarMes` se niega. El 500 llega al mail de `withCron` con el período
 * adentro, que es lo que hace falta para pedir la corrida manual
 * (`POST /api/admin/institucional/cerrar-mes`). Una foto incompleta sellada es
 * inmutable; una foto que sale tres horas tarde, no es nada.
 *
 * Idempotente: si vuelve a correr sobre un mes ya sellado, no toca ninguna fila.
 *
 * SOLO instancia institucional: en el B2C corta en la primera línea.
 */

export const maxDuration = 60;

async function handler() {
  const corte = cortarSiB2C("metering-cerrar-mes");
  if (corte) return corte;

  const periodo = periodoASellar();
  try {
    const resumen = await cerrarMes(periodo);
    console.log("[cron/metering-cerrar-mes]", JSON.stringify(resumen));
    return NextResponse.json(resumen);
  } catch (err) {
    // Precondición incumplida o lectura fallida: las dos son un 500 a
    // propósito. El cron cierra SIEMPRE el mes anterior y no vuelve nunca sobre
    // el que faltó, así que un "no pude" silencioso dejaría el mes sin sellar
    // para siempre y con el watchdog en verde.
    const detalle = err instanceof Error ? err.message : String(err);
    console.error("[cron/metering-cerrar-mes] No se pudo cerrar", periodo, detalle);
    return NextResponse.json({ periodo, error: detalle }, { status: 500 });
  }
}

export const GET = withCron("metering-cerrar-mes", handler);
