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
  ]);

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
    />
  );
}
