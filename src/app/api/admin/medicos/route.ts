import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ADMIN_EMAILS = ["diegocartu@gmail.com", "diegocartu@me.com"];

async function verificarAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !ADMIN_EMAILS.includes(user.email ?? "")) return null;
  return user;
}

export async function GET() {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const admin = createAdminClient();
  const { data: medicos, error } = await admin
    .from("medicos")
    .select("id, nombre_completo, email, dni, tipo_matricula, numero_matricula, provincia_matricula, especialidad, foto_credencial_url, estado_registro, created_at, cuit")
    .eq("estado_registro", "pendiente_revision")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ medicos: medicos ?? [] });
}

export async function PATCH(req: NextRequest) {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { medicoId, accion, motivo } = await req.json();
  if (!medicoId || !accion) {
    return NextResponse.json({ error: "medicoId y accion son obligatorios" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (accion === "aprobar") {
    const { error } = await admin
      .from("medicos")
      .update({
        verificado: true,
        estado_registro: "aprobado",
        verificado_at: new Date().toISOString(),
        verificado_por: user.email,
      })
      .eq("id", medicoId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, estado: "aprobado" });
  }

  if (accion === "rechazar") {
    const { error } = await admin
      .from("medicos")
      .update({
        estado_registro: "rechazado",
        verificado: false,
      })
      .eq("id", medicoId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, estado: "rechazado" });
  }

  return NextResponse.json({ error: "Acción no reconocida" }, { status: 400 });
}
