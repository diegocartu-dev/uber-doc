import { NextResponse } from "next/server";
import { withCron } from "@/lib/cron-guard";
import { cortarSiB2C } from "@/lib/institucional/crons-institucionales";
import {
  cerrarReunionesVencidas,
  HORAS_REUNION_ABIERTA,
} from "@/lib/institucional/demo-invitacion";

/**
 * Cron horario — LIMPIA LAS REUNIONES DE DEMOSTRACIÓN QUE QUEDARON ABIERTAS.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
 * El único apagador del modo demo era un botón. Si nadie lo tocaba —y en una
 * gira de tres o cuatro reuniones eso pasa— quedaban en la base de la provincia
 * el nombre y el celular de las personas que fueron a esa reunión, fichas de
 * profesional con agenda cargada, y pacientes de utilería en el padrón. Nada de
 * eso tiene vencimiento propio: sin este barrido, la única forma de que se
 * fueran era que alguien se acordara.
 *
 * No sustituye al botón, que sigue siendo la vía normal (se toca al terminar,
 * delante de todos, y es parte del argumento de venta). Es el piso.
 *
 * ── POR QUÉ NO CORTA UNA REUNIÓN EN CURSO ────────────────────────────────────
 * Solo mira reuniones abiertas hace más de `HORAS_REUNION_ABIERTA` (24 h), que
 * es más del doble de lo que vive el enlace del participante: cuando el barrido
 * llega, los accesos ya estaban muertos por vencimiento. Lo que limpia son los
 * datos, no una puerta.
 *
 * SOLO instancia institucional: en el B2C corta en la primera línea.
 */

export const maxDuration = 60;

async function handler() {
  const corte = cortarSiB2C("demo-cerrar-abiertas");
  if (corte) return corte;

  const resumen = await cerrarReunionesVencidas(HORAS_REUNION_ABIERTA);
  // Sin PII: ids y contadores. Los participantes son personas reales.
  if (resumen.abiertas > 0) console.log("[cron/demo-cerrar-abiertas]", JSON.stringify(resumen));

  // 500 cuando algo no se pudo borrar: son datos de personas reales esperando en
  // la base de una provincia, y el mail de `withCron` es lo único que lo cuenta.
  return NextResponse.json(resumen, { status: resumen.conProblemas.length > 0 ? 500 : 200 });
}

export const GET = withCron("demo-cerrar-abiertas", handler);
