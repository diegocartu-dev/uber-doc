import { NextResponse } from "next/server";
import { notFound } from "next/navigation";
import { esInstitucional } from "@/lib/instancia";
import { requireAdminInstitucion } from "@/lib/auth/rol-institucional";
import { createAdminClient } from "@/lib/supabase/admin";
import { generarRecetaPDF } from "@/lib/pdf/receta";
import { armarDocumentoParaPDF } from "@/lib/pdf/documento-desde-db";
import { brandingParaPDF } from "@/lib/institucional/branding-pdf";

/**
 * Descarga de un documento clínico POR LA INSTITUCIÓN (escena 5 de la demo:
 * "la historia clínica queda disponible para la institución", R26).
 *
 * V1 = descarga por documento desde el panel. Sin API ni FHIR: está fuera del
 * alcance explícito del guion, y prometerlo antes de tiempo es peor que no
 * tenerlo.
 *
 * Tres cosas que hacen que esto NO sea el endpoint del paciente con otro
 * nombre:
 *   1. El gate es el ROL de operador (`admin_institucion`), no las policies de
 *      `documentos` — la institución no es el paciente ni el profesional, pero
 *      es la responsable de los datos de su padrón.
 *   2. Por eso la lectura va por service role, y por eso el guard de arriba no
 *      se puede saltear jamás.
 *   3. Cada descarga queda registrada en `descargas_hc` con quién la hizo.
 *      Poder bajarla no es lo mismo que bajarla sin dejar rastro.
 *
 * SOLO instancia institucional: en B2C es 404.
 */

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ documentoId: string }> }
) {
  if (!esInstitucional()) notFound();

  const sesion = await requireAdminInstitucion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { documentoId } = await params;
  const admin = createAdminClient();

  // Contexto del encuentro: para la auditoría, para el nombre del archivo y —
  // sobre todo— para el gate de PERTENENCIA de acá abajo.
  const { data: fila } = await admin
    .from("documentos")
    .select("consulta_id, turno_id")
    .eq("id", documentoId)
    .maybeSingle();
  const tipoEncuentro = fila?.turno_id ? "turno" : fila?.consulta_id ? "consulta" : null;
  const recursoId = (fila?.turno_id as string | null) ?? (fila?.consulta_id as string | null) ?? null;

  // ── EL GATE DE PERTENENCIA ──────────────────────────────────────────────────
  // El chequeo de arriba es de ROL: dice que quien pide es la administración de
  // una institución. Este dice que el documento es DE ESTA institución. Sin él,
  // el endpoint sirve cualquier documento de la base por id con service role —
  // que es exactamente lo que advierte el encabezado de `documento-desde-db.ts`.
  // Hoy, con una sola instancia dedicada, es casi lo mismo en la práctica; con
  // la marca blanca multi-institución que ya está en el plan, es cruce de
  // historias clínicas entre padrones. Una query, y el tema queda cerrado antes
  // de que exista la segunda institución.
  if (!tipoEncuentro || !recursoId) {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }
  const { data: delPadron, error: errPadron } = await admin
    .from("encuentros_metering")
    .select("id")
    .eq("tipo", tipoEncuentro)
    .eq("recurso_id", recursoId)
    .maybeSingle();
  if (errPadron) {
    console.error("[panel/hc] No se pudo verificar el encuentro:", errPadron.message);
    return NextResponse.json({ error: "No se pudo verificar el documento" }, { status: 500 });
  }
  if (!delPadron) {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }

  const armado = await armarDocumentoParaPDF(admin, documentoId);
  if (!armado.ok) {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }

  // La auditoría se escribe ANTES de servir el archivo: si falla el registro,
  // no se entrega. Es lo contrario a fire-and-forget, y a propósito — una
  // descarga de historia clínica sin rastro es justo lo que esta tabla existe
  // para impedir.
  const { error: errAuditoria } = await admin.from("descargas_hc").insert({
    operador_id: sesion.operador.id,
    documento_id: documentoId,
    tipo_encuentro: tipoEncuentro,
    recurso_id: recursoId,
    paciente_id: armado.pacienteId,
    medico_id: armado.medicoId,
  });
  if (errAuditoria) {
    console.error("[panel/hc] No se pudo registrar la descarga:", errAuditoria.message);
    return NextResponse.json(
      { error: "No se pudo registrar la descarga. Probá de nuevo en un momento." },
      { status: 500 }
    );
  }

  try {
    // El MISMO papel que baja el paciente, con la MISMA marca (spec §7): si
    // los dos caminos no pasaran el branding, el documento saldría distinto
    // según quién lo descargó, con el mismo id impreso al pie.
    const pdf = await generarRecetaPDF(armado.documento, await brandingParaPDF());
    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${armado.documento.tipo}-${documentoId.slice(0, 8)}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[panel/hc] Error generando el PDF:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Error generando el documento" }, { status: 500 });
  }
}
