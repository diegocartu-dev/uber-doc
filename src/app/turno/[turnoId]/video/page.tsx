import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import WorkspaceConsulta from "@/app/medico/consulta/[id]/workspace/WorkspaceConsulta";
import { RoomServiceClient, AccessToken } from "livekit-server-sdk";
import { pushAlPaciente } from "@/lib/push";
import { cerrarEntradaSala } from "@/lib/sala-espera";
import { articuloMedico, formatNombreMedico } from "@/lib/utils/texto";
import { cargarEvolucionesPrevias } from "@/lib/evolucion/historia-clinica";

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
  if (turno.estado === "cancelado_paciente" || turno.estado === "cancelado_medico") redirect("/dashboard");

  // Verificar participante — ANTES del chequeo de estado, porque un turno ya
  // cerrado solo lo puede abrir el médico que lo atendió.
  const { data: medicoData } = await supabase
    // `titulo` ("Dr."/"Dra.") entra acá para el push que le llega al paciente:
    // el aviso decía "El Dr." aunque atendiera una médica.
    .from("medicos").select("id, nombre_completo, titulo, especialidad").eq("user_id", user.id).maybeSingle();

  const esMedico = medicoData?.id === turno.medico_id;

  if (!esMedico) redirect("/dashboard");

  // ── Modo "completar documentación" (08/08/2026) ──────────────────────────
  // Un turno cerrado ya no rebota al dashboard: el médico puede volver a emitir
  // la documentación que faltó. Sin video, sin cambiar el estado del turno, y
  // sin poder tocar nada de lo ya emitido y firmado.
  const modoCompletar = turno.estado === "completado";

  // Datos del cierre (SELECT separado per CLAUDE.md).
  const cierreTurno = modoCompletar
    ? (
        await supabase
          .from("turnos")
          .select("completada_at, cierre_origen, evolucion, reintegro_estado")
          .eq("id", turnoId)
          .maybeSingle()
      ).data ?? null
    : null;

  // Reembolsado: el paciente ya recuperó la plata. No se emite documentación.
  if (modoCompletar && cierreTurno?.reintegro_estado === "reembolsado") redirect("/dashboard");

  const documentosEmitidos = modoCompletar
    ? (
        await supabase
          .from("documentos")
          .select("id, tipo, created_at")
          .eq("turno_id", turnoId)
          .in("tipo", ["receta", "indicaciones", "certificado", "orden"])
          .order("created_at", { ascending: true })
      ).data ?? []
    : [];

  // Transicionar a en_curso (nunca en modo completar: el turno queda cerrado)
  if (!modoCompletar && turno.estado !== "en_curso") {
    await supabase.from("turnos").update({ estado: "en_curso", iniciado_en: new Date().toISOString() }).eq("id", turnoId);
    cerrarEntradaSala({ turnoId, motivo: "atendido" }).catch(() => {});
    // El aviso lleva artículo ("el Dr." / "la Dra."): sale del título que eligió
    // el médico. Sin título no se arriesga ninguno y la frase se arma sin él;
    // "te está esperando" evita además el adjetivo con género de "está listo/a".
    const nombreMedico = formatNombreMedico(medicoData?.nombre_completo ?? "", medicoData?.titulo);
    const articulo = articuloMedico(medicoData?.titulo);
    const sujeto = nombreMedico
      ? `${articulo ? `${articulo[0].toUpperCase()}${articulo.slice(1)} ` : ""}${nombreMedico}`
      : "Tu médico";
    pushAlPaciente(turno.paciente_id, {
      title: "🟢 Docto",
      body: `${sujeto} ya te está esperando. Ingresá ahora a tu consulta.`,
      url: `/turno/${turnoId}/espera`,
      tag: `inicio-${turnoId}`,
    }).catch(() => {});
  }

  // Datos del paciente
  const { data: paciente } = await supabase
    .from("pacientes").select("nombre_completo, fecha_nacimiento, cuil, sexo_dni")
    .eq("id", turno.paciente_id).maybeSingle();

  // Datos de cobertura (SELECT separado per CLAUDE.md)
  const { data: pacienteCobertura } = await supabase
    .from("pacientes").select("tiene_cobertura, obra_social, nro_afiliado, plan_obra_social")
    .eq("id", turno.paciente_id).maybeSingle();

  // user_id del paciente (SELECT separado per CLAUDE.md) — necesario para traer
  // las consultas inmediatas del paciente en el Panel HC (asimetría paciente_id).
  const { data: pacienteRow } = await supabase
    .from("pacientes").select("user_id")
    .eq("id", turno.paciente_id).maybeSingle();

  // Evoluciones PREVIAS del paciente para el Panel HC (excluye este turno).
  // turnos.paciente_id ya es pacientes.id; consultas usan auth.users.id.
  const evolucionesPrevias = await cargarEvolucionesPrevias(supabase, {
    medicoId: medicoData!.id,
    especialidad: medicoData?.especialidad ?? "",
    pacienteUserId: pacienteRow?.user_id ?? null,
    pacienteId: turno.paciente_id ?? null,
    excluirId: turnoId,
  });

  // --- Crear/obtener sala LiveKit ---
  let livekitToken: string | null = null;
  let roomName: string | null = null;
  let videoError: string | null = null;

  // En modo completar NO se toca el video: el turno terminó y no se reabre.
  if (modoCompletar) {
    // sin sala, sin token — deliberado.
  } else if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    videoError = "LiveKit no esta configurado en el servidor.";
  } else {
    try {
      roomName = `turno-${turnoId}`;
      const httpUrl = LIVEKIT_URL.replace("wss://", "https://").replace("ws://", "http://");

      const svc = new RoomServiceClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
      await svc.createRoom({ name: roomName, emptyTimeout: 7200, maxParticipants: 2 });

      const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity: `medico-${medicoData!.id}`,
        // Nombre visible para el paciente sobre el video: con el tratamiento que
        // el médico eligió (el `titulo` ya viene en el SELECT de arriba, que lo
        // usa para el push). "Profesional" solo si falta el nombre.
        name: formatNombreMedico(medicoData!.nombre_completo, medicoData!.titulo) || "Profesional",
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
      tipo="turno"
      livekitToken={livekitToken}
      roomName={roomName}
      videoError={videoError}
      horaInicio={turno.hora_inicio || new Date().toISOString()}
      evolucionesPrevias={evolucionesPrevias}
      modoCompletar={modoCompletar}
      cierre={
        modoCompletar
          ? {
              cerradaAt: cierreTurno?.completada_at ?? null,
              cierreOrigen: cierreTurno?.cierre_origen ?? null,
              evolucionRegistrada: cierreTurno?.evolucion ?? null,
              documentosEmitidos: documentosEmitidos.map((d) => ({
                tipo: d.tipo,
                createdAt: d.created_at,
              })),
            }
          : null
      }
      consulta={{
        especialidad: medicoData?.especialidad ?? "",
        motivo_consulta: null,
        sintomas: null,
        tiempo_sintomas: null,
        paciente_nombre: paciente?.nombre_completo ?? "Paciente",
        paciente_nacimiento: paciente?.fecha_nacimiento ?? null,
        paciente_cuil: paciente?.cuil ?? null,
        paciente_sexo_dni: paciente?.sexo_dni ?? null,
        paciente_id: turno.paciente_id ?? "",
        paciente_cobertura: {
          tiene_cobertura: pacienteCobertura?.tiene_cobertura ?? null,
          obra_social: pacienteCobertura?.obra_social ?? null,
          nro_afiliado: pacienteCobertura?.nro_afiliado ?? null,
          plan_obra_social: pacienteCobertura?.plan_obra_social ?? null,
        },
        doc_borrador: turno.doc_borrador ?? null,
      }}
    />
  );
}
