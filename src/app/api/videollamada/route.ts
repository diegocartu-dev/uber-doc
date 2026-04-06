import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DAILY_API_KEY = process.env.DAILY_API_KEY;
const DAILY_API_URL = "https://api.daily.co/v1";

export async function POST(req: NextRequest) {
  if (!DAILY_API_KEY) {
    console.error("[Daily] DAILY_API_KEY no configurado en .env.local");
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

  const { consultaId } = await req.json();

  if (!consultaId) {
    return NextResponse.json({ error: "Falta consultaId." }, { status: 400 });
  }

  // Verificar que la consulta existe y está en_curso
  const { data: consulta } = await supabase
    .from("consultas")
    .select("id, estado, paciente_id, medico_id, sala_video_url")
    .eq("id", consultaId)
    .single();

  if (!consulta) {
    return NextResponse.json(
      { error: "Consulta no encontrada." },
      { status: 404 }
    );
  }

  if (consulta.estado !== "en_curso" && consulta.estado !== "pagada") {
    return NextResponse.json(
      { error: `La consulta no está en estado válido (estado: ${consulta.estado}).` },
      { status: 400 }
    );
  }

  // Verificar que el usuario es el paciente o el médico de esta consulta
  const { data: medico } = await supabase
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .single();

  const esPaciente = consulta.paciente_id === user.id;
  const esMedico = medico?.id === consulta.medico_id;

  if (!esPaciente && !esMedico) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  // Nombre de sala único basado en el ID de consulta
  const roomName = `consulta-${consultaId}`;

  try {
    // Intentar obtener la sala existente
    const getRes = await fetch(`${DAILY_API_URL}/rooms/${roomName}`, {
      headers: { Authorization: `Bearer ${DAILY_API_KEY}` },
    });

    if (getRes.ok) {
      const room = await getRes.json();
      // Guardar URL y transicionar estado si corresponde
      const updateData: Record<string, string> = {};
      if (!consulta.sala_video_url) updateData.sala_video_url = room.url;
      if (consulta.estado === "pagada") updateData.estado = "en_curso";
      if (Object.keys(updateData).length > 0) {
        await supabase.from("consultas").update(updateData).eq("id", consultaId);
      }
      return NextResponse.json({ url: room.url, roomName });
    }

    // Crear nueva sala con expiración de 2 horas
    const exp = Math.floor(Date.now() / 1000) + 2 * 60 * 60;

    const createRes = await fetch(`${DAILY_API_URL}/rooms`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DAILY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: roomName,
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
      console.error("[Daily] Error al crear sala:", JSON.stringify(err));
      return NextResponse.json(
        { error: `Error de Daily.co: ${err.info || err.error || JSON.stringify(err)}` },
        { status: 502 }
      );
    }

    const room = await createRes.json();

    // Guardar URL y transicionar estado
    const updateFields: Record<string, string> = { sala_video_url: room.url };
    if (consulta.estado === "pagada") updateFields.estado = "en_curso";
    const { error: updateError } = await supabase
      .from("consultas")
      .update(updateFields)
      .eq("id", consultaId);

    if (updateError) {
      console.error("[Daily] Error al guardar sala_video_url:", updateError.message);
    }

    return NextResponse.json({ url: room.url, roomName });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    console.error("[Daily] Error:", message);
    return NextResponse.json(
      { error: `Error de Daily.co: ${message}` },
      { status: 502 }
    );
  }
}
