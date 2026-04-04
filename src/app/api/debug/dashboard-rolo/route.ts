export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ROLO_MEDICO_ID = "6b0bfc47-940b-45df-b0ba-f8bb3d483895";

export async function GET() {
  // 1. Auth del request
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const authUid = user?.id ?? "NO AUTH";

  // 2. Cálculo de "hoy" (mismo método que page.tsx)
  const rawDate = new Date();
  const arString = rawDate.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" });
  const ahoraAR = new Date(arString);
  const pad = (n: number) => n.toString().padStart(2, "0");
  const hoy = `${ahoraAR.getFullYear()}-${pad(ahoraAR.getMonth() + 1)}-${pad(ahoraAR.getDate())}`;

  // 3. Queries con admin (bypass RLS)
  const admin = createAdminClient();

  const { data: turnosCompHoy, count: countHoy } = await admin
    .from("turnos").select("id, fecha, hora_inicio, estado, paciente_id", { count: "exact" })
    .eq("medico_id", ROLO_MEDICO_ID).eq("estado", "completado").eq("fecha", hoy);

  const { count: countTotal } = await admin
    .from("turnos").select("id", { count: "exact", head: true })
    .eq("medico_id", ROLO_MEDICO_ID).eq("estado", "completado");

  const { count: countDisponibles } = await admin
    .from("turnos").select("id", { count: "exact", head: true })
    .eq("medico_id", ROLO_MEDICO_ID).eq("estado", "disponible");

  // 4. Query con RLS (como lo haría page.tsx)
  const { data: turnosRLS, error: rlsError } = await supabase
    .from("turnos").select("id, fecha, estado")
    .eq("medico_id", ROLO_MEDICO_ID).eq("estado", "completado").eq("fecha", hoy);

  // 5. Query turnosHoy con RLS (mismo filtro que page.tsx línea 255-260)
  const { data: turnosHoyRLS, error: turnosHoyError } = await supabase
    .from("turnos").select("id, fecha, hora_inicio, hora_fin, estado, paciente_id")
    .eq("medico_id", ROLO_MEDICO_ID).eq("fecha", hoy)
    .in("estado", ["confirmado", "en_espera", "en_curso", "completado"])
    .order("hora_inicio", { ascending: true });

  return NextResponse.json({
    server_time: {
      raw_utc: rawDate.toISOString(),
      ar_string: arString,
      hoy_calculado: hoy,
    },
    auth: {
      uid: authUid,
      user_email: user?.email ?? "N/A",
    },
    admin_bypass_rls: {
      turnos_completados_hoy: countHoy ?? 0,
      turnos_completados_hoy_detalle: turnosCompHoy,
      turnos_completados_total: countTotal ?? 0,
      turnos_disponibles: countDisponibles ?? 0,
    },
    con_rls: {
      turnos_completados_hoy: turnosRLS?.length ?? 0,
      turnos_completados_hoy_detalle: turnosRLS,
      rls_error: rlsError?.message ?? null,
      turnos_hoy_agenda: turnosHoyRLS?.length ?? 0,
      turnos_hoy_agenda_detalle: turnosHoyRLS,
      turnos_hoy_error: turnosHoyError?.message ?? null,
    },
  });
}
