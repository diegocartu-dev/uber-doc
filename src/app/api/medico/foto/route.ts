import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("foto") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });
    }

    // Validate file type — whitelist to prevent SVG XSS
    const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Solo se permiten JPG, PNG o WebP" }, { status: 400 });
    }

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "La imagen no puede superar 5MB" }, { status: 400 });
    }

    const ext = file.name.split(".").pop() || "jpg";
    const path = `medicos/${user.id}/perfil.${ext}`;

    const admin = createAdminClient();
    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload to storage (upsert to overwrite previous)
    const { error: uploadError } = await admin.storage
      .from("avatars")
      .upload(path, buffer, {
        contentType: file.type,
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
