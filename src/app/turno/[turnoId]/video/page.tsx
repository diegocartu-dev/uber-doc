import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import WorkspaceConsulta from "@/app/medico/consulta/[id]/workspace/WorkspaceConsulta";
import { RoomServiceClient, AccessToken } from "livekit-server-sdk";

const LIVEKIT_URL = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL || "";
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "";

export default async function VideoTurnoPage({
  params,
}: {
  params: Promise<{ turnoId: string }>;
}) {
  const { turnoId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: turno } = await supabase
    .from("turnos")
    .select("id, estado, medico_id, paciente_id, sala_video_url, hora_inicio, doc_borrador")
    .eq("id", turnoId)
    .single();

  if (!turno) redirect("/dashboard");
  if (turno.estado === "completado" || turno.estado === "cancelado_paciente" || turno.estado === "cancelado_medico") redirect("/dashboard");

  // Verificar participante
  const { data: medicoData } = await supabase
    .from("medicos").select("id, nombre_completo, especialidad").eq("user_id", user.id).maybeSingle();

  const esMedico = medicoData?.id === turno.medico_id;

  if (!esMedico) redirect("/dashboard");

  // Transicionar a en_curso
  if (turno.estado !== "en_curso") {
    await supabase.from("turnos").update({ estado: "en_curso", iniciado_en: new Date().toISOString() }).eq("id", turnoId);
  }

  // Datos del paciente
  const { data: paciente } = await supabase
    .from("pacientes").select("nombre_completo, fecha_nacimiento, cuil")
    .eq("id", turno.paciente_id).maybeSingle();

  // --- Crear/obtener sala LiveKit ---
  let livekitToken: string | null = null;
  let roomName: string | null = null;
  let videoError: string | null = null;

  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    videoError = "LiveKit no esta configurado en el servidor.";
  } else {
    try {
      roomName = `turno-${turnoId}`;
      const httpUrl = LIVEKIT_URL.replace("wss://", "https://").replace("ws://", "http://");

      const svc = new RoomServiceClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
      await svc.createRoom({ name: roomName, emptyTimeout: 7200, maxParticipants: 2 });

      const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity: `medico-${medicoData!.id}`,
        name: medicoData!.nombre_completo || "Medico",
        ttl: "2h",
      });
      at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
      livekitToken = await at.toJwt();

      // Guardar roomName
      if (!turno.sala_video_url) {
        await supabase.from("turnos").update({ sala_video_url: roomName }).eq("id", turnoId);
      }
    } catch (err) {
      videoError = err instanceof Error ? err.message : "Error al conectar con el servicio de video.";
    }
  }

  return (
    <WorkspaceConsulta
      consultaId={turnoId}
      medicoId={medicoData!.id}
      livekitToken={livekitToken}
      roomName={roomName}
      videoError={videoError}
      horaInicio={turno.hora_inicio || new Date().toISOString()}
      consulta={{
        especialidad: medicoData?.especialidad ?? "",
        motivo_consulta: null,
        sintomas: null,
        tiempo_sintomas: null,
        paciente_nombre: paciente?.nombre_completo ?? "Paciente",
        paciente_nacimiento: paciente?.fecha_nacimiento ?? null,
        paciente_cuil: paciente?.cuil ?? null,
        paciente_id: turno.paciente_id ?? "",
        doc_borrador: turno.doc_borrador ?? null,
      }}
    />
  );
}
