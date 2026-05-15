import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generarRecetaPDF } from "@/lib/pdf/receta";

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
    .select("id, tipo, diagnostico, contenido, created_at, medico_id, consulta_id, turno_id, paciente_id")
    .eq("id", documentoId)
    .single();

  if (docError || !doc) {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }

  // Datos del médico
  const { data: medico } = await supabase
    .from("medicos")
    .select("nombre_completo, especialidad, numero_matricula, tipo_matricula, domicilio")
    .eq("id", doc.medico_id)
    .single();

  // Datos del paciente
  const { data: paciente } = await supabase
    .from("pacientes")
    .select("nombre_completo, dni, cuil, sexo_dni, fecha_nacimiento, tiene_cobertura, obra_social, nro_afiliado, plan_obra_social")
    .eq("id", doc.paciente_id)
    .single();

  if (!medico || !paciente) {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 500 });
  }

  const documento = {
    id: doc.id,
    tipo: doc.tipo as "receta" | "indicaciones" | "certificado",
    diagnostico: doc.diagnostico,
    contenido: doc.contenido,
    created_at: doc.created_at,
    medico_nombre: medico.nombre_completo,
    medico_especialidad: medico.especialidad ?? "",
    medico_matricula: `${medico.tipo_matricula ?? ""} ${medico.numero_matricula ?? ""}`.trim(),
    medico_domicilio: medico.domicilio ?? "",
    paciente_nombre: paciente.nombre_completo,
    paciente_dni: paciente.dni ?? "",
    paciente_cuil: paciente.cuil ?? "",
    paciente_sexo_dni: paciente.sexo_dni ?? null,
    paciente_fecha_nacimiento: paciente.fecha_nacimiento ?? null,
    paciente_tiene_cobertura: paciente.tiene_cobertura ?? false,
    paciente_obra_social: paciente.obra_social ?? null,
    paciente_nro_afiliado: paciente.nro_afiliado ?? null,
    paciente_plan_obra_social: paciente.plan_obra_social ?? null,
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
    console.error("[PDF]", "Error generando PDF", err);
    return NextResponse.json({ error: "Error generando PDF" }, { status: 500 });
  }
}
