import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin } from "@/lib/admin-auth";
import { setsDeTest, esTest, leerSoloReales } from "@/lib/insights/filtro-test";

// Panel "Atenciones": una fila por atención REAL (no por slot de agenda), para
// saber qué pasó — médico, paciente, tipo, estado, duración, cobro y documentos.
//
// Claves del esquema (ver memoria project_esquema_atenciones_insights):
//  - consultas/turnos.paciente_id es el USER_ID → joinear pacientes.user_id.
//  - turnos en estado disponible/bloqueado son SLOTS, NO atenciones → se excluyen.
//  - documentos se relacionan por consulta_id / turno_id (tipo: receta, etc.).
//  - cobro: mp_status='approved' + monto. duración: en_curso_at → fin.
// Argentina es UTC-3 fijo.

function fechaAR(offset = 0) {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  d.setDate(d.getDate() - offset);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const ESTADO_LABEL: Record<string, string> = {
  completada: "Atendida",
  completado: "Atendida",
  en_curso: "En curso",
  esperando: "Esperando",
  confirmado: "Agendada",
  cancelada: "Cancelada",
  cancelado_paciente: "Cancelada (paciente)",
  cancelado_medico: "Cancelada (médico)",
};
const ATENDIDA = new Set(["completada", "completado", "en_curso"]);

function labelAR(utcMs: number): string {
  const ar = new Date(utcMs - 3 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(ar.getUTCDate())}/${p(ar.getUTCMonth() + 1)} ${p(ar.getUTCHours())}:${p(ar.getUTCMinutes())}`;
}
const durMin = (ini: string | null, fin: string | null): number | null =>
  ini && fin ? Math.max(0, Math.round((new Date(fin).getTime() - new Date(ini).getTime()) / 60000)) : null;
const cobroDe = (mp: string | null, monto: number | null) =>
  mp === "approved" ? { pagado: true, monto: monto ?? null } : monto ? { pagado: false, monto } : null;

export async function GET(req: NextRequest) {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const dias = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("dias") ?? "30", 10) || 30, 1), 365);
  const soloReales = leerSoloReales(req.nextUrl.searchParams);
  const desde = fechaAR(dias);
  const admin = createAdminClient();

  const [{ data: consultasRaw }, { data: turnosRaw }, { data: documentos }, { data: medicos }, { data: pacientes }, sets] =
    await Promise.all([
      admin
        .from("consultas")
        .select("id, medico_id, paciente_id, estado, especialidad, created_at, en_curso_at, completada_at, desconectado_at, monto, mp_status")
        .gte("created_at", desde),
      admin
        .from("turnos")
        .select("id, medico_id, paciente_id, estado, fecha, hora_inicio, en_curso_at, desconectado_at, monto, mp_status")
        .not("estado", "in", "(disponible,bloqueado)")
        .gte("fecha", desde),
      admin.from("documentos").select("consulta_id, turno_id, tipo"),
      admin.from("medicos").select("id, nombre_completo"),
      admin.from("pacientes").select("user_id, nombre_completo"),
      setsDeTest(admin),
    ]);

  // Filtro test unificado (médico O paciente). Con "solo reales" (default) esta
  // pantalla deja de mostrar solo "Dr. Docto Test" y aparecen las atenciones reales.
  const consultas = (consultasRaw ?? []).filter((c) => !soloReales || !esTest(sets, c.medico_id, c.paciente_id));
  const turnos = (turnosRaw ?? []).filter((t) => !soloReales || !esTest(sets, t.medico_id, t.paciente_id));

  const medMap = new Map((medicos ?? []).map((m) => [m.id, m.nombre_completo]));
  const pacMap = new Map((pacientes ?? []).map((p) => [p.user_id, p.nombre_completo])); // join por user_id
  const docsCI = new Map<string, Set<string>>();
  const docsTurno = new Map<string, Set<string>>();
  for (const d of documentos ?? []) {
    if (d.consulta_id) (docsCI.get(d.consulta_id) ?? docsCI.set(d.consulta_id, new Set()).get(d.consulta_id)!).add(d.tipo);
    if (d.turno_id) (docsTurno.get(d.turno_id) ?? docsTurno.set(d.turno_id, new Set()).get(d.turno_id)!).add(d.tipo);
  }

  type Atencion = {
    cuandoSort: number; cuando: string; tipo: "CI" | "Turno";
    medico: string; paciente: string; estado: string; estadoLabel: string;
    atendida: boolean; duracionMin: number | null;
    cobro: { pagado: boolean; monto: number | null } | null; docs: string[];
  };
  const atenciones: Atencion[] = [];

  for (const c of consultas ?? []) {
    const sort = new Date(c.en_curso_at ?? c.created_at).getTime();
    atenciones.push({
      cuandoSort: sort, cuando: labelAR(sort), tipo: "CI",
      medico: medMap.get(c.medico_id) ?? "—",
      paciente: pacMap.get(c.paciente_id) ?? "—",
      estado: c.estado, estadoLabel: ESTADO_LABEL[c.estado] ?? c.estado,
      atendida: ATENDIDA.has(c.estado),
      duracionMin: durMin(c.en_curso_at, c.completada_at ?? c.desconectado_at),
      cobro: cobroDe(c.mp_status, c.monto), docs: [...(docsCI.get(c.id) ?? [])],
    });
  }
  for (const t of turnos ?? []) {
    const sort = Date.parse(`${t.fecha}T${String(t.hora_inicio).slice(0, 8)}-03:00`);
    atenciones.push({
      cuandoSort: sort, cuando: labelAR(sort), tipo: "Turno",
      medico: medMap.get(t.medico_id) ?? "—",
      paciente: pacMap.get(t.paciente_id) ?? "—",
      estado: t.estado, estadoLabel: ESTADO_LABEL[t.estado] ?? t.estado,
      atendida: ATENDIDA.has(t.estado),
      duracionMin: durMin(t.en_curso_at, t.desconectado_at),
      cobro: cobroDe(t.mp_status, t.monto), docs: [...(docsTurno.get(t.id) ?? [])],
    });
  }
  atenciones.sort((a, b) => b.cuandoSort - a.cuandoSort);

  return NextResponse.json({
    dias,
    desde,
    atenciones,
    resumen: {
      total: atenciones.length,
      atendidas: atenciones.filter((a) => a.atendida).length,
      cobradas: atenciones.filter((a) => a.cobro?.pagado).length,
      conDoc: atenciones.filter((a) => a.docs.length > 0).length,
    },
  });
}
