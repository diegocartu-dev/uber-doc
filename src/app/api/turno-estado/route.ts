import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const turnoId = req.nextUrl.searchParams.get("turnoId");
  if (!turnoId) return NextResponse.json({ error: "Falta turnoId" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: medico } = await supabase
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  // NOTA: `desconectado_at` lo agrega la migración 20260606_resolucion_consultas_fase1.sql.
  // No desplegar este SELECT antes de aplicar la migración. Ver regla en CLAUDE.md.
  let query = supabase
    .from("turnos")
    .select("estado, sala_video_url, desconectado_at")
    .eq("id", turnoId);

  if (medico) {
    query = query.eq("medico_id", medico.id);
  } else {
    const { data: paciente } = await supabase
      .from("pacientes").select("id").eq("user_id", user.id).maybeSingle();
    if (!paciente) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    query = query.eq("paciente_id", paciente.id);
  }

  const { data } = await query.single();

  if (!data) return NextResponse.json({ error: "No encontrado" }, { status: 403 });

  // Cierre on-demand del rejoin (mismo criterio que consulta-estado): 2 min sin
  // reconexión → cerramos acá. Sin dependencia del cron de 1 min (Vercel Pro).
  // Backstop diario: /api/cron/rejoin-expirar. Idempotente por estado='en_curso'.
  let estado = data.estado;
  let desconectado_at = data.desconectado_at;
  if (
    estado === "en_curso" &&
    desconectado_at &&
    new Date(desconectado_at).getTime() < Date.now() - 2 * 60 * 1000
  ) {
    const admin = createAdminClient();
    const { data: cerrado } = await admin
      .from("turnos")
      .update({ estado: "completado", desconectado_at: null })
      .eq("id", turnoId)
      .eq("estado", "en_curso")
      .select("id")
      .maybeSingle();
    if (cerrado) {
      estado = "completado";
      desconectado_at = null;
    }
  }

  return NextResponse.json({ estado, sala_video_url: data.sala_video_url, desconectado_at });
}
