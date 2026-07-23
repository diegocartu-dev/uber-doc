import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin } from "@/lib/admin-auth";
import { setsDeTest, esTest, leerSoloReales } from "@/lib/insights/filtro-test";

// ── Página "Hoy" v2 (rediseño Diego 23/07) ────────────────────────────────────
// 1. PLATA REAL, no teórica: cobrado = suma de `monto` PAGADO (mp_status
//    approved), comisión = suma de `mp_application_fee` real de MP (la regla es
//    5% founders / 10% socios tradicionales — NUNCA fue $1.500 fijo: eso era
//    5% × $30.000 que coincidía, y el hardcode viejo mostró $1.500 el día que
//    apareció la primera consulta de $50.000 con comisión real de $2.500).
// 2. Disponibles: turnos habilitados HOY y/o CI activa (diferenciada) +
//    JURISDICCIONES por médico.
// 3. La fila de métricas chicas (espera/retención/no-show/hs/cancelaciones) se
//    ELIMINÓ: "no suma en nada" a esta escala.
// 4. Atenciones de hoy = el día completo: pendientes (turnos reservados) y
//    hechas (con resultado), en orden cronológico, con lo PAGADO (no el precio
//    de lista actual del médico, que reescribe el pasado si lo cambia).

function fechaAR(offset = 0) {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  d.setDate(d.getDate() - offset);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Medianoche ART expresada en UTC (ART = UTC-3 fijo, sin horario de verano).
// Comparar timestamptz contra la fecha a secas corta a las 21:00 ART del día
// anterior y mezcla los días.
const medianocheARenUTC = (fechaISO: string) => `${fechaISO}T03:00:00Z`;

const SLOT = new Set(["disponible", "bloqueado"]);

type FilaPago = {
  monto: number | null;
  mp_status: string | null;
  mp_application_fee: number | string | null;
  comision_docto_pct: number | string | null;
};

// Comisión real de una atención pagada: el fee que MP registró; si faltara,
// reconstruir por pct (5/10%); nunca inventar.
function comisionDe(f: FilaPago): number {
  const fee = Number(f.mp_application_fee);
  if (Number.isFinite(fee) && fee > 0) return fee;
  const pct = Number(f.comision_docto_pct);
  if (Number.isFinite(pct) && pct > 0 && f.monto) return (f.monto * pct) / 100;
  return 0;
}

export async function GET(req: NextRequest) {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const admin = createAdminClient();
  const soloReales = leerSoloReales(req.nextUrl.searchParams);
  const sets = await setsDeTest(admin);
  const hoy = fechaAR(0);
  const hace7 = fechaAR(7);
  const hace6 = fechaAR(6);

  const [
    { data: consultasHoyRaw },
    { data: turnosHoyRaw },
    { data: consultas7d },
    { data: turnos7d },
    { count: ciEsperando },
    { data: medicosDispRaw },
  ] = await Promise.all([
    admin.from("consultas").select("id, estado, created_at, medico_id, paciente_id, especialidad, canal_origen, monto, mp_status, mp_application_fee, comision_docto_pct").gte("created_at", medianocheARenUTC(hoy)),
    admin.from("turnos").select("id, estado, fecha, hora_inicio, medico_id, paciente_id, monto, mp_status, mp_application_fee, comision_docto_pct").eq("fecha", hoy),
    admin.from("consultas").select("id, estado, created_at, medico_id, paciente_id").gte("created_at", medianocheARenUTC(hace7)).lt("created_at", medianocheARenUTC(hace6)),
    admin.from("turnos").select("id, estado, fecha, medico_id, paciente_id").eq("fecha", hace7),
    admin.from("consultas").select("id", { count: "exact", head: true }).eq("estado", "esperando"),
    soloReales
      ? admin.from("medicos").select("id, nombre_completo, especialidad, disponible_desde, disponible_hasta, jurisdicciones").eq("verificado", true).eq("disponible", true).eq("es_cuenta_test", false)
      : admin.from("medicos").select("id, nombre_completo, especialidad, disponible_desde, disponible_hasta, jurisdicciones").eq("verificado", true).eq("disponible", true),
  ]);

  // Filtro test unificado (médico O paciente). turnosHoy mantiene los slots para
  // detectar "turnos habilitados hoy"; para atenciones se excluyen.
  const consultasHoy = (consultasHoyRaw ?? []).filter(c => !soloReales || !esTest(sets, c.medico_id, c.paciente_id));
  const turnosHoy = (turnosHoyRaw ?? []).filter(t => !soloReales || !esTest(sets, t.medico_id, t.paciente_id));
  const turnosAtencionHoy = turnosHoy.filter(t => !SLOT.has(t.estado));
  const medicosDisp = medicosDispRaw ?? [];

  const completadasHoy = consultasHoy.filter(c => c.estado === "completada").length +
    turnosAtencionHoy.filter(t => t.estado === "completado").length;
  const ciHoy = consultasHoy.filter(c => c.canal_origen !== "turno").length;
  const turnosHoyCount = turnosAtencionHoy.length;

  const completadas7dAgo = (consultas7d ?? []).filter(c =>
    c.estado === "completada" && (!soloReales || !esTest(sets, c.medico_id, c.paciente_id))
  ).length + (turnos7d ?? []).filter(t => t.estado === "completado" && (!soloReales || !esTest(sets, t.medico_id, t.paciente_id))).length;

  const delta = completadasHoy - completadas7dAgo;

  // ── Plata REAL del día: lo que MP aprobó, la comisión que MP registró ──
  const pagadasHoy: FilaPago[] = [
    ...consultasHoy.filter(c => c.mp_status === "approved"),
    ...turnosAtencionHoy.filter(t => t.mp_status === "approved"),
  ];
  const cobradoHoy = pagadasHoy.reduce((s, f) => s + (Number(f.monto) || 0), 0);
  const comisionDocto = pagadasHoy.reduce((s, f) => s + comisionDe(f), 0);
  const netoMedicos = cobradoHoy - comisionDocto;

  // ── Disponibles: turnos habilitados HOY y/o CI activa, con jurisdicciones ──
  const medicosConTurnoHoy = new Set(turnosHoy.filter(t => t.estado === "disponible").map(t => t.medico_id));

  const allMedicoIds = [...new Set([
    ...consultasHoy.map(c => c.medico_id),
    ...turnosAtencionHoy.map(t => t.medico_id),
    ...medicosConTurnoHoy,
  ])];
  const allPacienteIds = [...new Set([...consultasHoy.map(c => c.paciente_id), ...turnosAtencionHoy.map(t => t.paciente_id)])].filter(Boolean);

  const [{ data: meds }, { data: pacs }] = await Promise.all([
    allMedicoIds.length > 0 ? admin.from("medicos").select("id, nombre_completo, especialidad, precio_consulta, jurisdicciones").in("id", allMedicoIds) : { data: [] },
    allPacienteIds.length > 0 ? admin.from("pacientes").select("user_id, id, nombre_completo").or(`user_id.in.(${allPacienteIds.join(",")}),id.in.(${allPacienteIds.join(",")})`) : { data: [] },
  ]);

  const medMap = new Map((meds ?? []).map(m => [m.id, m]));
  const pacMapUser = new Map((pacs ?? []).map(p => [p.user_id, p.nombre_completo]));
  const pacMapId = new Map((pacs ?? []).map(p => [p.id, p.nombre_completo]));
  const nombrePaciente = (pid: string) => pacMapUser.get(pid) ?? pacMapId.get(pid) ?? "—";

  const turnoSoloIds = [...medicosConTurnoHoy].filter(id => !medicosDisp.some(m => m.id === id));
  const disponiblesAhora = [
    ...medicosDisp.map(m => ({
      id: m.id,
      nombre: m.nombre_completo,
      especialidad: m.especialidad,
      ci: true,
      turnosHoy: medicosConTurnoHoy.has(m.id),
      jurisdicciones: (m.jurisdicciones as string[] | null) ?? [],
      desde: m.disponible_desde ? String(m.disponible_desde).slice(0, 5) : null,
      hasta: m.disponible_hasta ? String(m.disponible_hasta).slice(0, 5) : null,
    })),
    ...turnoSoloIds.map(id => {
      const m = medMap.get(id);
      return {
        id,
        nombre: m?.nombre_completo ?? "—",
        especialidad: m?.especialidad ?? "",
        ci: false,
        turnosHoy: true,
        jurisdicciones: (m?.jurisdicciones as string[] | null) ?? [],
        desde: null,
        hasta: null,
      };
    }),
  ];

  // ── El día completo: pendientes + hechas, cronológico, con lo PAGADO ──
  const actividad = [
    ...consultasHoy.map(c => {
      const med = medMap.get(c.medico_id);
      return {
        id: c.id, tipo: "CI" as const, estado: c.estado,
        medico: med?.nombre_completo ?? "—",
        paciente: nombrePaciente(c.paciente_id),
        especialidad: c.especialidad ?? med?.especialidad ?? "",
        monto: Number(c.monto) || med?.precio_consulta || 0,
        pagada: c.mp_status === "approved",
        inicio: c.created_at,
      };
    }),
    ...turnosAtencionHoy.map(t => {
      const med = medMap.get(t.medico_id);
      return {
        id: t.id, tipo: "Turno" as const, estado: t.estado,
        medico: med?.nombre_completo ?? "—",
        paciente: nombrePaciente(t.paciente_id),
        especialidad: med?.especialidad ?? "",
        monto: Number(t.monto) || med?.precio_consulta || 0,
        pagada: t.mp_status === "approved",
        // Offset explícito: sin él, el server (UTC) y el sort lo leerían como
        // UTC y el turno ordenaría 3 h antes que las CI (que traen instante real).
        inicio: `${t.fecha}T${t.hora_inicio}-03:00`,
      };
    }),
  ].sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());

  return NextResponse.json({
    completadasHoy,
    delta,
    ciHoy,
    turnosHoy: turnosHoyCount,
    medicosActivos: medicosDisp.length,
    ciEsperando: ciEsperando ?? 0,
    cobradoHoy,
    comisionDocto,
    netoMedicos,
    disponiblesAhora,
    actividad,
  });
}
