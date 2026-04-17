import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { RoomServiceClient, AccessToken } from "livekit-server-sdk";

const LIVEKIT_URL = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL || "";
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "";

function getHttpUrl(): string {
  return LIVEKIT_URL.replace("wss://", "https://").replace("ws://", "http://");
}

// ---------------------------------------------------------------------------
// POST — Crear sala LiveKit + generar token para el medico
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return NextResponse.json({ error: "LiveKit no esta configurado." }, { status: 500 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { consultaId, tipo = "consulta" } = await req.json();
  if (!consultaId) return NextResponse.json({ error: "Falta consultaId." }, { status: 400 });

  const tabla = tipo === "turno" ? "turnos" : "consultas";
  const roomName = `${tipo}-${consultaId}`;

  // Verificar que existe
  const { data: consulta } = await supabase
    .from(tabla)
    .select("id, estado, medico_id, sala_video_url")
    .eq("id", consultaId)
    .single();

  if (!consulta) return NextResponse.json({ error: "No encontrado." }, { status: 404 });

  // Verificar que el usuario es el medico
  const { data: medico } = await supabase
    .from("medicos")
    .select("id, nombre_completo")
    .eq("user_id", user.id)
    .single();

  if (!medico || medico.id !== consulta.medico_id) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  try {
    // Crear sala en LiveKit (si ya existe, createRoom es idempotente)
    const svc = new RoomServiceClient(getHttpUrl(), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    await svc.createRoom({ name: roomName, emptyTimeout: 7200, maxParticipants: 2 });

    // Generar token para el medico
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: `medico-${medico.id}`,
      name: medico.nombre_completo || "Medico",
      ttl: "2h",
    });
    at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
    const token = await at.toJwt();

    // Guardar roomName en sala_video_url y transicionar estado
    const updateData: Record<string, string> = {};
    if (!consulta.sala_video_url) updateData.sala_video_url = roomName;
    if (tipo === "consulta" && consulta.estado === "pagada") updateData.estado = "en_curso";
    if (tipo === "turno" && consulta.estado !== "en_curso") updateData.estado = "en_curso";
    if (Object.keys(updateData).length > 0) {
      await supabase.from(tabla).update(updateData).eq("id", consultaId);
    }

    return NextResponse.json({ roomName, token });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al crear sala";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

// ---------------------------------------------------------------------------
// DELETE — Eliminar sala LiveKit (medico finaliza consulta)
// ---------------------------------------------------------------------------

export async function DELETE(req: NextRequest) {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return NextResponse.json({ error: "LiveKit no esta configurado." }, { status: 500 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { roomName } = await req.json();
  if (!roomName) return NextResponse.json({ error: "Falta roomName." }, { status: 400 });

  try {
    const svc = new RoomServiceClient(getHttpUrl(), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    await svc.deleteRoom(roomName);
    return NextResponse.json({ ok: true });
  } catch {
    // La sala puede ya no existir — OK
    return NextResponse.json({ ok: true });
  }
}
