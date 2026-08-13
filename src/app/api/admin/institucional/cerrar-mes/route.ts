// POST /api/admin/institucional/cerrar-mes — la corrida MANUAL del cierre
// mensual de la facturación (R31), con el mes que se le pase.
//
// ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
// El cierre lo hace solo el cron del día 1, y ese cron cierra SIEMPRE el mes
// que acaba de terminar: no vuelve nunca sobre el anterior. O sea que un mes
// que no se pudo cerrar —el job de metering atrasado, una consulta que quedó
// viva el día 31, un deploy en el momento equivocado— se quedaría sin sellar
// para siempre si no hubiera esta puerta. Es el espejo exacto de
// `cerrar-semana`, y el mismo runbook.
//
// La precondición NO se puede saltear desde acá: si el mes todavía tiene
// encuentros sin clasificar o en curso, `cerrarMes` se niega y dice cuántos
// son. Es deliberado — un sello es inmutable y la respuesta correcta a "falta
// algo" es esperar, no forzar.
//
// GET con `?periodo=` responde el diagnóstico sin sellar nada: sirve para mirar
// antes de decidir.
//
// ── EL GUARD ES DE ADMIN DE DOCTO, NO DE LA INSTITUCIÓN ──────────────────────
// R32: la institución no cierra nada. Puede mirar, filtrar y descargar el
// detalle de cualquier mes las veces que quiera, pero congelar el número que se
// le factura es una operación de la plataforma sobre su propio contador.
//
// SOLO instancia institucional: en B2C es 404.

import { NextRequest, NextResponse } from "next/server";
import { notFound } from "next/navigation";
import { esInstitucional } from "@/lib/instancia";
import { verificarAdmin } from "@/lib/admin-auth";
import { encuentrosSinClasificarEnRango } from "@/lib/metering/bolsa";
import {
  cerrarMes,
  mesTerminado,
  periodoASellar,
  periodoValido,
  rangoDePeriodo,
} from "@/lib/metering/facturacion";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Diagnóstico: qué falta para poder cerrar ese mes. NO sella. */
export async function GET(req: NextRequest) {
  if (!esInstitucional()) notFound();
  if (!(await verificarAdmin())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const pedido = req.nextUrl.searchParams.get("periodo");
  const periodo = pedido && periodoValido(pedido) ? pedido : periodoASellar();
  try {
    const termino = mesTerminado(periodo);
    const { desde, hasta } = rangoDePeriodo(periodo);
    const faltan = await encuentrosSinClasificarEnRango(desde, hasta);
    return NextResponse.json({
      periodo,
      // Un mes que no terminó NUNCA es sellable, por más que no falte nada:
      // "no falta nada" es trivialmente cierto en un mes que no empezó.
      sellable: termino && faltan.total === 0,
      termino,
      faltantes: faltan,
    });
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    console.error("[admin/cerrar-mes] Diagnóstico fallado:", periodo, detalle);
    return NextResponse.json({ periodo, error: detalle }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!esInstitucional()) notFound();
  if (!(await verificarAdmin())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  let body: { periodo?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // Sin `periodo` en el body NO se asume nada: el mes que se sella se dice
  // siempre, porque el resultado es irreversible. (El cron sí tiene un default,
  // pero el cron corre solo y siempre sobre el mismo.)
  const periodo = body.periodo ?? req.nextUrl.searchParams.get("periodo") ?? "";
  if (!periodoValido(periodo)) {
    return NextResponse.json(
      {
        error:
          "Falta `periodo` (el mes a cerrar, formato AAAA-MM). " +
          `El último mes terminado es ${periodoASellar()}.`,
      },
      { status: 422 }
    );
  }

  // El "todavía no terminó" se responde 422 (pedido mal formado: ese mes no es
  // cerrable todavía) y no 409, para distinguirlo de la precondición del
  // contador, que sí se resuelve esperando unos minutos y reintentando.
  if (!mesTerminado(periodo)) {
    return NextResponse.json(
      {
        periodo,
        error:
          `El mes ${periodo} todavía no terminó: no se puede cerrar. El sello es ` +
          `irreversible y la foto es del mes calendario completo. El último mes ` +
          `terminado es ${periodoASellar()}.`,
      },
      { status: 422 }
    );
  }

  try {
    const resumen = await cerrarMes(periodo);
    console.log("[admin/cerrar-mes]", JSON.stringify(resumen));
    return NextResponse.json(resumen);
  } catch (err) {
    // La precondición incumplida (encuentros sin clasificar o en curso) llega
    // por acá con su mensaje entero: es lo que el runbook necesita leer.
    const detalle = err instanceof Error ? err.message : String(err);
    console.error("[admin/cerrar-mes] No se pudo cerrar", periodo, detalle);
    return NextResponse.json({ periodo, error: detalle }, { status: 409 });
  }
}
