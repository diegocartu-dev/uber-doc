export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import DashboardAdminClient from "./DashboardAdminClient";
import MobileControlCenter from "./MobileControlCenter";
import { setsDeTest, esTest } from "@/lib/insights/filtro-test";

function isMobileUA(ua: string): boolean {
  return /Mobile|Android|iPhone|iPad/i.test(ua);
}

function hoyAR() {
  const ar = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${ar.getFullYear()}-${pad(ar.getMonth() + 1)}-${pad(ar.getDate())}`;
}

function hace7dias() {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function en7dias() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ force?: string }>;
}) {
  const params = await searchParams;
  const headersList = await headers();
  const ua = headersList.get("user-agent") || "";
  const isMobile = isMobileUA(ua) && params.force !== "desktop";

  if (isMobile) {
    return <MobileControlCenter />;
  }

  const admin = createAdminClient();
  const hoy = hoyAR();
  const desde7 = hace7dias();

  const [
    sets,
    { count: totalMedicos },
    { count: medicosActivos },
    { count: totalPacientes },
    { data: consHoyRows },
    { data: turnosHoyRows },
    { data: consEnCursoRows },
    { data: turnosEnCursoRows },
    { count: pendingMedicos },
    { count: pendingAlertas },
    { data: consultasSemanaRaw },
    { data: turnosSemanaRaw },
    { data: medicosDisponiblesData },
    { data: turnosDisponiblesData },
    { count: reembolsosPendientes },
  ] = await Promise.all([
    setsDeTest(admin),
    admin.from("medicos").select("id", { count: "exact", head: true }).eq("verificado", true).eq("es_cuenta_test", false),
    admin.from("medicos").select("id", { count: "exact", head: true }).eq("verificado", true).eq("disponible", true).eq("es_cuenta_test", false),
    admin.from("pacientes").select("id", { count: "exact", head: true }).eq("es_cuenta_test", false),
    admin.from("consultas").select("id, estado, medico_id, paciente_id").gte("created_at", hoy),
    admin.from("turnos").select("id, estado, medico_id, paciente_id").eq("fecha", hoy),
    admin.from("consultas").select("id, estado, medico_id, paciente_id").in("estado", ["aceptada", "pagada", "en_curso"]),
    admin.from("turnos").select("id, estado, medico_id, paciente_id").eq("estado", "en_curso"),
    admin.from("medicos").select("id", { count: "exact", head: true }).eq("estado_registro", "pendiente_revision").eq("es_cuenta_test", false),
    admin.from("alertas_admin").select("id", { count: "exact", head: true }).eq("estado", "pendiente"),
    admin.from("consultas").select("created_at, estado, medico_id, paciente_id").gte("created_at", desde7).limit(5000),
    // Chart: excluir slots vacíos (no son "consultas") → alinea el chart con "Consultas
    // hoy" y baja el volumen para que el .limit() no trunque en silencio (Roberto #224).
    admin.from("turnos").select("fecha, estado, medico_id, paciente_id").gte("fecha", desde7).not("estado", "in", "(disponible,bloqueado,bloqueado_sin_cobro)").limit(5000),
    // Plantilla: médicos disponibles AHORA (toggle prendido), con sus canales
    admin.from("medicos").select("id, nombre_completo, especialidad, oculto_clinica, visible_consultorio_particular, disponible_hasta").eq("verificado", true).eq("disponible", true).eq("es_cuenta_test", false).order("especialidad"),
    // Oferta: slots de turno libres en los próximos 7 días
    admin.from("turnos").select("medico_id").eq("estado", "disponible").gte("fecha", hoy).lte("fecha", en7dias()),
    // Reembolsos pendientes: misma cola que /admin/reembolsos (no resueltos)
    admin.from("refunds_pendientes").select("id", { count: "exact", head: true }).neq("estado", "resuelto"),
  ]);

  // Filtro de cuentas test (médico O paciente) en las métricas de ACTIVIDAD. Antes el
  // admin no filtraba test acá → "Consultas hoy: 1" podía ser una cuenta de prueba.
  // Reusa la fuente de verdad de /insights (setsDeTest/esTest).
  const SLOT = new Set(["disponible", "bloqueado", "bloqueado_sin_cobro"]);
  const real = (r: { medico_id?: string | null; paciente_id?: string | null }) =>
    !esTest(sets, r.medico_id, r.paciente_id);
  // "Consultas hoy" = CI reales creadas hoy + turnos reales de hoy que NO son slots vacíos.
  const consultasHoyTotal =
    (consHoyRows ?? []).filter(real).length +
    (turnosHoyRows ?? []).filter((t) => real(t) && !SLOT.has(t.estado)).length;
  const enCursoTotal =
    (consEnCursoRows ?? []).filter(real).length +
    (turnosEnCursoRows ?? []).filter(real).length;
  const consultasSemana = (consultasSemanaRaw ?? []).filter(real);
  const turnosSemana = (turnosSemanaRaw ?? []).filter(real);
  // Cuántas atenciones de prueba se ocultaron hoy (para no confundir "día vacío" con
  // "día sin actividad real pero con test"). Mismo criterio que "Consultas hoy".
  const testOcultasHoy =
    (consHoyRows ?? []).filter((r) => !real(r)).length +
    (turnosHoyRows ?? []).filter((t) => !real(t) && !SLOT.has(t.estado)).length;

  // Turnos disponibles agrupados por especialidad (especialidad vive en medicos)
  const medicoIdsConSlots = [...new Set((turnosDisponiblesData ?? []).map((t) => t.medico_id).filter(Boolean))];
  const { data: medicosDeSlots } = medicoIdsConSlots.length > 0
    ? await admin.from("medicos").select("id, nombre_completo, especialidad, es_cuenta_test").in("id", medicoIdsConSlots)
    : { data: [] as { id: string; nombre_completo: string | null; especialidad: string | null; es_cuenta_test: boolean | null }[] };

  const espPorMedico = new Map((medicosDeSlots ?? []).map((m) => [m.id, m]));
  // Por especialidad: total de slots + DESGLOSE por médico (nombre + sus slots), para
  // que la oferta diga de QUIÉN y de qué especialidad es, no solo "N médicos".
  const porEspecialidad = new Map<string, { slots: number; medicos: Map<string, { id: string; nombre: string; slots: number }> }>();
  for (const t of turnosDisponiblesData ?? []) {
    const med = espPorMedico.get(t.medico_id);
    if (!med || med.es_cuenta_test) continue;
    const esp = med.especialidad ?? "Sin especialidad";
    if (!porEspecialidad.has(esp)) porEspecialidad.set(esp, { slots: 0, medicos: new Map() });
    const e = porEspecialidad.get(esp)!;
    e.slots++;
    const m = e.medicos.get(t.medico_id) ?? { id: t.medico_id, nombre: med.nombre_completo ?? "—", slots: 0 };
    m.slots++;
    e.medicos.set(t.medico_id, m);
  }
  const turnosPorEspecialidad = [...porEspecialidad.entries()]
    .map(([especialidad, v]) => ({
      especialidad,
      slots: v.slots,
      medicos: [...v.medicos.values()].sort((a, b) => b.slots - a.slots),
    }))
    .sort((a, b) => b.slots - a.slots);

  const medicosDisponibles = (medicosDisponiblesData ?? []).map((m) => ({
    id: m.id,
    nombre: m.nombre_completo,
    especialidad: m.especialidad ?? "—",
    clinica: !m.oculto_clinica,
    consultorio: m.visible_consultorio_particular ?? true,
    hasta: m.disponible_hasta,
  }));

  const diasSemana: { fecha: string; consultas: number; completadas: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const pad = (n: number) => n.toString().padStart(2, "0");
    const fecha = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const consDelDia = (consultasSemana ?? []).filter((c) => c.created_at?.startsWith(fecha));
    const turnosDelDia = (turnosSemana ?? []).filter((t) => t.fecha === fecha);
    const total = consDelDia.length + turnosDelDia.length;
    const completadas = consDelDia.filter((c) => c.estado === "completada").length +
      turnosDelDia.filter((t) => t.estado === "completado").length;

    diasSemana.push({ fecha, consultas: total, completadas });
  }

  return (
    <DashboardAdminClient
      metrics={{
        consultasHoy: consultasHoyTotal,
        medicosActivos: medicosActivos ?? 0,
        totalMedicos: totalMedicos ?? 0,
        totalPacientes: totalPacientes ?? 0,
        enCursoAhora: enCursoTotal,
        pendingMedicos: pendingMedicos ?? 0,
        pendingAlertas: pendingAlertas ?? 0,
        reembolsosPendientes: reembolsosPendientes ?? 0,
        testOcultasHoy,
      }}
      diasSemana={diasSemana}
      medicosDisponibles={medicosDisponibles}
      turnosPorEspecialidad={turnosPorEspecialidad}
    />
  );
}
