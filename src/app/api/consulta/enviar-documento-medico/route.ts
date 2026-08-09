import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarDocumentoMedico } from "@/lib/email";

// Respaldo del servidor. El tope que manda es el de la plataforma (~4,5 MB),
// que corta antes de llegar acá; el freno real está en el navegador.
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_DOCS_PER_CONSULTA = 3;
const HOURS_48 = 48 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    // Verify user is a doctor
    // Se suma `titulo` ("Dr." / "Dra.") porque el mail al paciente nombra al
    // médico como sujeto de la frase ("La Dra. Ana García te compartió…"): sin el
    // título el mail salía con el nombre pelado. Es columna con GRANT para
    // `authenticated`. SOLO `titulo`: una columna sin GRANT haría fallar la query
    // ENTERA en PostgREST y el médico pasaría a leerse como "no es médico".
    const { data: medico } = await supabase
      .from("medicos")
      .select("id, nombre_completo, titulo")
      .eq("user_id", user.id)
      .single();

    if (!medico) {
      return NextResponse.json({ error: "No es médico" }, { status: 403 });
    }

    const formData = await request.formData();
    const consultaId = formData.get("consultaId") as string;
    const file = formData.get("archivo") as File | null;

    if (!consultaId || !file) {
      return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Solo se pueden enviar archivos PDF" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "El archivo es muy pesado. Mandá las páginas que importan en un archivo más liviano." },
        { status: 400 }
      );
    }

    // Verify doctor owns this consultation
    const { data: consulta } = await supabase
      .from("consultas")
      .select("id, medico_id, paciente_id, estado, created_at")
      .eq("id", consultaId)
      .single();

    if (!consulta || consulta.medico_id !== medico.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // Check 48h window for completed consultations
    if (consulta.estado === "completada") {
      const horasDesdeCreacion = Date.now() - new Date(consulta.created_at).getTime();
      if (horasDesdeCreacion > HOURS_48) {
        return NextResponse.json(
          { error: "Pasaron más de 48 horas desde la consulta" },
          { status: 400 }
        );
      }
    } else if (!["en_curso"].includes(consulta.estado)) {
      return NextResponse.json(
        { error: "La consulta no está activa ni completada recientemente" },
        { status: 400 }
      );
    }

    // Check max docs per consultation (tracked in metadata — count existing sent docs)
    const admin = createAdminClient();
    const { data: sentDocsData, count } = await admin
      .from("documentos")
      .select("id", { count: "exact" })
      .eq("consulta_id", consultaId)
      .eq("tipo", "documento_medico");

    if ((count ?? sentDocsData?.length ?? 0) >= MAX_DOCS_PER_CONSULTA) {
      return NextResponse.json(
        { error: `Máximo ${MAX_DOCS_PER_CONSULTA} documentos por consulta` },
        { status: 400 }
      );
    }

    // Get patient email
    const { data: { user: pacienteUser } } = await admin.auth.admin.getUserById(
      consulta.paciente_id
    );

    if (!pacienteUser?.email) {
      return NextResponse.json(
        { error: "No se encontró el email del paciente" },
        { status: 500 }
      );
    }

    // Get patient name
    const { data: paciente } = await admin
      .from("pacientes")
      .select("id, nombre_completo")
      .eq("user_id", consulta.paciente_id)
      .single();

    // Send email with attachment
    const buffer = Buffer.from(await file.arrayBuffer());
    await enviarDocumentoMedico({
      pacienteEmail: pacienteUser.email,
      pacienteNombre: paciente?.nombre_completo ?? "Paciente",
      medicoNombre: medico.nombre_completo,
      medicoTitulo: medico.titulo ?? null,
      fecha: new Date(consulta.created_at).toLocaleDateString("es-AR"),
      archivo: {
        filename: file.name,
        content: buffer.toString("base64"),
      },
    });

    // Track sent document (for max count)
    await admin.from("documentos").insert({
      consulta_id: consultaId,
      paciente_id: paciente?.id ?? null,
      medico_id: medico.id,
      tipo: "documento_medico",
      diagnostico: null,
      contenido: `Documento enviado: ${file.name}`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[enviar-documento-medico]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
