import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import WorkspaceConsulta from "./WorkspaceConsulta";
import { RoomServiceClient, AccessToken } from "livekit-server-sdk";
import { cerrarEntradaSala } from "@/lib/sala-espera";
import { cargarEvolucionesPrevias } from "@/lib/evolucion/historia-clinica";
import { formatNombreMedico } from "@/lib/utils/texto";

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

  // Solo medicos.
  // `titulo` ("Dr."/"Dra.") entra al SELECT porque el nombre de este médico se
  // publica como nombre de participante en la sala de LiveKit y es lo que el
  // PACIENTE lee sobre el video. Los otros dos caminos que abren la misma sala
  // (api/livekit/crear-sala y api/livekit/token) ya lo emiten con tratamiento;
  // sin esto, el mismo médico aparecía con dos nombres distintos según el camino.
  // Solo esa columna: en `medicos` hay columnas sin GRANT y con cliente RLS una
  // sola de ellas hace fallar el SELECT ENTERO en silencio (CLAUDE.md).
  const { data: medico } = await supabase
    .from("medicos")
    .select("id, nombre_completo, titulo")
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

  // ── Modo "completar documentación" (08/08/2026) ──────────────────────────
  // Hasta hoy esta pantalla solo abría con la consulta viva. Si la consulta se
  // cerraba sola (se cortó internet, la cerró un cron), lo que el médico había
  // escrito quedaba encerrado en el borrador y no había NINGUNA forma de
  // entregárselo al paciente: la puerta estaba cerrada con llave desde adentro.
  //
  // Ahora una consulta cerrada también abre, pero en un modo acotado: sin video,
  // sin cambiar el estado de la consulta, y solo para emitir lo que faltó. Todo
  // documento ya emitido y firmado es de solo lectura.
  const estadosAbiertos = ["pagada", "en_curso"];
  const modoCompletar = consulta.estado === "completada";
  if (!estadosAbiertos.includes(consulta.estado) && !modoCompletar) redirect("/dashboard");

  // Datos del cierre. SELECT separado per CLAUDE.md: no se toca el SELECT
  // principal, que funciona en producción.
  const cierreConsulta = modoCompletar
    ? (
        await supabase
          .from("consultas")
          .select("completada_at, cierre_origen, evolucion, reintegro_estado")
          .eq("id", consultaId)
          .maybeSingle()
      ).data ?? null
    : null;

  // Reembolsada: el paciente ya recuperó la plata. No se emite documentación.
  if (modoCompletar && cierreConsulta?.reintegro_estado === "reembolsado") redirect("/dashboard");

  // Documentos ya entregados. Se muestran como entregados y NO se pueden
  // reemplazar: lo firmado es inmutable.
  const documentosEmitidos = modoCompletar
    ? (
        await supabase
          .from("documentos")
          .select("id, tipo, created_at")
          .eq("consulta_id", consultaId)
          .in("tipo", ["receta", "indicaciones", "certificado", "orden"])
          .order("created_at", { ascending: true })
      ).data ?? []
    : [];

  const { data: paciente } = await supabase
    .from("pacientes")
    .select("nombre_completo, fecha_nacimiento, sexo_dni")
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

  // En modo completar NO se toca el video: la consulta terminó y no se reabre.
  if (modoCompletar) {
    // sin sala, sin token, sin update de estado — deliberado.
  } else if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
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
        // Nombre visible para el paciente en la videollamada: con el tratamiento
        // que el médico eligió. "Profesional" solo si no hay nombre — nunca un
        // título inventado.
        name: formatNombreMedico(medico.nombre_completo, medico.titulo) || "Profesional",
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
        // `.eq("estado", consulta.estado)`: concurrencia optimista sobre el
        // estado que se leyó arriba. Sin esto, este UPDATE pisaba CUALQUIER
        // estado — incluido uno terminal. Con el plazo de 30 min corriendo, el
        // cron puede resolver `medico_ausente` y devolver el 100% mientras esta
        // página arma la sala; sin el guard, el profesional entraba igual y
        // atendía una consulta ya reembolsada, con el paciente retenido de nuevo.
        await supabase
          .from("consultas")
          .update(updateData)
          .eq("id", consultaId)
          .eq("estado", consulta.estado);
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
      modoCompletar={modoCompletar}
      cierre={
        modoCompletar
          ? {
              cerradaAt: cierreConsulta?.completada_at ?? null,
              cierreOrigen: cierreConsulta?.cierre_origen ?? null,
              evolucionRegistrada: cierreConsulta?.evolucion ?? null,
              documentosEmitidos: documentosEmitidos.map((d) => ({
                tipo: d.tipo,
                createdAt: d.created_at,
              })),
            }
          : null
      }
      consulta={{
        especialidad: consulta.especialidad,
        motivo_consulta: consulta.motivo_consulta,
        sintomas: consulta.sintomas,
        tiempo_sintomas: consulta.tiempo_sintomas,
        paciente_nombre: paciente?.nombre_completo ?? "Paciente",
        paciente_nacimiento: paciente?.fecha_nacimiento ?? null,
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
