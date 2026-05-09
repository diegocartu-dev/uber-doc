import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const estado = req.nextUrl.searchParams.get("estado");
  const admin = createAdminClient();

  let query = admin
    .from("medicos")
    .select("id, nombre_completo, email, dni, tipo_matricula, numero_matricula, provincia_matricula, especialidad, foto_credencial_url, estado_registro, created_at, cuit, user_id, domicilio, verificado, verificado_at, verificado_por, disponible, notas_admin, slug")
    .order("created_at", { ascending: true });

  if (estado) {
    query = query.eq("estado_registro", estado);
  }

  const { data: medicos, error } = await query;
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
  const ahora = new Date().toISOString();

  if (accion === "aprobar") {
    const { error } = await admin
      .from("medicos")
      .update({
        verificado: true,
        estado_registro: "aprobado",
        verificado_at: ahora,
        verificado_por: user.email,
      })
      .eq("id", medicoId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, estado: "aprobado" });
  }

  if (accion === "rechazar") {
    if (!motivo) return NextResponse.json({ error: "Motivo obligatorio para rechazar" }, { status: 400 });
    const { error } = await admin
      .from("medicos")
      .update({
        estado_registro: "rechazado",
        verificado: false,
        notas_admin: motivo,
      })
      .eq("id", medicoId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, estado: "rechazado" });
  }

  if (accion === "suspender") {
    if (!motivo) return NextResponse.json({ error: "Motivo obligatorio para suspender" }, { status: 400 });
    const { error } = await admin
      .from("medicos")
      .update({
        estado_registro: "suspendido",
        verificado: false,
        disponible: false,
        notas_admin: motivo,
      })
      .eq("id", medicoId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, estado: "suspendido" });
  }

  if (accion === "reactivar") {
    const { error } = await admin
      .from("medicos")
      .update({
        estado_registro: "aprobado",
        verificado: true,
        verificado_at: ahora,
        verificado_por: user.email,
        notas_admin: null,
      })
      .eq("id", medicoId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, estado: "aprobado" });
  }

  return NextResponse.json({ error: "Acción no reconocida" }, { status: 400 });
}
