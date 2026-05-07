import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_TOTAL_BYTES = 50 * 1024 * 1024; // 50 MB
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const SIGNED_URL_EXPIRY = 4 * 60 * 60; // 4 hours

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const formData = await request.formData();
    const consultaId = formData.get("consultaId") as string;
    const file = formData.get("archivo") as File | null;

    if (!consultaId || !file) {
      return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Tipo de archivo no permitido. Solo PDF, JPG o PNG." },
        { status: 400 }
      );
    }

    // Verify patient owns this consultation and it's active
    const { data: consulta } = await supabase
      .from("consultas")
      .select("id, paciente_id, estado")
      .eq("id", consultaId)
      .single();

    if (!consulta || consulta.paciente_id !== user.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    if (!["esperando", "aceptada", "pagada", "en_curso"].includes(consulta.estado)) {
      return NextResponse.json(
        { error: "No se pueden subir estudios después de finalizar la consulta" },
        { status: 400 }
      );
    }

    // Check cumulative size using admin client (RLS might block listing)
    const admin = createAdminClient();
    const { data: existingFiles } = await admin.storage
      .from("consultas-temp")
      .list(consultaId);

    const currentSize = (existingFiles ?? []).reduce(
      (sum, f) => sum + (f.metadata?.size ?? 0),
      0
    );

    if (currentSize + file.size > MAX_TOTAL_BYTES) {
      return NextResponse.json(
        { error: "Límite de 50 MB por consulta excedido" },
        { status: 400 }
      );
    }

    // Sanitize filename: strip path separators, traversal, control chars
    const safeName = file.name
      .replace(/[\\/]/g, "_")
      .replace(/\.\./g, "_")
      .replace(/[\x00-\x1f]/g, "")
      .slice(0, 200) || "archivo";

    // Upload file
    const fileName = `${Date.now()}_${safeName}`;
    const filePath = `${consultaId}/${fileName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await admin.storage
      .from("consultas-temp")
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: "Error al subir archivo" },
        { status: 500 }
      );
    }

    // Generate signed URL
    const { data: signedUrlData } = await admin.storage
      .from("consultas-temp")
      .createSignedUrl(filePath, SIGNED_URL_EXPIRY);

    return NextResponse.json({
      ok: true,
      archivo: {
        name: file.name,
        path: filePath,
        size: file.size,
        type: file.type,
        signedUrl: signedUrlData?.signedUrl ?? null,
      },
    });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
