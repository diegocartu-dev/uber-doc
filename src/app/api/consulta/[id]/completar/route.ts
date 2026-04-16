import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarEmailDocumentosDisponibles } from "@/lib/email/enviar";

// POST /api/consulta/[id]/completar
// Finaliza la consulta CI: inserta documentos, actualiza estado, dispara email.
// Reemplaza la lógica client-side de WorkspaceConsulta.tsx para poder disparar el email server-side.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: consultaId } = await params;

    // Verificar autenticación
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const { diagnostico, receta, indicaciones, certificado } = body as {
      diagnostico: string;
      receta?: string;
      indicaciones?: string;
      certificado?: string;
    };

    if (!diagnostico?.trim()) {
      return NextResponse.json({ error: "El diagnóstico es obligatorio" }, { status: 400 });
    }

    const supabaseAdmin = createAdminClient();

    // Verificar que la consulta pertenece a este médico y está en estado válido
    const { data: consultaDb, error: consultaErr } = await supabaseAdmin
      .from("consultas")
      .select("id, estado, paciente_id, medico_id")
      .eq("id", consultaId)
      .eq("medico_id", user.id)
      .single();

    if (consultaErr || !consultaDb) {
      return NextResponse.json({ error: "Consulta no encontrada" }, { status: 404 });
    }

    if (consultaDb.estado === "completada") {
      return NextResponse.json({ ok: true, yaCompletada: true });
    }

    // Lookup paciente: consultas.paciente_id = auth.users.id, documentos.paciente_id = pacientes.id
    const { data: paciente } = await supabaseAdmin
      .from("pacientes")
      .select("id")
      .eq("user_id", consultaDb.paciente_id)
      .maybeSingle();

    if (!paciente) {
      return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });
    }

    // Lookup médico interno
    const { data: medico } = await supabaseAdmin
      .from("medicos")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!medico) {
      return NextResponse.json({ error: "Médico no encontrado" }, { status: 404 });
    }

    // Construir documentos
    const docs: { tipo: string; contenido: string }[] = [];
    if (receta?.trim()) docs.push({ tipo: "receta", contenido: receta.trim() });
    if (indicaciones?.trim()) docs.push({ tipo: "indicaciones", contenido: indicaciones.trim() });
    if (certificado?.trim()) docs.push({ tipo: "certificado", contenido: certificado.trim() });
    if (docs.length === 0) docs.push({ tipo: "indicaciones", contenido: diagnostico.trim() });

    const { error: docsError } = await supabaseAdmin.from("documentos").insert(
      docs.map((d) => ({
        consulta_id: consultaId,
        turno_id: null,
        paciente_id: paciente.id,
        medico_id: medico.id,
        tipo: d.tipo,
        diagnostico: diagnostico.trim(),
        contenido: d.contenido,
      }))
    );

    if (docsError) {
      return NextResponse.json({ error: "Error al guardar documentos" }, { status: 500 });
    }

    // Marcar consulta como completada
    const { error: updateError } = await supabaseAdmin
      .from("consultas")
      .update({ estado: "completada", doc_borrador: null })
      .eq("id", consultaId);

    if (updateError) {
      return NextResponse.json({ error: "Error al completar la consulta" }, { status: 500 });
    }

    // Fire and forget — no bloquea la respuesta al médico
    enviarEmailDocumentosDisponibles("consulta", consultaId).catch(console.error);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
