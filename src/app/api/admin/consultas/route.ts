import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin, getAdminUser } from "@/lib/admin-auth";
import { logAdminAction, ADMIN_ACTIONS } from "@/lib/admin-audit";

function hoyAR() {
  const ar = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${ar.getFullYear()}-${pad(ar.getMonth() + 1)}-${pad(ar.getDate())}`;
}

export async function GET(req: NextRequest) {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const tab = req.nextUrl.searchParams.get("tab") ?? "en_curso";
  const admin = createAdminClient();
  const hoy = hoyAR();

  if (tab === "en_curso") {
    const [{ data: consultas }, { data: turnos }] = await Promise.all([
      admin
        .from("consultas")
        .select("id, especialidad, estado, created_at, paciente_id, medico_id")
        .in("estado", ["aceptada", "pagada", "en_curso"])
        .order("created_at", { ascending: true }),
      admin
        .from("turnos")
        .select("id, fecha, hora_inicio, estado, paciente_id, medico_id")
        .eq("estado", "en_curso")
        .order("hora_inicio", { ascending: true }),
    ]);

    const medicoIds = [...new Set([...(consultas ?? []).map((c) => c.medico_id), ...(turnos ?? []).map((t) => t.medico_id)])];
    const pacienteIds = [...new Set([...(consultas ?? []).map((c) => c.paciente_id), ...(turnos ?? []).map((t) => t.paciente_id)])];

    const [{ data: medicos }, { data: pacientes }] = await Promise.all([
      medicoIds.length > 0 ? admin.from("medicos").select("id, nombre_completo").in("id", medicoIds) : { data: [] },
      pacienteIds.length > 0 ? admin.from("pacientes").select("id, user_id, nombre_completo").in("user_id", pacienteIds) : { data: [] },
    ]);

    const medMap = new Map((medicos ?? []).map((m) => [m.id, m.nombre_completo]));
    const pacMapUserId = new Map((pacientes ?? []).map((p) => [p.user_id, p.nombre_completo]));
    const pacMapId = new Map((pacientes ?? []).map((p) => [p.id, p.nombre_completo]));

    const items = [
      ...(consultas ?? []).map((c) => ({
        id: c.id,
        tipo: "CI" as const,
        estado: c.estado,
        medico: medMap.get(c.medico_id) ?? "—",
        paciente: pacMapUserId.get(c.paciente_id) ?? "Paciente",
        inicio: c.created_at,
        especialidad: c.especialidad,
      })),
      ...(turnos ?? []).map((t) => ({
        id: t.id,
        tipo: "Turno" as const,
        estado: t.estado,
        medico: medMap.get(t.medico_id) ?? "—",
        paciente: pacMapId.get(t.paciente_id) ?? "Paciente",
        inicio: `${t.fecha}T${t.hora_inicio}`,
        especialidad: "",
      })),
    ];

    return NextResponse.json({ items });
  }

  if (tab === "hoy") {
    const [{ data: consultas }, { data: turnos }] = await Promise.all([
      admin
        .from("consultas")
        .select("id, especialidad, estado, created_at, paciente_id, medico_id")
        .gte("created_at", hoy)
        .order("created_at", { ascending: false }),
      admin
        .from("turnos")
        .select("id, fecha, hora_inicio, estado, paciente_id, medico_id")
        .eq("fecha", hoy)
        .order("hora_inicio", { ascending: false }),
    ]);

    const medicoIds = [...new Set([...(consultas ?? []).map((c) => c.medico_id), ...(turnos ?? []).map((t) => t.medico_id)])];
    const pacienteIds = [...new Set([...(consultas ?? []).map((c) => c.paciente_id), ...(turnos ?? []).map((t) => t.paciente_id)])];

    const [{ data: medicos }, { data: pacientes }] = await Promise.all([
      medicoIds.length > 0 ? admin.from("medicos").select("id, nombre_completo").in("id", medicoIds) : { data: [] },
      pacienteIds.length > 0 ? admin.from("pacientes").select("id, user_id, nombre_completo").in("user_id", pacienteIds) : { data: [] },
    ]);

    const medMap = new Map((medicos ?? []).map((m) => [m.id, m.nombre_completo]));
    const pacMapUserId = new Map((pacientes ?? []).map((p) => [p.user_id, p.nombre_completo]));
    const pacMapId = new Map((pacientes ?? []).map((p) => [p.id, p.nombre_completo]));

    const items = [
      ...(consultas ?? []).map((c) => ({
        id: c.id, tipo: "CI" as const, estado: c.estado,
        medico: medMap.get(c.medico_id) ?? "—",
        paciente: pacMapUserId.get(c.paciente_id) ?? "Paciente",
        inicio: c.created_at, especialidad: c.especialidad,
      })),
      ...(turnos ?? []).map((t) => ({
        id: t.id, tipo: "Turno" as const, estado: t.estado,
        medico: medMap.get(t.medico_id) ?? "—",
        paciente: pacMapId.get(t.paciente_id) ?? "Paciente",
        inicio: `${t.fecha}T${t.hora_inicio}`, especialidad: "",
      })),
    ];

    return NextResponse.json({ items });
  }

  if (tab === "historial") {
    const desde = req.nextUrl.searchParams.get("desde");
    const hasta = req.nextUrl.searchParams.get("hasta");

    let query = admin
      .from("consultas")
      .select("id, especialidad, estado, created_at, paciente_id, medico_id")
      .order("created_at", { ascending: false })
      .limit(200);

    if (desde) query = query.gte("created_at", desde);
    if (hasta) query = query.lte("created_at", hasta + "T23:59:59");

    const { data: consultas } = await query;

    const medicoIds = [...new Set((consultas ?? []).map((c) => c.medico_id))];
    const pacienteIds = [...new Set((consultas ?? []).map((c) => c.paciente_id))];

    const [{ data: medicos }, { data: pacientes }] = await Promise.all([
      medicoIds.length > 0 ? admin.from("medicos").select("id, nombre_completo").in("id", medicoIds) : { data: [] },
      pacienteIds.length > 0 ? admin.from("pacientes").select("id, user_id, nombre_completo").in("user_id", pacienteIds) : { data: [] },
    ]);

    const medMap = new Map((medicos ?? []).map((m) => [m.id, m.nombre_completo]));
    const pacMap = new Map((pacientes ?? []).map((p) => [p.user_id, p.nombre_completo]));

    const items = (consultas ?? []).map((c) => ({
      id: c.id, tipo: "CI" as const, estado: c.estado,
      medico: medMap.get(c.medico_id) ?? "—",
      paciente: pacMap.get(c.paciente_id) ?? "Paciente",
      inicio: c.created_at, especialidad: c.especialidad,
    }));

    return NextResponse.json({ items });
  }

  return NextResponse.json({ error: "Tab no reconocido" }, { status: 400 });
}

export async function PATCH(req: NextRequest) {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id, tipo } = await req.json();
  if (!id || !tipo) {
    return NextResponse.json({ error: "id y tipo son obligatorios" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (tipo === "consulta") {
    const { error } = await admin.from("consultas").update({ estado: "completada" }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await admin.from("turnos").update({ estado: "completado" }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.from("alertas_admin").insert({
    tipo: "cierre_forzado",
    titulo: `Cierre forzado de ${tipo} por admin`,
    entidad_tipo: "consulta",
    entidad_id: id,
    severidad: "media",
    estado: "resuelta",
    resuelta_por: user.email,
    resuelta_at: new Date().toISOString(),
  });

  // Audit log inmutable
  const adminUser = await getAdminUser(user.id);
  if (adminUser) {
    await logAdminAction({
      adminUserId: adminUser.id,
      accion: ADMIN_ACTIONS.FORZAR_CIERRE_CONSULTA,
      recursoTipo: "consulta",
      recursoId: id,
      payloadNuevo: { tipo, estado: tipo === "consulta" ? "completada" : "completado" },
    });
  }

  return NextResponse.json({ ok: true });
}
