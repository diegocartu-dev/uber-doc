import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin, getAdminUser } from "@/lib/admin-auth";
import { logAdminAction, ADMIN_ACTIONS } from "@/lib/admin-audit";

function fechaAR(offsetDias = 0) {
  const ar = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  ar.setDate(ar.getDate() - offsetDias);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${ar.getFullYear()}-${pad(ar.getMonth() + 1)}-${pad(ar.getDate())}`;
}
function hoyAR() {
  return fechaAR(0);
}
// Medianoche ART en UTC (ART = UTC-3 fijo) — comparar timestamptz contra la
// fecha a secas corta a las 21:00 del día anterior.
const medianocheARenUTC = (fechaISO: string) => `${fechaISO}T03:00:00Z`;
const SLOTS = ["disponible", "bloqueado"];

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
      medicoIds.length > 0 ? admin.from("medicos").select("id, nombre_completo, es_cuenta_test").in("id", medicoIds) : { data: [] },
      pacienteIds.length > 0 ? admin.from("pacientes").select("id, user_id, nombre_completo").in("user_id", pacienteIds) : { data: [] },
    ]);

    const testIds = new Set((medicos ?? []).filter((m) => m.es_cuenta_test).map((m) => m.id));
    const medMap = new Map((medicos ?? []).filter((m) => !m.es_cuenta_test).map((m) => [m.id, m.nombre_completo]));
    const pacMapUserId = new Map((pacientes ?? []).map((p) => [p.user_id, p.nombre_completo]));
    const pacMapId = new Map((pacientes ?? []).map((p) => [p.id, p.nombre_completo]));

    const items = [
      ...(consultas ?? []).filter((c) => !testIds.has(c.medico_id)).map((c) => ({
        id: c.id,
        tipo: "CI" as const,
        estado: c.estado,
        medico: medMap.get(c.medico_id) ?? "—",
        paciente: pacMapUserId.get(c.paciente_id) ?? "Paciente",
        inicio: c.created_at,
        especialidad: c.especialidad,
      })),
      ...(turnos ?? []).filter((t) => !testIds.has(t.medico_id)).map((t) => ({
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
    // ── Actividad (spec Diego 31/07): consultas REALES del período (cualquier
    // estado y canal, todo indicado) + turnos SOLICITADOS en el período aunque
    // la cita sea futura. Selector hoy/7/30. Nunca slots. Lo más nuevo arriba.
    const dias = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("dias") ?? "1", 10) || 1, 1), 30);
    const desdeFecha = fechaAR(dias - 1);
    const desdeUTC = medianocheARenUTC(desdeFecha);

    const [{ data: consultas }, { data: turnos }] = await Promise.all([
      admin
        .from("consultas")
        .select("id, especialidad, estado, created_at, paciente_id, medico_id")
        .gte("created_at", desdeUTC)
        .order("created_at", { ascending: false })
        .limit(300),
      admin
        .from("turnos")
        .select("id, fecha, hora_inicio, estado, paciente_id, medico_id, canal_origen, mp_payment_created_at, updated_at")
        .not("paciente_id", "is", null)
        .not("estado", "in", `(${SLOTS.join(",")})`)
        // cita en la ventana O solicitado/movido en la ventana (agendas futuras)
        .or(`and(fecha.gte.${desdeFecha},fecha.lte.${hoy}),mp_payment_created_at.gte.${desdeUTC},updated_at.gte.${desdeUTC}`)
        .limit(300),
    ]);

    const medicoIds = [...new Set([...(consultas ?? []).map((c) => c.medico_id), ...(turnos ?? []).map((t) => t.medico_id)])];
    const pacienteIds = [...new Set([...(consultas ?? []).map((c) => c.paciente_id), ...(turnos ?? []).map((t) => t.paciente_id)])].filter(Boolean);

    const [{ data: medicos }, { data: pacientes }] = await Promise.all([
      medicoIds.length > 0 ? admin.from("medicos").select("id, nombre_completo, es_cuenta_test").in("id", medicoIds) : { data: [] },
      pacienteIds.length > 0
        ? admin.from("pacientes").select("id, user_id, nombre_completo, es_cuenta_test").or(`user_id.in.(${pacienteIds.join(",")}),id.in.(${pacienteIds.join(",")})`)
        : { data: [] },
    ]);

    const medTest = new Set((medicos ?? []).filter((m) => m.es_cuenta_test).map((m) => m.id));
    const medMap = new Map((medicos ?? []).map((m) => [m.id, m.nombre_completo]));
    // consultas.paciente_id = user_id; turnos.paciente_id = pacientes.id → doble mapa.
    const pacPorUser = new Map((pacientes ?? []).map((p) => [p.user_id, p]));
    const pacPorId = new Map((pacientes ?? []).map((p) => [p.id, p]));
    const pacDe = (pid: string | null) => (pid ? pacPorUser.get(pid) ?? pacPorId.get(pid) : undefined);

    const items = [
      ...(consultas ?? [])
        .filter((c) => !medTest.has(c.medico_id) && !pacDe(c.paciente_id)?.es_cuenta_test)
        .map((c) => ({
          id: c.id,
          tipo: "CI" as const,
          canal: "ci",
          estado: c.estado,
          medico: medMap.get(c.medico_id) ?? "—",
          paciente: pacDe(c.paciente_id)?.nombre_completo ?? "—",
          especialidad: c.especialidad ?? "",
          solicitada: c.created_at,
          citaPara: null as string | null,
          inicio: c.created_at,
        })),
      ...(turnos ?? [])
        .filter((t) => !medTest.has(t.medico_id) && !pacDe(t.paciente_id)?.es_cuenta_test)
        .map((t) => ({
          id: t.id,
          tipo: "Turno" as const,
          canal: (t.canal_origen as string) === "consultorio_privado" ? "consultorio" : "clinica",
          estado: t.estado,
          medico: medMap.get(t.medico_id) ?? "—",
          paciente: pacDe(t.paciente_id)?.nombre_completo ?? "—",
          especialidad: "",
          solicitada: (t.mp_payment_created_at as string | null) ?? t.updated_at,
          citaPara: `${t.fecha}T${String(t.hora_inicio).slice(0, 8)}-03:00`,
          inicio: `${t.fecha}T${t.hora_inicio}`,
        })),
    ].sort((a, b) => new Date(b.solicitada).getTime() - new Date(a.solicitada).getTime());

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
      medicoIds.length > 0 ? admin.from("medicos").select("id, nombre_completo, es_cuenta_test").in("id", medicoIds) : { data: [] },
      pacienteIds.length > 0 ? admin.from("pacientes").select("id, user_id, nombre_completo").in("user_id", pacienteIds) : { data: [] },
    ]);

    const testIds3 = new Set((medicos ?? []).filter((m) => m.es_cuenta_test).map((m) => m.id));
    const medMap3 = new Map((medicos ?? []).filter((m) => !m.es_cuenta_test).map((m) => [m.id, m.nombre_completo]));
    const pacMap = new Map((pacientes ?? []).map((p) => [p.user_id, p.nombre_completo]));

    const items = (consultas ?? []).filter((c) => !testIds3.has(c.medico_id)).map((c) => ({
      id: c.id, tipo: "CI" as const, estado: c.estado,
      medico: medMap3.get(c.medico_id) ?? "—",
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
    const { error } = await admin.from("consultas").update({ estado: "completada", completada_at: new Date().toISOString(), cierre_origen: "admin_forzado" }).eq("id", id);
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
