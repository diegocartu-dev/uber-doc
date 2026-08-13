import { NextResponse } from "next/server";
import { withCron } from "@/lib/cron-guard";
import { cortarSiB2C } from "@/lib/institucional/crons-institucionales";
import { correrMeteringClasificar } from "@/lib/metering/clasificar";

/**
 * Cron cada 10 min — EL CONTADOR (spec institucional §6.3).
 *
 * Recorre los encuentros que ya terminaron, reconstruye cuánto estuvieron el
 * profesional y el paciente juntos en la sala, cuenta los documentos que se
 * emitieron, y escribe la clasificación contractual en `encuentros_metering`.
 * De esa tabla salen la factura del mes y el panel de la institución.
 *
 * Toda la lógica vive en `src/lib/metering/clasificar.ts` (testeable sin base:
 * los números del mock 4 son un caso de test). Acá solo está la plomería.
 *
 * SOLO instancia institucional: en el B2C corta en la primera línea.
 */

export const maxDuration = 60;

async function handler() {
  const corte = cortarSiB2C("metering-clasificar");
  if (corte) return corte;

  const resumen = await correrMeteringClasificar();

  // Log solo cuando pasó algo: una corrida vacía cada 10 minutos no le sirve a
  // nadie y esconde las que sí importan.
  if (resumen.clasificados > 0 || resumen.errores > 0 || resumen.sin_motor > 0) {
    console.log("[cron/metering-clasificar]", JSON.stringify(resumen));
  }

  // Un error de lectura o de upsert devuelve 500 a propósito: `withCron` lo
  // convierte en heartbeat fallido + mail. Un contador que deja de contar en
  // silencio es una factura que se arma mal el mes que viene.
  return NextResponse.json(resumen, { status: resumen.errores > 0 ? 500 : 200 });
}

export const GET = withCron("metering-clasificar", handler);
