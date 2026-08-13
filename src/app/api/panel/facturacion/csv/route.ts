import { NextRequest, NextResponse } from "next/server";
import { notFound } from "next/navigation";
import { esInstitucional } from "@/lib/instancia";
import { requireAdminInstitucion } from "@/lib/auth/rol-institucional";
import {
  facturacionACSV,
  facturacionDePeriodo,
  periodoDeHoy,
  periodoValido,
} from "@/lib/metering/facturacion";

/**
 * `GET /api/panel/facturacion/csv?periodo=AAAA-MM` — el detalle de la factura
 * del mes (spec §6.5).
 *
 * SERVER-SIDE, no el patrón client-side de `/admin/consultas`: ese arma el CSV
 * con lo que la pantalla tenía paginado, y una factura que dependa del scroll
 * del que la descargó no es una factura.
 *
 * Lo que este export NO hace: sellar. El sello (`facturado_periodo`, que
 * congela las filas) lo pone el export corrido desde el /admin interno de
 * Docto — el día que la factura se emite de verdad. La institución puede mirar
 * su detalle cuantas veces quiera sin congelar nada.
 *
 * SOLO instancia institucional: en B2C es 404.
 */

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!esInstitucional()) notFound();

  const sesion = await requireAdminInstitucion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const pedido = req.nextUrl.searchParams.get("periodo") ?? periodoDeHoy();
  if (!periodoValido(pedido)) {
    return NextResponse.json({ error: "Período inválido (formato AAAA-MM)" }, { status: 400 });
  }

  const facturacion = await facturacionDePeriodo(pedido, { detalle: true });
  const csv = facturacionACSV(facturacion);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="facturacion-${pedido}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
