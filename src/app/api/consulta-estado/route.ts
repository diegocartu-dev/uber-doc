import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolverYAplicarConsulta } from "@/lib/aplicar-resolucion";

export async function GET(req: NextRequest) {
  const consultaId = req.nextUrl.searchParams.get("consultaId");
  if (!consultaId) return NextResponse.json({ error: "Falta consultaId" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  // Determinar rol del usuario
  const { data: medico } = await supabase
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  // Filtrar por ownership: paciente_id = auth.uid() o medico_id = medico.id
  // NOTA: `desconectado_at` lo agrega la migración 20260606_resolucion_consultas_fase1.sql.
  // El código que lo selecciona NO debe desplegarse antes de aplicar esa migración
  // (PostgREST falla el SELECT si la columna no existe). Ver regla en CLAUDE.md.
  let query = supabase
    .from("consultas")
    .select("estado, sala_video_url, desconectado_at")
    .eq("id", consultaId);

  if (medico) {
    query = query.eq("medico_id", medico.id);
  } else {
    query = query.eq("paciente_id", user.id);
  }

  const { data } = await query.single();

  if (!data) return NextResponse.json({ error: "No encontrada" }, { status: 403 });

  // Resolución on-demand (Fase 2): mientras el paciente pollea (cada 5s),
  // resolvemos en tiempo real una consulta en_curso que ya corresponde cerrar —
  // corte de red sin reconexión, o médico que nunca apareció — pasada la ventana
  // de gracia de 15 min. El aplicador hace cumplir la ventana + la acción de plata
  // (reembolso al paciente si el médico no finalizó); acá solo reflejamos el
  // resultado. Backstop: crons rejoin-expirar / tolerancia-inicio. Nunca resuelve
  // una consulta activa ni una que el médico finalizó (esa ya está completada).
  let estado = data.estado;
  let desconectado_at = data.desconectado_at;
  if (estado === "en_curso") {
    const motivo = await resolverYAplicarConsulta(consultaId, "polling_consulta");
    if (motivo) {
      estado = motivo;
      desconectado_at = null;
    }
  }

  return NextResponse.json({ estado, sala_video_url: data.sala_video_url, desconectado_at });
}
