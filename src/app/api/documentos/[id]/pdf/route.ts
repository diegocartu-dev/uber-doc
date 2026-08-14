import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generarRecetaPDF } from "@/lib/pdf/receta";
import { armarDocumentoParaPDF } from "@/lib/pdf/documento-desde-db";
import { brandingParaPDF } from "@/lib/institucional/branding-pdf";
import { respuestaSiAccesoDemoMuerto } from "@/lib/institucional/demo-puerta";

/**
 * El PDF de un documento clínico, para su paciente o para el profesional que
 * lo emitió.
 *
 * EL GATE ES EL CLIENTE: se pasa el cliente con RLS, y las policies de
 * `documentos` son las que deciden si esta persona puede ver esta fila. Si no
 * puede, la query vuelve vacía y la respuesta es 404 — el mismo 404 que si el
 * documento no existiera, sin confirmar nada.
 *
 * El armado del `DocumentoPDF` (identidad congelada en la firma, obra social,
 * camino histórico de `recetas`) vive en `src/lib/pdf/documento-desde-db.ts`,
 * compartido con la descarga de historia clínica del panel institucional: es
 * la misma pieza de papel y tiene que salir igual por los dos caminos.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: documentoId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // ── LA PUERTA DEL PARTICIPANTE DE UNA REUNIÓN ─────────────────────────────
  // Este endpoint sirve el documento clínico entero, y el gate es el cliente
  // RLS — que para la sesión del participante dice que sí, porque la sesión es
  // suya. Revocar su enlace cierra la sesión, pero el access token que el
  // teléfono ya tiene sigue sirviendo cerca de una hora: sin esto, quien
  // fotografió el QR proyectado seguía bajando papeles durante toda esa hora.
  // En B2C no ejecuta nada (gate por modo adentro del helper).
  const accesoMuerto = await respuestaSiAccesoDemoMuerto();
  if (accesoMuerto) return accesoMuerto;

  const armado = await armarDocumentoParaPDF(supabase, documentoId);
  if (!armado.ok) {
    return armado.motivo === "no_encontrado"
      ? NextResponse.json({ error: "Documento no encontrado" }, { status: 404 })
      : NextResponse.json({ error: "Datos incompletos" }, { status: 500 });
  }

  try {
    // Marca blanca del documento (spec §7). En B2C devuelve `undefined` sin
    // tocar nada y el papel sale idéntico al de siempre.
    const pdfBuffer = await generarRecetaPDF(armado.documento, await brandingParaPDF(armado.documento.id));

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${armado.documento.tipo}-${armado.documento.id.slice(0, 8)}.pdf"`,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "unknown error";
    const errStack = err instanceof Error ? err.stack : "";
    console.error("[PDF] Error generando PDF:", errMsg);
    console.error("[PDF] Stack:", errStack);
    return NextResponse.json({ error: "Error generando PDF", detail: errMsg }, { status: 500 });
  }
}
