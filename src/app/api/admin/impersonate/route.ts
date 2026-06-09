import { NextResponse } from "next/server";
import { verificarAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/impersonate
 * Genera un magic link para ingresar como cualquier usuario.
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

  // Generar magic link
  const { data: linkData, error: linkError } =
    await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: userData.user.email,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard`,
      },
    });

  if (linkError || !linkData?.properties?.action_link) {
    return NextResponse.json(
      { error: linkError?.message || "No se pudo generar el link" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    link: linkData.properties.action_link,
    email: userData.user.email,
  });
}
