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
 * ── DESCARGAR ES LEER: ACÁ NO SE SELLA NADA (R32, Diego 13/08) ───────────────
 * Esta ruta sellaba el período (`facturado_periodo`) cuando alguien bajaba el
 * detalle de un mes ya terminado. Ya no: **la institución no cierra nada**.
 * Puede mirar, filtrar y descargar el detalle de cualquier mes las veces que
 * quiera, y ninguna de esas descargas cambia una fila.
 *
 * Por qué estaba mal atarlo a la descarga: el sello es irreversible y quedaba
 * en manos de quién abrió qué pantalla y en qué orden. Una administrativa
 * bajando un borrador para revisarlo congelaba el mes; y si nadie descargaba,
 * el mes no se sellaba nunca. El estado contable de un período no puede
 * depender de un click.
 *
 * Ahora el mes se cierra SOLO, con el cron `metering-cerrar-mes` (R31): corte
 * de datos al último instante del mes, sello en la madrugada del día 1, y si
 * queda algo sin clasificar aborta, avisa y reintenta al día siguiente en vez
 * de sellar una foto incompleta. La corrida manual —si hiciera falta
 * adelantarla— es `POST /api/admin/institucional/cerrar-mes`, de admin de
 * Docto.
 *
 * Y una vez sellado, lo que baja de acá NO se mueve más: `facturacionDePeriodo`
 * arma la factura de un mes cerrado desde el sello, no desde el rango de
 * fechas, así que una fila que aparezca después no se le suma sola a un mes ya
 * facturado.
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

  // Si la lectura falla, NO se sirve un archivo: un CSV vacío (o corto) es
  // indistinguible de un mes tranquilo, y este archivo se usa para conciliar
  // una factura. Mejor un error que un papel que miente.
  let csv: string;
  try {
    const facturacion = await facturacionDePeriodo(pedido, { detalle: true });
    csv = facturacionACSV(facturacion);
  } catch (err) {
    console.error("[panel/facturacion] No se pudo armar el CSV de", pedido, err);
    return NextResponse.json(
      { error: "No se pudo generar el detalle del período. Probá de nuevo en un momento." },
      { status: 500 }
    );
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="facturacion-${pedido}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
