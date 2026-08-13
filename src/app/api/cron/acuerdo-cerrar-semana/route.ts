import { NextResponse } from "next/server";
import { withCron } from "@/lib/cron-guard";
import { cortarSiB2C } from "@/lib/institucional/crons-institucionales";
import { cerrarSemana, semanaASellar } from "@/lib/metering/bolsa";

/**
 * Cron de los lunes 00:05 ART — SELLA LA SEMANA QUE TERMINÓ (spec §6.4).
 *
 * La semana en curso se calcula al vuelo cada vez que alguien abre el panel.
 * La semana que pasó, no: se congela acá. No es una optimización — es la
 * promesa de que el cumplimiento que la institución leyó el lunes va a decir
 * lo mismo en diciembre, aunque después alguien edite una agenda vieja o un
 * webhook llegue tarde.
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
  const resumen = await cerrarSemana(semana);
  console.log("[cron/acuerdo-cerrar-semana]", JSON.stringify(resumen));

  return NextResponse.json(resumen, { status: resumen.errores > 0 ? 500 : 200 });
}

export const GET = withCron("acuerdo-cerrar-semana", handler);
