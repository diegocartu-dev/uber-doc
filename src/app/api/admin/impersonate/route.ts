import { NextResponse } from "next/server";
import { verificarAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";

/**
 * POST /api/admin/impersonate
 * Genera un link firmado para ingresar como cualquier usuario.
 * El link va a /api/admin/impersonate-session que verifica el OTP
 * directamente sin pasar por el redirect chain de Supabase
 * (que se rompe con www/non-www y PKCE).
 * Solo accesible para admins autenticados.
 */
export async function POST(request: Request) {
  const admin = await verificarAdmin();
  if (!admin) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let userId: string;
  try {
    const body = await request.json();
    userId = body.userId;
  } catch {
    return NextResponse.json({ error: "userId requerido" }, { status: 400 });
  }

  if (!userId) {
    return NextResponse.json({ error: "userId requerido" }, { status: 400 });
  }

  const supabaseAdmin = createAdminClient();

  // Buscar el email del usuario
  const { data: userData, error: userError } =
    await supabaseAdmin.auth.admin.getUserById(userId);

  if (userError || !userData?.user?.email) {
    return NextResponse.json(
      { error: "Usuario no encontrado" },
      { status: 404 },
    );
  }

  // Generar magic link para obtener el OTP raw
  const { data: linkData, error: linkError } =
    await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: userData.user.email,
    });

  if (linkError || !linkData?.properties?.email_otp) {
    return NextResponse.json(
      { error: linkError?.message || "No se pudo generar el acceso" },
      { status: 500 },
    );
  }

  // Crear código firmado HMAC con email + OTP + expiración (2 minutos)
  const payload = JSON.stringify({
    email: userData.user.email,
    otp: linkData.properties.email_otp,
    exp: Date.now() + 120_000,
  });
  const sig = crypto
    .createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!)
    .update(payload)
    .digest("hex");
  const code =
    Buffer.from(payload).toString("base64url") + "." + sig;

  // URL relativa — se abre desde el mismo origin del admin,
  // evitando problemas de www vs non-www
  return NextResponse.json({
    ok: true,
    link: `/api/admin/impersonate-session?code=${encodeURIComponent(code)}`,
    email: userData.user.email,
  });
}
