import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import WorkspaceConsulta from "./WorkspaceConsulta";
import { RoomServiceClient, AccessToken } from "livekit-server-sdk";
import { cerrarEntradaSala } from "@/lib/sala-espera";
import { cargarEvolucionesPrevias } from "@/lib/evolucion/historia-clinica";

const LIVEKIT_URL = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL || "";
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "";

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

  // Solo medicos
  const { data: medico } = await supabase
    .from("medicos")
    .select("id, nombre_completo")
    .eq("user_id", user.id)
    .single();

  if (!medico) redirect("/dashboard");

  const { data: consulta } = await supabase
    .from("consultas")
    .select(
      "id, estado, especialidad, paciente_id, medico_id, motivo_consulta, sintomas, tiempo_sintomas, doc_borrador, created_at, en_curso_at, sala_video_url"
    )
    .eq("id", consultaId)
    .single();

  if (!consulta || consulta.medico_id !== medico.id) redirect("/dashboard");

  const estadosPermitidos = ["pagada", "en_curso"];
  if (!estadosPermitidos.includes(consulta.estado)) redirect("/dashboard");

  const { data: paciente } = await supabase
    .from("pacientes")
    .select("nombre_completo, fecha_nacimiento, cuil, sexo_dni")
    .eq("user_id", consulta.paciente_id)
    .single();

  // SELECT separado para datos de cobertura (Sprint Receta PR 1)
  // Per CLAUDE.md: no agregar columnas nuevas a SELECTs existentes
  const { data: pacienteCobertura } = await supabase
    .from("pacientes")
    .select("tiene_cobertura, obra_social, nro_afiliado, plan_obra_social")
    .eq("user_id", consulta.paciente_id)
    .single();

  // pacientes.id (SELECT separado per CLAUDE.md) — necesario para traer turnos y
  // documentos del paciente en el Panel HC (asimetría paciente_id).
  const { data: pacienteRow } = await supabase
    .from("pacientes")
    .select("id")
    .eq("user_id", consulta.paciente_id)
    .single();

  // Evoluciones PREVIAS del paciente para el Panel HC (excluye esta consulta).
  // consultas.paciente_id es auth.users.id; turnos usan pacientes.id.
  const evolucionesPrevias = await cargarEvolucionesPrevias(supabase, {
    medicoId: medico.id,
    especialidad: consulta.especialidad,
    pacienteUserId: consulta.paciente_id,
    pacienteId: pacienteRow?.id ?? null,
    excluirId: consultaId,
  });

  // --- Crear/obtener sala LiveKit ---
  let livekitToken: string | null = null;
  let roomName: string | null = null;
  let videoError: string | null = null;

  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    videoError = "LiveKit no esta configurado en el servidor.";
  } else {
    try {
      roomName = `consulta-${consultaId}`;
      const httpUrl = LIVEKIT_URL.replace("wss://", "https://").replace("ws://", "http://");

      // Crear sala (idempotente — si ya existe, no falla)
      const svc = new RoomServiceClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
      await svc.createRoom({ name: roomName, emptyTimeout: 7200, maxParticipants: 2 });

      // Generar token para el medico
      const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity: `medico-${medico.id}`,
        name: medico.nombre_completo || "Medico",
        ttl: "2h",
      });
      at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
      livekitToken = await at.toJwt();

      // Actualizar sala_video_url y estado
      const updateData: Record<string, string> = {};
      if (!consulta.sala_video_url) updateData.sala_video_url = roomName;
      if (consulta.estado === "pagada") {
        updateData.estado = "en_curso";
        updateData.en_curso_at = new Date().toISOString();
      }
      if (Object.keys(updateData).length > 0) {
        await supabase.from("consultas").update(updateData).eq("id", consultaId);
        if (updateData.estado === "en_curso") {
          cerrarEntradaSala({ consultaId, motivo: "atendido" }).catch(() => {});
        }
      }
    } catch (err) {
      videoError = err instanceof Error ? err.message : "Error al conectar con el servicio de video.";
    }
  }

  const horaInicio = consulta.en_curso_at ?? consulta.created_at;

  return (
    <WorkspaceConsulta
      consultaId={consultaId}
      medicoId={medico.id}
      tipo="consulta"
      livekitToken={livekitToken}
      roomName={roomName}
      videoError={videoError}
      horaInicio={horaInicio}
      evolucionesPrevias={evolucionesPrevias}
      consulta={{
        especialidad: consulta.especialidad,
        motivo_consulta: consulta.motivo_consulta,
        sintomas: consulta.sintomas,
        tiempo_sintomas: consulta.tiempo_sintomas,
        paciente_nombre: paciente?.nombre_completo ?? "Paciente",
        paciente_nacimiento: paciente?.fecha_nacimiento ?? null,
        paciente_cuil: paciente?.cuil ?? null,
        paciente_sexo_dni: paciente?.sexo_dni ?? null,
        paciente_id: consulta.paciente_id,
        paciente_cobertura: {
          tiene_cobertura: pacienteCobertura?.tiene_cobertura ?? null,
          obra_social: pacienteCobertura?.obra_social ?? null,
          nro_afiliado: pacienteCobertura?.nro_afiliado ?? null,
          plan_obra_social: pacienteCobertura?.plan_obra_social ?? null,
        },
        doc_borrador: consulta.doc_borrador ?? null,
      }}
    />
  );
}
