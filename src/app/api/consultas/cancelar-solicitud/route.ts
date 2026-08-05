import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logInfo } from "@/lib/logger";

// Cancelación de una solicitud de CI por el PROPIO paciente, antes de que haya
// plata en juego (caso Lucas 04/08: esperó más de una hora una aceptación que
// nunca llegó y la pantalla no ofrecía ninguna salida). Solo cancela solicitudes
// sin pago aprobado; una consulta pagada sigue el circuito de reembolsos normal.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  let body: { consultaId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }
  const consultaId = body.consultaId;
  if (!consultaId) {
    return NextResponse.json({ error: "Falta consultaId." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: consulta } = await admin
    .from("consultas")
    .select("id, paciente_id, estado, mp_status")
    .eq("id", consultaId)
    .maybeSingle();

  if (!consulta || consulta.paciente_id !== user.id) {
    return NextResponse.json({ error: "Consulta no encontrada." }, { status: 404 });
  }
  if (consulta.mp_status === "approved") {
    return NextResponse.json(
      { error: "Esta consulta ya tiene un pago realizado. Escribinos a soporte@docto.com.ar y lo resolvemos." },
      { status: 409 }
    );
  }
  if (!["esperando", "aceptada"].includes(consulta.estado)) {
    // Ya cancelada / en curso / completada: nada que hacer. Idempotente para
    // el doble click — el front refresca con el estado real.
    return NextResponse.json({ ok: true, estado: consulta.estado });
  }

  // Guard de carrera: el update exige que el estado siga siendo cancelable y que
  // no haya aparecido un pago aprobado entre el SELECT y acá.
  // OJO PostgREST: `not.eq` excluye los NULL y mp_status es NULL en las impagas
  // — por eso el filtro es explícito: NULL o distinto de approved.
  const { data: actualizada, error } = await admin
    .from("consultas")
    .update({ estado: "cancelada" })
    .eq("id", consultaId)
    .in("estado", ["esperando", "aceptada"])
    .or("mp_status.is.null,mp_status.neq.approved")
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "No se pudo cancelar. Probá de nuevo." }, { status: 500 });
  }
  if (!actualizada) {
    // Carrera perdida (se pagó o cambió de estado en el medio) — no tocar nada.
    return NextResponse.json(
      { error: "La consulta cambió de estado. Recargá la página." },
      { status: 409 }
    );
  }

  logInfo("[cancelar-solicitud]", "Solicitud cancelada por el paciente", { consultaId });
  return NextResponse.json({ ok: true, estado: "cancelada" });
}
