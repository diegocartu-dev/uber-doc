// POST /api/admin/institucional/cerrar-semana — la corrida MANUAL del cierre
// semanal, con la semana que se le pase (I2 del gate #405).
//
// ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
// `cerrarSemana(semanaAr)` acepta la semana como parámetro desde el día uno,
// pero el único que la llamaba era el cron de los lunes, y el cron sella
// SIEMPRE la semana que acaba de terminar y no vuelve nunca sobre la anterior.
// O sea que una semana perdida —el job de metering caído el fin de semana, un
// deploy en el momento equivocado, un encuentro que cerró tarde— se quedaba sin
// sellar para siempre y no había ningún camino operativo para recuperarla: el
// parámetro existía y no había forma de pasárselo.
//
// Ahora la hay, y con la misma precondición de siempre: si la semana todavía
// tiene encuentros sin clasificar o en curso, `cerrarSemana` se niega y dice
// cuántos son. Este endpoint no puede forzar un sello, y eso es deliberado —
// un sello es inmutable y la respuesta correcta a "falta algo" es esperar.
//
// GET con `?semana=` responde el diagnóstico sin sellar nada: sirve para mirar
// antes de decidir. El runbook está en
// `docs/runbooks/institucional-cierre-semanal.md`.
//
// ── EL GUARD ES DE ADMIN DE DOCTO, NO DE LA INSTITUCIÓN ──────────────────────
// El sello es una operación de la plataforma sobre su propio contador, no una
// función del panel del cliente: la administración de la institución no puede
// —ni tiene por qué— decidir cuándo se congela el número que se le factura.
//
// SOLO instancia institucional: en B2C es 404.

import { NextRequest, NextResponse } from "next/server";
import { notFound } from "next/navigation";
import { esInstitucional } from "@/lib/instancia";
import { verificarAdmin } from "@/lib/admin-auth";
import {
  cerrarSemana,
  encuentrosSinClasificar,
  semanaASellar,
  semanaTerminada,
} from "@/lib/metering/bolsa";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** "2026-10-19" y además LUNES: media semana no es una semana. */
function semanaValida(valor: string | null | undefined): string | null {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const ms = Date.parse(`${valor}T12:00:00Z`);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).getUTCDay() === 1 ? valor : null;
}

/** Diagnóstico: qué falta para poder sellar esa semana. NO sella. */
export async function GET(req: NextRequest) {
  if (!esInstitucional()) notFound();
  if (!(await verificarAdmin())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const semana = semanaValida(req.nextUrl.searchParams.get("semana")) ?? semanaASellar();
  try {
    const termino = semanaTerminada(semana);
    const faltan = await encuentrosSinClasificar(semana);
    return NextResponse.json({
      semana_ar: semana,
      // Una semana que no terminó NUNCA es sellable, por más que no falte nada:
      // "no falta nada" es trivialmente cierto en una semana que no empezó.
      sellable: termino && faltan.total === 0,
      termino,
      faltantes: faltan,
    });
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    console.error("[admin/cerrar-semana] Diagnóstico fallado:", semana, detalle);
    return NextResponse.json({ semana_ar: semana, error: detalle }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!esInstitucional()) notFound();
  if (!(await verificarAdmin())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  let body: { semana?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // Sin `semana` en el body NO se asume nada: la semana que se sella se dice
  // siempre, porque el resultado es irreversible. (El cron sí tiene un default,
  // pero el cron corre solo y siempre sobre la misma.)
  const semana = semanaValida(body.semana ?? req.nextUrl.searchParams.get("semana"));
  if (!semana) {
    return NextResponse.json(
      {
        error:
          "Falta `semana` (el LUNES de la semana a sellar, formato AAAA-MM-DD). " +
          `La última semana terminada es ${semanaASellar()}.`,
      },
      { status: 422 }
    );
  }

  // ── Y QUE HAYA TERMINADO ───────────────────────────────────────────────────
  // `semanaValida` verifica formato y que sea lunes; media semana no es una
  // semana, y una semana que TODAVÍA NO TERMINÓ, tampoco. La precondición de
  // `cerrarSemana` (encuentros sin clasificar) no cubre este caso: un martes a
  // la noche —o con un lunes futuro— da total=0 porque no hay nada vivo, y
  // `cumplimientoDeSemana` solo cuenta lo transcurrido. Resultado: se sellaría
  // el cumplimiento de un día y medio, o de cero, como si fuera la semana
  // entera; y el sello es inmutable (trigger de la 015), así que corregirlo es
  // reabrir filas a mano por SQL.
  //
  // Basta un typo de fecha siguiendo el runbook para facturarle a la
  // institución el 20 % de las horas.
  if (!semanaTerminada(semana)) {
    return NextResponse.json(
      {
        semana_ar: semana,
        error:
          `La semana ${semana} todavía no terminó: no se puede sellar. El sello es ` +
          `irreversible y el cumplimiento se calcula solo sobre lo transcurrido. ` +
          `La última semana terminada es ${semanaASellar()}.`,
      },
      { status: 422 }
    );
  }

  try {
    const resumen = await cerrarSemana(semana);
    console.log("[admin/cerrar-semana]", JSON.stringify(resumen));
    return NextResponse.json(resumen, { status: resumen.errores > 0 ? 500 : 200 });
  } catch (err) {
    // La precondición incumplida (encuentros sin clasificar o en curso) llega
    // por acá con su mensaje entero: es lo que el runbook necesita leer.
    const detalle = err instanceof Error ? err.message : String(err);
    console.error("[admin/cerrar-semana] No se pudo cerrar", semana, detalle);
    return NextResponse.json({ semana_ar: semana, error: detalle }, { status: 409 });
  }
}
