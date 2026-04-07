import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import WorkspaceConsulta from "./WorkspaceConsulta";

const DAILY_API_KEY = process.env.DAILY_API_KEY;
const DAILY_API_URL = "https://api.daily.co/v1";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: consultaId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  // Solo médicos
  const { data: medico } = await supabase
    .from("medicos")
    .select("id, nombre_completo")
    .eq("user_id", user.id)
    .single();

  if (!medico) redirect("/dashboard");

  const { data: consulta } = await supabase
    .from("consultas")
    .select(
      "id, estado, especialidad, paciente_id, medico_id, motivo_consulta, sintomas, tiempo_sintomas, doc_borrador, created_at, sala_video_url"
    )
    .eq("id", consultaId)
    .single();

  if (!consulta || consulta.medico_id !== medico.id) redirect("/dashboard");

  const estadosPermitidos = ["pagada", "en_curso"];
  if (!estadosPermitidos.includes(consulta.estado)) redirect("/dashboard");

  const { data: paciente } = await supabase
    .from("pacientes")
    .select("nombre_completo, fecha_nacimiento, cuil")
    .eq("user_id", consulta.paciente_id)
    .single();

  // Crear/obtener sala Daily.co directamente (sin self-fetch que falla en Vercel)
  let dailyUrl: string | null = null;
  let dailyToken: string | null = null;
  let videoError: string | null = null;

  if (!DAILY_API_KEY) {
    videoError = "Daily.co no está configurado en el servidor.";
  } else {
    try {
      const roomName = `consulta-${consultaId}`;

      // Intentar obtener sala existente
      const getRes = await fetch(`${DAILY_API_URL}/rooms/${roomName}`, {
        headers: { Authorization: `Bearer ${DAILY_API_KEY}` },
      });

      let room;
      if (getRes.ok) {
        room = await getRes.json();
      } else {
        // Crear nueva sala privada
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
            properties: { exp, enable_chat: true, enable_screenshare: true, max_participants: 2, lang: "es" },
          }),
        });
        if (!createRes.ok) {
          const err = await createRes.json();
          throw new Error(err.info || err.error || "Error al crear sala");
        }
        room = await createRes.json();
      }

      dailyUrl = room.url;

      // Generar meeting token
      const tokenRes = await fetch(`${DAILY_API_URL}/meeting-tokens`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${DAILY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          properties: {
            room_name: roomName,
            user_name: "Médico",
            user_id: user.id,
            exp: Math.floor(Date.now() / 1000) + 2 * 60 * 60,
          },
        }),
      });
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        dailyToken = tokenData.token ?? null;
      }

      // Actualizar sala_video_url y estado en consulta
      const updateData: Record<string, string> = {};
      if (!consulta.sala_video_url) updateData.sala_video_url = room.url;
      if (consulta.estado === "pagada") updateData.estado = "en_curso";
      if (Object.keys(updateData).length > 0) {
        await supabase.from("consultas").update(updateData).eq("id", consultaId);
      }
    } catch (err) {
      videoError = err instanceof Error ? err.message : "Error al conectar con el servicio de video.";
    }
  }

  // Si la sala se creó y el estado era "pagada", el endpoint ya lo cambió a "en_curso"
  const horaInicio = consulta.created_at;

  return (
    <WorkspaceConsulta
      consultaId={consultaId}
      medicoId={medico.id}
      dailyUrl={dailyUrl}
      dailyToken={dailyToken}
      videoError={videoError}
      horaInicio={horaInicio}
      consulta={{
        especialidad: consulta.especialidad,
        motivo_consulta: consulta.motivo_consulta,
        sintomas: consulta.sintomas,
        tiempo_sintomas: consulta.tiempo_sintomas,
        paciente_nombre: paciente?.nombre_completo ?? "Paciente",
        paciente_nacimiento: paciente?.fecha_nacimiento ?? null,
        paciente_cuil: paciente?.cuil ?? null,
        paciente_id: consulta.paciente_id,
        doc_borrador: consulta.doc_borrador ?? null,
      }}
    />
  );
}
