export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import DashboardAdminClient from "./DashboardAdminClient";
import MobileControlCenter from "./MobileControlCenter";

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
    { count: totalMedicos },
    { count: medicosActivos },
    { count: totalPacientes },
    { count: consultasHoy },
    { count: turnosHoy },
    { count: consultasEnCurso },
    { count: turnosEnCurso },
    { count: pendingMedicos },
    { count: pendingAlertas },
    { data: consultasSemana },
    { data: turnosSemana },
    { data: medicosDisponiblesData },
    { data: turnosDisponiblesData },
  ] = await Promise.all([
    admin.from("medicos").select("id", { count: "exact", head: true }).eq("verificado", true).eq("es_cuenta_test", false),
    admin.from("medicos").select("id", { count: "exact", head: true }).eq("verificado", true).eq("disponible", true).eq("es_cuenta_test", false),
    admin.from("pacientes").select("id", { count: "exact", head: true }).eq("es_cuenta_test", false),
    admin.from("consultas").select("id", { count: "exact", head: true }).gte("created_at", hoy),
    admin.from("turnos").select("id", { count: "exact", head: true }).eq("fecha", hoy),
    admin.from("consultas").select("id", { count: "exact", head: true }).in("estado", ["aceptada", "pagada", "en_curso"]),
    admin.from("turnos").select("id", { count: "exact", head: true }).eq("estado", "en_curso"),
    admin.from("medicos").select("id", { count: "exact", head: true }).eq("estado_registro", "pendiente_revision").eq("es_cuenta_test", false),
    admin.from("alertas_admin").select("id", { count: "exact", head: true }).eq("estado", "pendiente"),
    admin.from("consultas").select("created_at, estado").gte("created_at", desde7),
    admin.from("turnos").select("fecha, estado").gte("fecha", desde7),
    // Plantilla: médicos disponibles AHORA (toggle prendido), con sus canales
    admin.from("medicos").select("id, nombre_completo, especialidad, oculto_clinica, visible_consultorio_particular, disponible_hasta").eq("verificado", true).eq("disponible", true).eq("es_cuenta_test", false).order("especialidad"),
    // Oferta: slots de turno libres en los próximos 7 días
    admin.from("turnos").select("medico_id").eq("estado", "disponible").gte("fecha", hoy).lte("fecha", en7dias()),
  ]);

  // Turnos disponibles agrupados por especialidad (especialidad vive en medicos)
  const medicoIdsConSlots = [...new Set((turnosDisponiblesData ?? []).map((t) => t.medico_id).filter(Boolean))];
  const { data: medicosDeSlots } = medicoIdsConSlots.length > 0
    ? await admin.from("medicos").select("id, especialidad, es_cuenta_test").in("id", medicoIdsConSlots)
    : { data: [] as { id: string; especialidad: string | null; es_cuenta_test: boolean | null }[] };

  const espPorMedico = new Map((medicosDeSlots ?? []).map((m) => [m.id, m]));
  const porEspecialidad = new Map<string, { slots: number; medicos: Set<string> }>();
  for (const t of turnosDisponiblesData ?? []) {
    const med = espPorMedico.get(t.medico_id);
    if (!med || med.es_cuenta_test) continue;
    const esp = med.especialidad ?? "Sin especialidad";
    if (!porEspecialidad.has(esp)) porEspecialidad.set(esp, { slots: 0, medicos: new Set() });
    const e = porEspecialidad.get(esp)!;
    e.slots++;
    e.medicos.add(t.medico_id);
  }
  const turnosPorEspecialidad = [...porEspecialidad.entries()]
    .map(([especialidad, v]) => ({ especialidad, slots: v.slots, medicos: v.medicos.size }))
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
        consultasHoy: (consultasHoy ?? 0) + (turnosHoy ?? 0),
        medicosActivos: medicosActivos ?? 0,
        totalMedicos: totalMedicos ?? 0,
        totalPacientes: totalPacientes ?? 0,
        enCursoAhora: (consultasEnCurso ?? 0) + (turnosEnCurso ?? 0),
        pendingMedicos: pendingMedicos ?? 0,
        pendingAlertas: pendingAlertas ?? 0,
      }}
      diasSemana={diasSemana}
      medicosDisponibles={medicosDisponibles}
      turnosPorEspecialidad={turnosPorEspecialidad}
    />
  );
}
