export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { esInstitucional } from "@/lib/instancia";
import DashboardAdminClient from "./DashboardAdminClient";
import MobileControlCenter from "./MobileControlCenter";
import { setsDeTest, esTest } from "@/lib/insights/filtro-test";
import { soloActividadReal } from "@/lib/insights/reservas";
import { fechaAR, medianocheARenUTC, fechaARdeISO } from "@/lib/insights/fechas";

function isMobileUA(ua: string): boolean {
  return /Mobile|Android|iPhone|iPad/i.test(ua);
}

// El día del tablero es el día ARGENTINO, y sale de lib/insights/fechas — la
// misma fuente que usan /insights y el Historial de Consultas. Antes este
// archivo tenía sus propios helpers: `hoyAR()` daba bien la fecha AR, pero se
// comparaba contra `created_at` (timestamptz) tal cual, y Postgres lee
// "2026-08-28" como 00:00 UTC = 21:00 ART del día ANTERIOR. Resultado: todo lo
// que pasaba entre las 21 y las 24 hs contaba como "mañana".

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ force?: string; puente?: string }>;
}) {
  const params = await searchParams;
  const headersList = await headers();
  const ua = headersList.get("user-agent") || "";
  const isMobile = isMobileUA(ua) && params.force !== "desktop";

  if (isMobile) {
    return <MobileControlCenter />;
  }

  const admin = createAdminClient();
  const hoy = fechaAR();
  const desde7 = fechaAR(6);

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
    admin.from("consultas").select("id, estado, medico_id, paciente_id").gte("created_at", medianocheARenUTC(hoy)),
    admin.from("turnos").select("id, estado, medico_id, paciente_id, reservado_hasta, mp_status").eq("fecha", hoy),
    admin.from("consultas").select("id, estado, medico_id, paciente_id").in("estado", ["aceptada", "pagada", "en_curso"]),
    admin.from("turnos").select("id, estado, medico_id, paciente_id").eq("estado", "en_curso"),
    admin.from("medicos").select("id", { count: "exact", head: true }).eq("estado_registro", "pendiente_revision").eq("es_cuenta_test", false),
    admin.from("alertas_admin").select("id", { count: "exact", head: true }).eq("estado", "pendiente"),
    admin.from("consultas").select("created_at, estado, medico_id, paciente_id").gte("created_at", medianocheARenUTC(desde7)).limit(5000),
    // Chart: excluir slots vacíos (no son "consultas") → alinea el chart con "Consultas
    // hoy" y baja el volumen para que el .limit() no trunque en silencio (Roberto #224).
    admin.from("turnos").select("fecha, estado, medico_id, paciente_id, reservado_hasta, mp_status").gte("fecha", desde7).not("estado", "in", "(disponible,bloqueado,bloqueado_sin_cobro)").limit(5000),
    // Plantilla: médicos disponibles AHORA (toggle prendido), con sus canales
    admin.from("medicos").select("id, nombre_completo, especialidad, oculto_clinica, visible_consultorio_particular, disponible_hasta").eq("verificado", true).eq("disponible", true).eq("es_cuenta_test", false).order("especialidad"),
    // Oferta: slots de turno libres en los próximos 7 días
    admin.from("turnos").select("medico_id").eq("estado", "disponible").gte("fecha", hoy).lte("fecha", fechaAR(-7)),
    // Reembolsos pendientes: misma cola que /admin/reembolsos (no resueltos)
    admin.from("refunds_pendientes").select("id", { count: "exact", head: true }).neq("estado", "resuelto"),
  ]);

  // Filtro de cuentas test (médico O paciente) en las métricas de ACTIVIDAD. Antes el
  // admin no filtraba test acá → "Consultas hoy: 1" podía ser una cuenta de prueba.
  // Reusa la fuente de verdad de /insights (setsDeTest/esTest).
  const SLOT = new Set(["disponible", "bloqueado", "bloqueado_sin_cobro"]);
  const real = (r: { medico_id?: string | null; paciente_id?: string | null }) =>
    !esTest(sets, r.medico_id, r.paciente_id);
  // Reservas que NO son actividad real (ver lib/insights/reservas.ts): las
  // ABANDONADAS ('reservado_pendiente' con la retención de 15 min vencida y sin
  // pago — el paciente se arrepintió, el lugar ya está libre) y las VIVAS (está
  // pagando ahora mismo: todavía no hay nada agendado ni cobrado). El 06/08 un
  // solo paciente que rebotó entre tres horarios marcaba "Consultas hoy: 3"
  // cuando hubo UNA. Mismo criterio que /insights → las dos pantallas coinciden.
  const turnosAtencion = <T extends { estado: string; reservado_hasta?: string | null; mp_status?: string | null }>(filas: T[]) =>
    soloActividadReal(filas.filter((t) => !SLOT.has(t.estado)));
  // "Consultas hoy" = CI reales creadas hoy + turnos reales de hoy que NO son slots vacíos.
  const consultasHoyTotal =
    (consHoyRows ?? []).filter(real).length +
    turnosAtencion((turnosHoyRows ?? []).filter(real)).length;
  const enCursoTotal =
    (consEnCursoRows ?? []).filter(real).length +
    (turnosEnCursoRows ?? []).filter(real).length;
  const consultasSemana = (consultasSemanaRaw ?? []).filter(real);
  const turnosSemana = turnosAtencion((turnosSemanaRaw ?? []).filter(real));
  // Cuántas atenciones de prueba se ocultaron hoy (para no confundir "día vacío" con
  // "día sin actividad real pero con test"). Mismo criterio que "Consultas hoy".
  const testOcultasHoy =
    (consHoyRows ?? []).filter((r) => !real(r)).length +
    turnosAtencion((turnosHoyRows ?? []).filter((t) => !real(t))).length;

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
    const fecha = fechaAR(i);

    // `startsWith(fecha)` comparaba el prefijo UTC del timestamp: una consulta
    // de las 21:04 ART se guarda como 00:04Z del día siguiente y caía en la
    // barra equivocada. Bucketear por su fecha argentina.
    const consDelDia = (consultasSemana ?? []).filter((c) => c.created_at && fechaARdeISO(c.created_at) === fecha);
    const turnosDelDia = (turnosSemana ?? []).filter((t) => t.fecha === fecha);
    const total = consDelDia.length + turnosDelDia.length;
    const completadas = consDelDia.filter((c) => c.estado === "completada").length +
      turnosDelDia.filter((t) => t.estado === "completado").length;

    diasSemana.push({ fecha, consultas: total, completadas });
  }

  // El puente a la instancia institucional solo se ofrece si ESTE deploy lo
  // tiene configurado: sin las dos variables, el botón llevaría a un error.
  const puente =
    !esInstitucional() &&
    !!process.env.INSTANCIA_INSTITUCIONAL_URL &&
    (process.env.PUENTE_SUPERADMIN_SECRET ?? "").length >= 32
      ? { motivo: (await searchParams).puente ?? null }
      : null;

  return (
    <DashboardAdminClient
      puente={puente}
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
