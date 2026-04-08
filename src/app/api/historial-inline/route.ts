export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const medicoId = req.nextUrl.searchParams.get("medicoId");
  const tipo = req.nextUrl.searchParams.get("tipo");
  if (!medicoId || !tipo) return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  if (tipo === "consulta") {
    const { data } = await supabase
      .from("consultas")
      .select("id, created_at, paciente_id, canal_origen")
      .eq("medico_id", medicoId)
      .eq("estado", "completada")
      .order("created_at", { ascending: false })
      .limit(20);

    if (!data) return NextResponse.json([]);

    const pacUserIds = [...new Set(data.map((c) => c.paciente_id))];
    let pacMap = new Map<string, { id: string; nombre: string }>();
    if (pacUserIds.length > 0) {
      const { data: pacs } = await supabase
        .from("pacientes").select("id, user_id, nombre_completo").in("user_id", pacUserIds);
      pacMap = new Map((pacs ?? []).map((p) => [p.user_id, { id: p.id, nombre: p.nombre_completo }]));
    }

    return NextResponse.json(data.map((c) => {
      const pac = pacMap.get(c.paciente_id);
      return {
        id: c.id,
        paciente_nombre: pac?.nombre ?? "Paciente",
        fecha: new Date(c.created_at).toLocaleString("es-AR", {
          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
          timeZone: "America/Argentina/Buenos_Aires",
        }),
        url: pac?.id ? `/medico/paciente/${pac.id}` : "#",
        canal_origen: c.canal_origen ?? "clinica_virtual",
      };
    }));
  }

  if (tipo === "turno") {
    const { data } = await supabase
      .from("turnos")
      .select("id, fecha, hora_inicio, paciente_id, canal_origen")
      .eq("medico_id", medicoId)
      .eq("estado", "completado")
      .order("fecha", { ascending: false })
      .order("hora_inicio", { ascending: false })
      .limit(20);

    if (!data) return NextResponse.json([]);

    const pacIds = [...new Set(data.map((t) => t.paciente_id).filter(Boolean))];
    let nombres = new Map<string, string>();
    if (pacIds.length > 0) {
      const { data: pacs } = await supabase
        .from("pacientes").select("id, nombre_completo").in("id", pacIds);
      nombres = new Map((pacs ?? []).map((p) => [p.id, p.nombre_completo]));
    }

    return NextResponse.json(data.map((t) => ({
      id: t.id,
      paciente_nombre: nombres.get(t.paciente_id) ?? "Paciente",
      fecha: `${new Date(t.fecha + "T12:00:00").toLocaleDateString("es-AR", {
        day: "2-digit", month: "short",
        timeZone: "America/Argentina/Buenos_Aires",
      })} · ${t.hora_inicio.slice(0, 5)}`,
      url: t.paciente_id ? `/medico/paciente/${t.paciente_id}` : "#",
      canal_origen: (t as { canal_origen?: string }).canal_origen ?? "clinica_virtual",
    })));
  }

  return NextResponse.json([]);
}
