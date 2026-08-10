import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { RoomServiceClient, AccessToken } from "livekit-server-sdk";
import { enviarPush, pushAlPaciente } from "@/lib/push";
import { formatNombreMedico } from "@/lib/utils/texto";
import { logError, logInfo } from "@/lib/logger";

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
    .select("id, estado, medico_id, paciente_id, sala_video_url")
    .eq("id", consultaId)
    .single();

  if (!consulta) return NextResponse.json({ error: "No encontrado." }, { status: 404 });

  // Verificar que el usuario es el medico
  // `titulo` ("Dr." / "Dra.") se lee acá porque el nombre del médico sale dos veces
  // hacia el paciente: como nombre del participante en la sala de LiveKit y en el
  // push de "ya podés entrar". Es columna con GRANT para `authenticated`, así que
  // no rompe este SELECT con cliente RLS.
  const { data: medico } = await supabase
    .from("medicos")
    .select("id, nombre_completo, titulo")
    .eq("user_id", user.id)
    .single();

  if (!medico || medico.id !== consulta.medico_id) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  // --- Bloqueo durante ventana de rejoin (Fase 1, §6.4 del diseño) ---
  // Si el médico tiene OTRA consulta/turno en_curso con corte pendiente
  // (desconectado_at != null), está dentro de la ventana de 2 min: no puede abrir
  // una sala distinta hasta retomar o que expire. Excluye el propio recurso
  // (reabrir la misma sala para retomar SÍ está permitido).
  const corteConsulta = await supabase
    .from("consultas")
    .select("id")
    .eq("medico_id", medico.id)
    .eq("estado", "en_curso")
    .not("desconectado_at", "is", null)
    .neq("id", consultaId)
    .limit(1)
    .maybeSingle();
  const corteTurno = await supabase
    .from("turnos")
    .select("id")
    .eq("medico_id", medico.id)
    .eq("estado", "en_curso")
    .not("desconectado_at", "is", null)
    .neq("id", consultaId)
    .limit(1)
    .maybeSingle();

  if (corteConsulta.data || corteTurno.data) {
    return NextResponse.json(
      { error: "Tenés una consulta esperando reconexión. Retomala o esperá a que se cierre antes de abrir otra." },
      { status: 409 }
    );
  }

  // Nombre con el que el médico aparece en la sala y en el aviso al paciente.
  const nombreMedico = formatNombreMedico(medico.nombre_completo, medico.titulo);

  try {
    // Crear sala en LiveKit (si ya existe, createRoom es idempotente)
    const svc = new RoomServiceClient(getHttpUrl(), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    await svc.createRoom({ name: roomName, emptyTimeout: 7200, maxParticipants: 2 });

    // Generar token para el medico
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: `medico-${medico.id}`,
      name: nombreMedico || "Profesional",
      ttl: "2h",
    });
    at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
    const token = await at.toJwt();

    // Guardar roomName en sala_video_url y transicionar estado
    const updateData: Record<string, string> = {};
    if (!consulta.sala_video_url) updateData.sala_video_url = roomName;
    const transicionaEnCurso =
      (tipo === "consulta" && consulta.estado === "pagada") ||
      (tipo === "turno" && consulta.estado !== "en_curso");
    if (transicionaEnCurso) {
      updateData.estado = "en_curso";
      // en_curso_at existe en consultas y turnos (migración 053 + 060)
      updateData.en_curso_at = new Date().toISOString();
    }
    if (Object.keys(updateData).length > 0) {
      // Concurrencia optimista sobre el estado leído: este UPDATE no puede
      // resucitar una atención que se resolvió mientras se armaba la sala
      // (p. ej. `medico_ausente` con el reintegro ya ejecutado).
      await supabase
        .from(tabla)
        .update(updateData)
        .eq("id", consultaId)
        .eq("estado", consulta.estado);
    }

    if (transicionaEnCurso) {
      const pacienteId = (consulta as { paciente_id: string }).paciente_id;
      // La frase arranca por el nombre a propósito: así no necesita artículo
      // ("El Dra. ..." era el bug) ni adjetivo con género ("está listo/lista").
      // "ya está en la sala" sirve igual para Dr. y para Dra., y si el nombre no
      // llegara, el aviso sigue teniendo sentido sin nombrar a nadie.
      const pushPayload = {
        title: "🟢 Docto",
        body: nombreMedico
          ? `${nombreMedico} ya está en la sala. Ingresá ahora a tu consulta.`
          : "Ya podés ingresar a tu consulta.",
        url: tipo === "turno" ? `/turno/${consultaId}/espera` : `/consulta/${consultaId}/sala`,
        tag: `inicio-${consultaId}`,
      };
      if (tipo === "consulta") {
        enviarPush(pacienteId, pushPayload).catch(() => {});
      } else {
        pushAlPaciente(pacienteId, pushPayload).catch(() => {});
      }
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

  const match = roomName.match(/^(consulta|turno)-(.+)$/);
  if (!match) return NextResponse.json({ error: "roomName inválido." }, { status: 400 });

  const [, tipo, resourceId] = match;
  const tabla = tipo === "turno" ? "turnos" : "consultas";

  const { data: medico } = await supabase
    .from("medicos").select("id").eq("user_id", user.id).single();
  if (!medico) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const { data: recurso } = await supabase
    .from(tabla).select("id, medico_id").eq("id", resourceId).single();
  if (!recurso || recurso.medico_id !== medico.id) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  // Marca de intención ANTES de borrar la sala (08/08/2026).
  //
  // Borrar la sala dispara `room_finished` en LiveKit, y ese webhook cierra el
  // encuentro si todavía figura `en_curso` — o sea, puede ganarle por milisegundos
  // al guardado de documentos del médico, que corre en background. Desde que el
  // cierre automático RESCATA el borrador, esa carrera podía terminar en
  // documentos duplicados: los emitidos por el rescate más los del médico.
  //
  // Con esta marca el webhook (y el cierre por desconexión) saben que el cierre
  // lo inició el médico y se limitan a cerrar, sin emitir nada: la emisión es
  // del flujo del médico.
  //
  // NO frena el DELETE si falla, pero tampoco falla en silencio: sin la marca,
  // el cierre automático rescata el borrador y podría competir con el guardado
  // del médico. Que quede escrito en el log es lo que permite entender después
  // un caso raro de documentos duplicados. `.select("id")` para saber si el
  // UPDATE tocó algo de verdad (0 filas ≠ error).
  const { data: marcado, error: errMarca } = await supabase
    .from(tabla)
    .update({ cierre_origen: "medico" })
    .eq("id", resourceId)
    .eq("estado", "en_curso")
    .select("id");

  if (errMarca) {
    logError("[LK/SALA]", "No se pudo marcar el cierre como del médico antes de borrar la sala", {
      tabla,
      recursoId: resourceId,
      error: errMarca.message,
    });
  } else if ((marcado ?? []).length === 0) {
    // Normal si el encuentro ya estaba cerrado (el médico llegó tarde a la
    // carrera, o finaliza desde el overlay de corte). Se loguea igual: es la
    // pista de por qué ese encuentro lo cerró (y rescató) otro camino.
    logInfo("[LK/SALA]", "El encuentro ya no estaba en_curso al finalizar: lo cerró otro camino", {
      tabla,
      recursoId: resourceId,
    });
  }

  try {
    const svc = new RoomServiceClient(getHttpUrl(), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    await svc.deleteRoom(roomName);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
