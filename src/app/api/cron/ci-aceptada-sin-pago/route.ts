import { NextResponse } from "next/server";
import { withCron } from "@/lib/cron-guard";
import { procesarAceptadasSinPago } from "@/lib/consultas/aceptada-sin-pago";

/**
 * La ventana entre "el profesional aceptó" y "el paciente pagó" (Diego, 10/09/2026).
 *
 * Hace dos cosas, las dos por consulta y con la regla en
 * `@/lib/consultas/aceptada-sin-pago`:
 *
 *  · A los 90 segundos, le avisa por WhatsApp al paciente — pero SOLO si dejó de
 *    mirar la pantalla y no está adentro del checkout. Al que está pagando no se
 *    lo interrumpe.
 *  · A los 10 minutos, cierra la consulta impaga y libera al profesional. Es la
 *    contracara del bloqueo de 3 minutos en su botón de cancelar.
 *
 * Cada minuto: el aviso tiene un plazo de 90 segundos y una cadencia más lenta lo
 * volvería impreciso justo donde importa. Vercel Pro permite cadencia por minuto.
 */
export const dynamic = "force-dynamic";

// Manda un WhatsApp por consulta y puede cerrar varias: los 15 s por defecto de
// Vercel no alcanzan si hay varias juntas.
export const maxDuration = 60;

async function handler() {
  const resultado = await procesarAceptadasSinPago();
  return NextResponse.json({ ok: true, ...resultado });
}

export const GET = withCron("ci-aceptada-sin-pago", handler);
