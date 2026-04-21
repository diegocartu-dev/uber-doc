import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin } from "@/lib/admin";

export async function GET(req: NextRequest) {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const path = req.nextUrl.searchParams.get("path");
  if (!path || path.includes("..") || !/^[a-zA-Z0-9_\-\/]+\.\w+$/.test(path)) {
    return NextResponse.json({ error: "Path inválido" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data } = await admin.storage
    .from("credenciales-medicos")
    .createSignedUrl(path, 300);

  if (!data?.signedUrl) {
    return NextResponse.json({ error: "No se pudo generar URL" }, { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl);
}
