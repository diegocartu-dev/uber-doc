import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DAILY_API_KEY = process.env.DAILY_API_KEY;
const DAILY_API_URL = "https://api.daily.co/v1";

async function generarMeetingToken(
  roomName: string,
  userName: string,
  userId: string
): Promise<string | null> {
  const exp = Math.floor(Date.now() / 1000) + 2 * 60 * 60;
  const res = await fetch(`${DAILY_API_URL}/meeting-tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DAILY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        room_name: roomName,
        user_name: userName,
        user_id: userId,
        exp,
      },
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.token ?? null;
}

export async function POST(req: NextRequest) {
  if (!DAILY_API_KEY) {
    return NextResponse.json(
      { error: "Daily.co no está configurado en el servidor." },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { consultaId: turnoId } = await req.json();

  if (!turnoId) {
    return NextResponse.json({ error: "Falta turnoId." }, { status: 400 });
  }

  // Verificar que el turno existe y está en estado válido
  const { data: turno } = await supabase
    .from("turnos")
    .select("id, estado, paciente_id, medico_id, sala_video_url")
    .eq("id", turnoId)
    .single();

  if (!turno) {
    return NextResponse.json(
      { error: "Turno no encontrado." },
      { status: 404 }
    );
  }

  if (turno.estado !== "en_curso" && turno.estado !== "en_espera") {
    return NextResponse.json(
      { error: `El turno no está en curso (estado: ${turno.estado}).` },
      { status: 400 }
    );
  }

  // Verificar que el usuario es el paciente o el médico de este turno
  const { data: medico } = await supabase
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: paciente } = await supabase
    .from("pacientes")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  const esMedico = medico?.id === turno.medico_id;
  const esPaciente = paciente?.id === turno.paciente_id;

  if (!esPaciente && !esMedico) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const roomName = `turno-${turnoId}`;
  const userName = esMedico ? "Médico" : "Paciente";

  // Si ya tiene sala creada, devolver con token
  if (turno.sala_video_url) {
    const token = await generarMeetingToken(roomName, userName, user.id);
    return NextResponse.json({ url: turno.sala_video_url, roomName, token });
  }

  try {
    // Intentar obtener la sala existente en Daily
    const getRes = await fetch(`${DAILY_API_URL}/rooms/${roomName}`, {
      headers: { Authorization: `Bearer ${DAILY_API_KEY}` },
    });

    if (getRes.ok) {
      const room = await getRes.json();
      await supabase
        .from("turnos")
        .update({ sala_video_url: room.url })
        .eq("id", turnoId);
      const token = await generarMeetingToken(roomName, userName, user.id);
      return NextResponse.json({ url: room.url, roomName, token });
    }

    // Crear nueva sala privada con expiración de 2 horas
    const exp = Math.floor(Date.now() / 1000) + 2 * 60 * 60;

    const createRes = await fetch(`${DAILY_API_URL}/rooms`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DAILY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: roomName,
        privacy: "private",
        properties: {
          exp,
          enable_chat: true,
          enable_screenshare: true,
          max_participants: 2,
          lang: "es",
        },
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.json();
      return NextResponse.json(
        { error: `Error de Daily.co: ${err.info || err.error || JSON.stringify(err)}` },
        { status: 502 }
      );
    }

    const room = await createRes.json();

    // Guardar URL en el turno
    await supabase
      .from("turnos")
      .update({ sala_video_url: room.url })
      .eq("id", turnoId);

    const token = await generarMeetingToken(roomName, userName, user.id);
    return NextResponse.json({ url: room.url, roomName, token });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    return NextResponse.json(
      { error: `Error de Daily.co: ${message}` },
      { status: 502 }
    );
  }
}
