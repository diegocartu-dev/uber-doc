import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import sharp from "sharp";

// MIME types aceptados — incluye HEIC/HEIF de iPhone
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

// Extensiones permitidas en el path final (post-conversión siempre es jpg)
const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp"];

// Tipos que requieren conversión a JPEG
const NEEDS_CONVERSION = ["image/heic", "image/heif"];

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    // Verificar que el usuario sea médico (evita que pacientes llenen el bucket)
    const { data: medico } = await supabase
      .from("medicos")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (!medico) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("foto") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });
    }

    // Validate file type — whitelist to prevent SVG XSS
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Solo se permiten JPG, PNG, WebP o HEIC" },
        { status: 400 }
      );
    }

    // Validate size (max 5MB — HEIC suele ser más liviano que JPEG equivalente)
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "La imagen no puede superar 5MB" },
        { status: 400 }
      );
    }

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    let finalBuffer: Buffer;
    let contentType = file.type;
    let ext: string;

    if (NEEDS_CONVERSION.includes(file.type)) {
      // Conversión HEIC/HEIF → JPEG via sharp
      // sharp usa libvips que soporta HEIF nativamente
      finalBuffer = await sharp(rawBuffer)
        .jpeg({ quality: 85 })
        .resize(800, 800, { fit: "inside", withoutEnlargement: true })
        .toBuffer();
      contentType = "image/jpeg";
      ext = "jpg";
    } else {
      // Sanitizar extensión con whitelist (defensa en profundidad)
      const rawExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
      ext = ALLOWED_EXT.includes(rawExt) ? rawExt : "jpg";
      finalBuffer = rawBuffer;
    }

    const path = `medicos/${user.id}/perfil.${ext}`;

    const admin = createAdminClient();

    // Upload to storage (upsert to overwrite previous)
    const { error: uploadError } = await admin.storage
      .from("avatars")
      .upload(path, finalBuffer, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = admin.storage.from("avatars").getPublicUrl(path);
    const fotoUrl = urlData.publicUrl + `?v=${Date.now()}`;

    // Update medico record
    const { error: updateError } = await supabase
      .from("medicos")
      .update({ foto_url: fotoUrl })
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, foto_url: fotoUrl });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
