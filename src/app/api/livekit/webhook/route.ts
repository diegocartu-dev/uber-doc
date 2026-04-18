import { NextRequest, NextResponse } from "next/server";
import { WebhookReceiver } from "livekit-server-sdk";
import { createAdminClient } from "@/lib/supabase/admin";

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "";

// ---------------------------------------------------------------------------
// POST /api/livekit/webhook
//
// LiveKit envía eventos firmados con JWT. Escuchamos `room_finished` para
// cerrar consultas huérfanas: si la sala se destruyó y la consulta sigue
// en_curso, la marcamos como completada.
//
// Room naming convention: `${tipo}-${consultaId}` (ej: "consulta-abc123")
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return NextResponse.json(
      { error: "LiveKit no configurado" },
      { status: 500 }
    );
  }

  const body = await req.text();
  const authHeader = req.headers.get("authorization") || "";

  const receiver = new WebhookReceiver(LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  let event;
  try {
    event = await receiver.receive(body, authHeader);
  } catch {
    return NextResponse.json(
      { error: "Firma invalida" },
      { status: 401 }
    );
  }

  // Solo nos interesa room_finished
  if (event.event !== "room_finished") {
    return NextResponse.json({ ok: true, ignored: event.event });
  }

  const roomName = event.room?.name;
  if (!roomName) {
    return NextResponse.json({ ok: true, ignored: "sin room name" });
  }

  // Parsear tipo e ID del room name
  const match = roomName.match(/^(consulta|turno)-(.+)$/);
  if (!match) {
    return NextResponse.json({ ok: true, ignored: "room name no matchea patron" });
  }

  const [, tipo, consultaId] = match;
  const tabla = tipo === "turno" ? "turnos" : "consultas";

  const supabase = createAdminClient();

  // Verificar estado actual
  const { data: registro, error: errSelect } = await supabase
    .from(tabla)
    .select("id, estado")
    .eq("id", consultaId)
    .single();

  if (errSelect || !registro) {
    return NextResponse.json({
      ok: false,
      error: "Registro no encontrado",
      detail: errSelect?.message,
    });
  }

  // Solo cerrar si sigue en_curso
  if (registro.estado !== "en_curso") {
    return NextResponse.json({
      ok: true,
      action: "none",
      reason: `Estado actual: ${registro.estado}`,
    });
  }

  const { error: errUpdate } = await supabase
    .from(tabla)
    .update({ estado: "completada" })
    .eq("id", consultaId);

  if (errUpdate) {
    return NextResponse.json(
      {
        ok: false,
        error: "Error actualizando estado",
        detail: errUpdate.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    action: "cerrada",
    tipo,
    consultaId,
  });
}
