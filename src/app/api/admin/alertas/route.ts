import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const estado = req.nextUrl.searchParams.get("estado") ?? "pendiente";
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("alertas_admin")
    .select("*")
    .eq("estado", estado)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ alertas: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { alertaId, accion, notas } = await req.json();
  if (!alertaId || !accion) {
    return NextResponse.json({ error: "alertaId y accion son obligatorios" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (accion === "resolver" || accion === "ignorar") {
    const { error } = await admin
      .from("alertas_admin")
      .update({
        estado: accion === "resolver" ? "resuelta" : "ignorada",
        resuelta_por: user.email,
        resuelta_at: new Date().toISOString(),
        notas: notas || null,
      })
      .eq("id", alertaId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Acción no reconocida" }, { status: 400 });
}
