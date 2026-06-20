import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generarRecetaPDF } from "@/lib/pdf/receta";
import type { FirmaDigitalPDF, DocumentoPDF } from "@/lib/pdf/receta";

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

  // Buscar documento — RLS garantiza que solo el paciente o médico lo ve
  const { data: doc, error: docError } = await supabase
    .from("documentos")
    .select("id, tipo, diagnostico, contenido, tratamiento, dias_reposo, created_at, medico_id, consulta_id, turno_id, paciente_id")
    .eq("id", documentoId)
    .single();

  if (docError || !doc) {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }

  // Datos del médico
  const { data: medico } = await supabase
    .from("medicos")
    .select("nombre_completo, especialidad, numero_matricula, tipo_matricula, domicilio, domicilio_consultorio, firma_manuscrita_url")
    .eq("id", doc.medico_id)
    .single();

  // Datos del paciente
  const { data: paciente } = await supabase
    .from("pacientes")
    .select("nombre_completo, dni, cuil, sexo_dni, fecha_nacimiento, tiene_cobertura, obra_social, obra_social_id, obra_social_otra, nro_afiliado, plan_obra_social")
    .eq("id", doc.paciente_id)
    .single();

  if (!medico || !paciente) {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 500 });
  }

  // Buscar firma electrónica si es receta
  let firma: FirmaDigitalPDF | null = null;
  if (doc.tipo === "receta" && (doc.consulta_id || doc.turno_id)) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const adminDb = createAdminClient();

    // Buscar por consulta_id o turno_id
    let query = adminDb
      .from("recetas")
      .select("id, firma_digital, estado")
      .eq("estado", "emitida");

    if (doc.consulta_id) {
      query = query.eq("consulta_id", doc.consulta_id);
    } else if (doc.turno_id) {
      query = query.eq("turno_id", doc.turno_id);
    }

    const { data: recetas } = await query
      .order("created_at", { ascending: false })
      .limit(1);

    const receta = recetas?.[0];
    if (receta?.firma_digital) {
      const fd = receta.firma_digital as Record<string, unknown>;
      // Validación defensiva del JSONB
      if (
        typeof fd.hash === "string" && fd.hash &&
        typeof fd.algoritmo === "string" && fd.algoritmo &&
        typeof fd.firmado_at === "string" && fd.firmado_at
      ) {
        firma = {
          hash: fd.hash,
          algoritmo: fd.algoritmo,
          firmado_at: fd.firmado_at,
          receta_id: receta.id,
        };
      }
    }
  }

  // Resolve obra social name from FK if available
  let obraSocialNombre: string | null = paciente.obra_social ?? null;
  if (paciente.obra_social_id) {
    const { data: os } = await supabase
      .from("obras_sociales")
      .select("nombre")
      .eq("id", paciente.obra_social_id)
      .single();
    if (os?.nombre) obraSocialNombre = os.nombre;
  } else if (paciente.obra_social_otra) {
    obraSocialNombre = paciente.obra_social_otra;
  }

  const documento = {
    id: doc.id,
    tipo: doc.tipo as DocumentoPDF["tipo"],
    diagnostico: doc.diagnostico,
    contenido: doc.contenido,
    tratamiento: doc.tratamiento ?? null,
    dias_reposo: doc.dias_reposo ?? null,
    created_at: doc.created_at,
    medico_nombre: medico.nombre_completo,
    medico_especialidad: medico.especialidad ?? "",
    medico_matricula: `${medico.tipo_matricula ?? ""} ${medico.numero_matricula ?? ""}`.trim(),
    medico_domicilio: medico.domicilio_consultorio || medico.domicilio || "",
    paciente_nombre: paciente.nombre_completo,
    paciente_dni: paciente.dni ?? "",
    paciente_cuil: paciente.cuil ?? "",
    paciente_sexo_dni: paciente.sexo_dni ?? null,
    paciente_fecha_nacimiento: paciente.fecha_nacimiento ?? null,
    paciente_tiene_cobertura: paciente.tiene_cobertura ?? false,
    paciente_obra_social: obraSocialNombre,
    paciente_nro_afiliado: paciente.nro_afiliado ?? null,
    paciente_plan_obra_social: paciente.plan_obra_social ?? null,
    firma,
    medico_firma_manuscrita_path: medico.firma_manuscrita_url ?? null,
  };

  try {
    const pdfBuffer = await generarRecetaPDF(documento);

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${doc.tipo}-${doc.id.slice(0, 8)}.pdf"`,
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
