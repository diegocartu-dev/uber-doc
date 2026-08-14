export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { idsSinDocumentacion } from "@/lib/atenciones-sin-documentar";
import { respuestaSiAccesoDemoMuerto } from "@/lib/institucional/demo-puerta";

export async function GET(req: NextRequest) {
  const medicoId = req.nextUrl.searchParams.get("medicoId");
  const tipo = req.nextUrl.searchParams.get("tipo");
  if (!medicoId || !tipo) return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  // La puerta del participante de una reunión (ver `demo-puerta.ts`): con el
  // access token todavía vivo, quien fotografió el QR proyectado seguía leyendo
  // esto. En B2C el helper corta por el gate de modo y no ejecuta nada.
  const accesoMuerto = await respuestaSiAccesoDemoMuerto();
  if (accesoMuerto) return accesoMuerto;

  const { data: medico } = await supabase
    .from("medicos").select("id").eq("user_id", user.id).single();
  if (!medico || medico.id !== medicoId) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

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

    // Cuáles de estas consultas cerraron SIN entregarle un solo documento al
    // paciente. El historial es donde el médico busca una consulta vieja: si el
    // agujero no se marca acá, no se ve en ningún lado (auditoría 08/08/2026).
    const sinDocs = await idsSinDocumentacion(data.map((c) => c.id), "consulta");

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
        canal_origen: c.canal_origen ?? null,
        created_at_raw: c.created_at,
        sin_documentacion: sinDocs.has(c.id),
        completar_url: `/medico/consulta/${c.id}/workspace`,
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

    const sinDocs = await idsSinDocumentacion(data.map((t) => t.id), "turno");

    return NextResponse.json(data.map((t) => ({
      id: t.id,
      paciente_nombre: nombres.get(t.paciente_id) ?? "Paciente",
      fecha: `${new Date(t.fecha + "T12:00:00").toLocaleDateString("es-AR", {
        day: "2-digit", month: "short",
        timeZone: "America/Argentina/Buenos_Aires",
      })} · ${t.hora_inicio.slice(0, 5)}`,
      url: t.paciente_id ? `/medico/paciente/${t.paciente_id}` : "#",
      canal_origen: (t as { canal_origen?: string }).canal_origen ?? null,
      sin_documentacion: sinDocs.has(t.id),
      completar_url: `/turno/${t.id}/video`,
    })));
  }

  return NextResponse.json([]);
}
