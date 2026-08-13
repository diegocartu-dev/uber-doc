import { NextResponse } from "next/server";
import { withCron } from "@/lib/cron-guard";
import { cortarSiB2C } from "@/lib/institucional/crons-institucionales";
import { cerrarSemana, semanaASellar } from "@/lib/metering/bolsa";

/**
 * Cron de los lunes 04:00 ART — SELLA LA SEMANA QUE TERMINÓ (spec §6.4).
 *
 * La semana en curso se calcula al vuelo cada vez que alguien abre el panel.
 * La semana que pasó, no: se congela acá. No es una optimización — es la
 * promesa de que el cumplimiento que la institución leyó el lunes va a decir
 * lo mismo en diciembre, aunque después alguien edite una agenda vieja o un
 * webhook llegue tarde.
 *
 * ── POR QUÉ 04:00 Y NO 00:05 ────────────────────────────────────────────────
 * Porque a las 00:05 el contador todavía no terminó de contar el domingo: un
 * encuentro se clasifica recién 15 minutos después de su cierre y el job corre
 * cada 10, así que lo que cerró el domingo 23:55 entra a `encuentros_metering`
 * a las 00:15-00:20 — DESPUÉS del sello. Esos bloques quedaban fuera del
 * cumplimiento sellado para siempre, mientras la facturación (que lee la tabla
 * en vivo) sí los cobraba.
 *
 * Y 04:00 y no 02:00 porque a las 02:00 todavía no pasó el barrido: la CI que
 * el profesional abrió el domingo a la noche y nunca cerró la termina
 * `cerrar-huerfanas` (00:00 ART, con 4 h de antigüedad mínima), y hasta que no
 * es terminal la precondición del sello la cuenta como viva y aborta. Sellar
 * antes del barrido es abortar de gusto.
 *
 * El horario es la mitad barata del arreglo. La otra mitad está en
 * `cerrarSemana`, que se niega a sellar si queda un encuentro terminal de esa
 * semana sin fila en el contador — por si el job estuvo caído el fin de semana.
 *
 * Idempotente: si vuelve a correr sobre una semana ya sellada, no recalcula
 * nada. El primer número es el que vale.
 *
 * SOLO instancia institucional: en el B2C corta en la primera línea.
 */

export const maxDuration = 60;

async function handler() {
  const corte = cortarSiB2C("acuerdo-cerrar-semana");
  if (corte) return corte;

  const semana = semanaASellar();
  try {
    const resumen = await cerrarSemana(semana);
    console.log("[cron/acuerdo-cerrar-semana]", JSON.stringify(resumen));
    return NextResponse.json(resumen, { status: resumen.errores > 0 ? 500 : 200 });
  } catch (err) {
    // Una lectura fallida NO puede pasar por "no había nada que sellar": el
    // cron sella siempre la semana anterior y nunca vuelve sobre la que faltó.
    // El 500 llega al mail de `withCron` con la semana adentro, que es lo que
    // hace falta para pedir la corrida manual.
    const detalle = err instanceof Error ? err.message : String(err);
    console.error("[cron/acuerdo-cerrar-semana] No se pudo cerrar", semana, detalle);
    return NextResponse.json({ semana_ar: semana, error: detalle }, { status: 500 });
  }
}

export const GET = withCron("acuerdo-cerrar-semana", handler);
