import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "firmas-medicos";
const ALLOWED_TYPES = ["image/png", "image/jpeg"];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

/**
 * GET /api/medico/firma
 * Devuelve la imagen de firma manuscrita del médico autenticado.
 * Bucket privado — requiere auth.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    // Obtener path de la firma desde medicos
    const { data: medico } = await supabase
      .from("medicos")
      .select("firma_manuscrita_url")
      .eq("user_id", user.id)
      .single();

    if (!medico?.firma_manuscrita_url) {
      return NextResponse.json(
        { error: "No tiene firma cargada" },
        { status: 404 }
      );
    }

    // Descargar desde bucket privado con admin
    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(BUCKET)
      .download(medico.firma_manuscrita_url);

    if (error || !data) {
      return NextResponse.json(
        { error: "Error descargando firma" },
        { status: 500 }
      );
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    const ext = medico.firma_manuscrita_url.split(".").pop() || "png";
    const contentType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/**
 * POST /api/medico/firma
 * Sube la firma manuscrita del médico. FormData con campo "firma" (PNG/JPG).
 * Bucket privado — upsert para reemplazar firma anterior.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("firma") as File | null;
    if (!file) {
      return NextResponse.json(
        { error: "No se recibió archivo" },
        { status: 400 }
      );
    }

    // Validar tipo
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Solo se permiten PNG o JPG" },
        { status: 400 }
      );
    }

    // Validar tamaño
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "La imagen no puede superar 2MB" },
        { status: 400 }
      );
    }

    const ext = file.type === "image/png" ? "png" : "jpg";
    const storagePath = `medicos/${user.id}/firma.${ext}`;

    const admin = createAdminClient();
    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload al bucket privado (upsert para reemplazar)
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: uploadError.message },
        { status: 500 }
      );
    }

    // Guardar path en medicos (no URL pública — bucket privado)
    const { error: updateError } = await supabase
      .from("medicos")
      .update({ firma_manuscrita_url: storagePath })
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/**
 * DELETE /api/medico/firma
 * Elimina la firma manuscrita del médico.
 */
export async function DELETE() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    // Obtener path actual
    const { data: medico } = await supabase
      .from("medicos")
      .select("firma_manuscrita_url")
      .eq("user_id", user.id)
      .single();

    if (medico?.firma_manuscrita_url) {
      const admin = createAdminClient();
      await admin.storage
        .from(BUCKET)
        .remove([medico.firma_manuscrita_url]);
    }

    // Limpiar en DB
    const { error } = await supabase
      .from("medicos")
      .update({ firma_manuscrita_url: null })
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
