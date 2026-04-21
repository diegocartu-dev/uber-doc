import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin } from "@/lib/admin";

export async function GET(req: NextRequest) {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const q = req.nextUrl.searchParams.get("q") ?? "";
  const admin = createAdminClient();

  let query = admin
    .from("pacientes")
    .select("id, user_id, nombre_completo, email, dni, fecha_nacimiento, obra_social, estado_cuenta, motivo_estado, estado_hasta, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (q) {
    const safe = q.replace(/[,.()"'\\]/g, "");
    query = query.or(`nombre_completo.ilike.%${safe}%,email.ilike.%${safe}%,dni.ilike.%${safe}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pacientes: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { pacienteId, accion, motivo, duracion } = await req.json();
  if (!pacienteId || !accion) {
    return NextResponse.json({ error: "pacienteId y accion son obligatorios" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (accion === "pausar") {
    if (!motivo) return NextResponse.json({ error: "Motivo obligatorio" }, { status: 400 });
    let estadoHasta: string | null = null;
    if (duracion && duracion !== "indefinido") {
      const dias = duracion === "7d" ? 7 : 30;
      const hasta = new Date();
      hasta.setDate(hasta.getDate() + dias);
      estadoHasta = hasta.toISOString();
    }
    const { error } = await admin
      .from("pacientes")
      .update({ estado_cuenta: "pausado", motivo_estado: motivo, estado_hasta: estadoHasta })
      .eq("id", pacienteId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, estado: "pausado" });
  }

  if (accion === "bloquear") {
    if (!motivo) return NextResponse.json({ error: "Motivo obligatorio" }, { status: 400 });
    const { error } = await admin
      .from("pacientes")
      .update({ estado_cuenta: "bloqueado", motivo_estado: motivo, estado_hasta: null })
      .eq("id", pacienteId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, estado: "bloqueado" });
  }

  if (accion === "reactivar") {
    const { error } = await admin
      .from("pacientes")
      .update({ estado_cuenta: "activo", motivo_estado: null, estado_hasta: null })
      .eq("id", pacienteId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, estado: "activo" });
  }

  return NextResponse.json({ error: "Acción no reconocida" }, { status: 400 });
}
