import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ADMIN_EMAILS = ["diegocartu@gmail.com"];

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !ADMIN_EMAILS.includes(user.email ?? "")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const path = req.nextUrl.searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "Path requerido" }, { status: 400 });
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
