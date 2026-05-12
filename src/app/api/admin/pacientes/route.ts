import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin, getAdminUser } from "@/lib/admin-auth";
import { logAdminAction, ADMIN_ACTIONS } from "@/lib/admin-audit";

export async function GET(req: NextRequest) {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const q = req.nextUrl.searchParams.get("q") ?? "";
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1", 10);
  const pageSize = parseInt(req.nextUrl.searchParams.get("pageSize") || "50", 10);
  const estadoFiltro = req.nextUrl.searchParams.get("estado");
  const admin = createAdminClient();

  const offset = (page - 1) * pageSize;

  let query = admin
    .from("pacientes")
    .select("id, user_id, nombre_completo, email, dni, fecha_nacimiento, obra_social, estado_cuenta, motivo_estado, estado_hasta, created_at", { count: "exact" })
    .eq("es_cuenta_test", false)
    .order("created_at", { ascending: false });

  if (q) {
    const safe = q.replace(/[,.()"'\\]/g, "");
    query = query.or(`nombre_completo.ilike.%${safe}%,email.ilike.%${safe}%,dni.ilike.%${safe}%`);
  }

  if (estadoFiltro && estadoFiltro !== "todos") {
    query = query.eq("estado_cuenta", estadoFiltro);
  }

  query = query.range(offset, offset + pageSize - 1);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    pacientes: data ?? [],
    total: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize),
  });
}

export async function PATCH(req: NextRequest) {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { pacienteId, accion, motivo, duracion } = await req.json();
  if (!pacienteId || !accion) {
    return NextResponse.json({ error: "pacienteId y accion son obligatorios" }, { status: 400 });
  }

  const admin = createAdminClient();
  const adminUser = await getAdminUser(user.id);

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
    if (adminUser) {
      await logAdminAction({
        adminUserId: adminUser.id,
        accion: ADMIN_ACTIONS.PAUSAR_PACIENTE,
        recursoTipo: "paciente",
        recursoId: pacienteId,
        motivo,
        payloadNuevo: { estado: "pausado", duracion },
      });
    }
    return NextResponse.json({ ok: true, estado: "pausado" });
  }

  if (accion === "bloquear") {
    if (!motivo) return NextResponse.json({ error: "Motivo obligatorio" }, { status: 400 });
    const { error } = await admin
      .from("pacientes")
      .update({ estado_cuenta: "bloqueado", motivo_estado: motivo, estado_hasta: null })
      .eq("id", pacienteId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (adminUser) {
      await logAdminAction({
        adminUserId: adminUser.id,
        accion: ADMIN_ACTIONS.BLOQUEAR_PACIENTE,
        recursoTipo: "paciente",
        recursoId: pacienteId,
        motivo,
      });
    }
    return NextResponse.json({ ok: true, estado: "bloqueado" });
  }

  if (accion === "reactivar") {
    if (!motivo || motivo.trim().length < 10) {
      return NextResponse.json({ error: "Motivo obligatorio (min 10 caracteres)" }, { status: 400 });
    }
    const { error } = await admin
      .from("pacientes")
      .update({ estado_cuenta: "activo", motivo_estado: motivo, estado_hasta: null })
      .eq("id", pacienteId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (adminUser) {
      await logAdminAction({
        adminUserId: adminUser.id,
        accion: ADMIN_ACTIONS.REACTIVAR_PACIENTE,
        recursoTipo: "paciente",
        recursoId: pacienteId,
        motivo,
      });
    }
    return NextResponse.json({ ok: true, estado: "activo" });
  }

  return NextResponse.json({ error: "Accion no reconocida" }, { status: 400 });
}
