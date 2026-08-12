export const dynamic = "force-dynamic";

// /admin/agendas — carga de agendas del motor ACORDADO (spec institucional
// §4.7): quien levanta las agendas es la INSTITUCIÓN. Pantalla interna de
// Docto, SOLO en la instancia institucional — en B2C es 404.

import { notFound, redirect } from "next/navigation";
import { esInstitucional } from "@/lib/instancia";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin-auth";
import { getConfigInstitucion } from "@/lib/institucional/config";
import AgendasClient, { type MedicoOpcion, type AgendaFila } from "./AgendasClient";

export default async function AgendasPage() {
  if (!esInstitucional()) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isAdmin(user.id))) redirect("/dashboard");

  const admin = createAdminClient();
  const config = await getConfigInstitucion();

  const [{ data: medicos }, { data: modelos }] = await Promise.all([
    admin
      .from("medicos")
      .select("id, nombre_completo, especialidad, firma_manuscrita_url")
      .eq("estado_registro", "aprobado")
      .order("nombre_completo"),
    admin
      .from("agenda_modelos")
      .select("id, medico_id, nombre, fecha_inicio, fecha_fin, canal_origen, activo")
      .in("canal_origen", ["acordado", "ofrecido"])
      .order("activo", { ascending: false })
      .order("fecha_inicio", { ascending: false })
      .limit(200),
  ]);

  const nombrePorMedico = new Map((medicos ?? []).map((m) => [m.id, m.nombre_completo ?? ""]));

  const opciones: MedicoOpcion[] = (medicos ?? []).map((m) => ({
    id: m.id,
    nombre: m.nombre_completo ?? "",
    especialidad: m.especialidad ?? "",
    conFirma: !!m.firma_manuscrita_url,
  }));

  const agendas: AgendaFila[] = (modelos ?? []).map((mo) => ({
    id: mo.id,
    medicoNombre: nombrePorMedico.get(mo.medico_id) ?? "—",
    nombre: mo.nombre ?? "",
    fechaInicio: mo.fecha_inicio,
    fechaFin: mo.fecha_fin,
    canal: mo.canal_origen as "acordado" | "ofrecido",
    activo: mo.activo,
  }));

  return (
    <AgendasClient
      medicos={opciones}
      agendas={agendas}
      slotDuracionMin={config.slot_duracion_min}
    />
  );
}
