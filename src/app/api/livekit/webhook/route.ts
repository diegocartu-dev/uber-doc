import { NextRequest, NextResponse } from "next/server";
import { WebhookReceiver, RoomServiceClient } from "livekit-server-sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { logInfo, logWarn, logError } from "@/lib/logger";

const LIVEKIT_URL =
  process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL || "";
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "";

// ---------------------------------------------------------------------------
// POST /api/livekit/webhook
//
// LiveKit Cloud envía TODOS los eventos del proyecto (firmados con JWT) a la URL
// registrada — no hay filtro por tipo de evento del lado del proyecto, el filtro
// es nuestro. Procesamos:
//
//   - room_finished      → cierra consultas/turnos huérfanos en_curso → completada
//                          (comportamiento histórico, NO se toca su semántica).
//   - participant_joined → registra presencia + si había un corte pendiente
//                          (desconectado_at) lo limpia (reconexión estable).
//   - participant_left   → registra presencia + si el room quedó incompleto y NO
//                          es una finalización del médico, arranca el reloj de
//                          rejoin (desconectado_at = now()).
//
// Room naming convention: `${tipo}-${id}` (ej: "consulta-abc123", "turno-xyz").
//
// Protección anti-#169 (cierre cálido del paciente): cuando el médico finaliza,
// crear-sala DELETE borra el room → LiveKit emite participant_left de ambos Y
// room_finished, en orden no garantizado. NUNCA debemos arrancar el reloj de
// rejoin en una finalización legítima. Antes de setear desconectado_at en
// participant_left verificamos contra el server LiveKit que el room siga vivo y
// con participantes (listParticipants); si el room ya no existe o quedó vacío,
// es una finalización/cierre, no un corte → no arrancamos el reloj.
// ---------------------------------------------------------------------------

function getHttpUrl(): string {
  return LIVEKIT_URL.replace("wss://", "https://").replace("ws://", "http://");
}

function parseRol(identity: string): "medico" | "paciente" | "desconocido" {
  if (identity.startsWith("medico-")) return "medico";
  if (identity.startsWith("paciente-")) return "paciente";
  return "desconocido";
}

function parseRoom(
  roomName: string | undefined
): { tipo: "consulta" | "turno"; tabla: "consultas" | "turnos"; recursoId: string } | null {
  if (!roomName) return null;
  const match = roomName.match(/^(consulta|turno)-(.+)$/);
  if (!match) return null;
  const tipo = match[1] as "consulta" | "turno";
  return { tipo, tabla: tipo === "turno" ? "turnos" : "consultas", recursoId: match[2] };
}

export async function POST(req: NextRequest) {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return NextResponse.json({ error: "LiveKit no configurado" }, { status: 500 });
  }

  const body = await req.text();
  const authHeader = req.headers.get("authorization") || "";

  const receiver = new WebhookReceiver(LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  let event;
  try {
    event = await receiver.receive(body, authHeader);
  } catch {
    return NextResponse.json({ error: "Firma invalida" }, { status: 401 });
  }

  switch (event.event) {
    case "room_finished":
      return handleRoomFinished(event);
    case "participant_joined":
      return handleParticipantJoined(event);
    case "participant_left":
      return handleParticipantLeft(event);
    default:
      return NextResponse.json({ ok: true, ignored: event.event });
  }
}

// ---------------------------------------------------------------------------
// room_finished — comportamiento histórico (cerrar huérfana a completada).
// Semántica intacta. Solo se añade limpiar desconectado_at por prolijidad: si
// la consulta se cierra, no debe quedar un reloj de rejoin colgado.
// ---------------------------------------------------------------------------
async function handleRoomFinished(event: { room?: { name?: string } }) {
  const parsed = parseRoom(event.room?.name);
  if (!parsed) {
    return NextResponse.json({ ok: true, ignored: "room name no matchea patron" });
  }
  const { tipo, tabla, recursoId } = parsed;
  const supabase = createAdminClient();

  const { data: registro, error: errSelect } = await supabase
    .from(tabla)
    .select("id, estado")
    .eq("id", recursoId)
    .single();

  if (errSelect || !registro) {
    return NextResponse.json({
      ok: false,
      error: "Registro no encontrado",
      detail: errSelect?.message,
    });
  }

  if (registro.estado !== "en_curso") {
    // Aun si no está en_curso, limpiar un posible reloj colgado.
    await supabase.from(tabla).update({ desconectado_at: null }).eq("id", recursoId);
    return NextResponse.json({
      ok: true,
      action: "none",
      reason: `Estado actual: ${registro.estado}`,
    });
  }

  const estadoFinal = tipo === "turno" ? "completado" : "completada";
  const { error: errUpdate } = await supabase
    .from(tabla)
    .update({ estado: estadoFinal, desconectado_at: null })
    .eq("id", recursoId);

  if (errUpdate) {
    return NextResponse.json(
      { ok: false, error: "Error actualizando estado", detail: errUpdate.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, action: "cerrada", tipo, consultaId: recursoId });
}

// ---------------------------------------------------------------------------
// participant_joined — registra presencia. Si había un corte pendiente
// (desconectado_at != null) en el recurso, es una RECONEXIÓN → limpia el reloj.
// ---------------------------------------------------------------------------
async function handleParticipantJoined(event: {
  room?: { name?: string };
  participant?: { identity?: string };
}) {
  const parsed = parseRoom(event.room?.name);
  if (!parsed) return NextResponse.json({ ok: true, ignored: "room name no matchea patron" });

  const { tipo, tabla, recursoId } = parsed;
  const roomName = event.room!.name!;
  const identity = event.participant?.identity || "";
  const supabase = createAdminClient();

  await registrarPresencia(supabase, {
    roomName,
    tipo,
    recursoId,
    identity,
    evento: "joined",
    raw: event,
  });

  // ¿Había un corte pendiente? → reconexión estable, limpiar el reloj.
  // Solo limpiamos si sigue en_curso (no pisar estados terminales).
  const { data: registro } = await supabase
    .from(tabla)
    .select("estado, desconectado_at")
    .eq("id", recursoId)
    .single();

  if (registro?.estado === "en_curso" && registro.desconectado_at) {
    const { error } = await supabase
      .from(tabla)
      .update({ desconectado_at: null })
      .eq("id", recursoId)
      .eq("estado", "en_curso");
    if (error) {
      logError("[LK/WEBHOOK]", "Error limpiando desconectado_at en rejoin", {
        tabla,
        recursoId,
        error: error.message,
      });
    } else {
      logInfo("[LK/WEBHOOK]", "Rejoin: reloj limpiado (reconexión)", { tabla, recursoId, identity });
    }
    return NextResponse.json({ ok: true, action: "rejoin_reconectado", tipo, recursoId });
  }

  return NextResponse.json({ ok: true, action: "presencia_joined", tipo, recursoId });
}

// ---------------------------------------------------------------------------
// participant_left — registra presencia. Si el room quedó incompleto, la
// consulta sigue en_curso, y NO es una finalización del médico → arranca el
// reloj de rejoin (desconectado_at = now()).
//
// Determinación de "incompleto sin finalización": consultamos al server LiveKit
// (listParticipants). Esto es la fuente de verdad server-authoritative.
//   - Si listParticipants tira error porque el room ya no existe → el médico lo
//     borró al finalizar (o room_finished ya corrió) → NO arrancar reloj (#169).
//   - Si el room existe pero quedó vacío → idem, está por cerrarse → no arrancar.
//   - Si quedó 1 de 2 participantes → corte real → arrancar reloj.
// ---------------------------------------------------------------------------
async function handleParticipantLeft(event: {
  room?: { name?: string };
  participant?: { identity?: string };
}) {
  const parsed = parseRoom(event.room?.name);
  if (!parsed) return NextResponse.json({ ok: true, ignored: "room name no matchea patron" });

  const { tipo, tabla, recursoId } = parsed;
  const roomName = event.room!.name!;
  const identity = event.participant?.identity || "";
  const supabase = createAdminClient();

  await registrarPresencia(supabase, {
    roomName,
    tipo,
    recursoId,
    identity,
    evento: "left",
    raw: event,
  });

  // Solo nos importa arrancar el reloj si la consulta sigue en_curso y no hay un
  // reloj ya corriendo (idempotencia: no pisar desconectado_at existente).
  const { data: registro } = await supabase
    .from(tabla)
    .select("estado, desconectado_at")
    .eq("id", recursoId)
    .single();

  if (!registro || registro.estado !== "en_curso") {
    return NextResponse.json({ ok: true, action: "presencia_left", reason: "no en_curso" });
  }
  if (registro.desconectado_at) {
    // Ya hay un reloj corriendo, no lo reiniciamos (idempotente).
    return NextResponse.json({ ok: true, action: "presencia_left", reason: "reloj ya activo" });
  }

  // --- Protección anti-#169: ¿el room sigue vivo e incompleto, o es finalización? ---
  let arrancarReloj = false;
  try {
    const svc = new RoomServiceClient(getHttpUrl(), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    const participantes = await svc.listParticipants(roomName);
    // Room vivo: si quedó al menos 1 participante pero no los 2 esperados → corte real.
    // Si quedó vacío (0) → está por cerrarse (room_finished vendrá) → no arrancar.
    if (participantes.length >= 1 && participantes.length < 2) {
      arrancarReloj = true;
    }
  } catch {
    // listParticipants tira error si el room ya no existe → finalización del
    // médico (DELETE) o room ya cerrado → NO arrancar reloj. Protege #169.
    logInfo("[LK/WEBHOOK]", "participant_left: room inexistente (finalización), no arranca reloj", {
      tabla,
      recursoId,
    });
    arrancarReloj = false;
  }

  if (!arrancarReloj) {
    return NextResponse.json({ ok: true, action: "presencia_left", reason: "room cerrado o completo" });
  }

  const { error } = await supabase
    .from(tabla)
    .update({ desconectado_at: new Date().toISOString() })
    .eq("id", recursoId)
    .eq("estado", "en_curso")
    .is("desconectado_at", null);

  if (error) {
    logError("[LK/WEBHOOK]", "Error seteando desconectado_at", {
      tabla,
      recursoId,
      error: error.message,
    });
    return NextResponse.json(
      { ok: false, error: "Error arrancando reloj de rejoin", detail: error.message },
      { status: 500 }
    );
  }

  logWarn("[LK/WEBHOOK]", "Corte detectado: reloj de rejoin iniciado", { tabla, recursoId, identity });
  return NextResponse.json({ ok: true, action: "rejoin_iniciado", tipo, recursoId });
}

// ---------------------------------------------------------------------------
// Inserta una fila de presencia (append-only). Falla suave: la auditoría no debe
// romper el handling del evento.
// ---------------------------------------------------------------------------
async function registrarPresencia(
  supabase: ReturnType<typeof createAdminClient>,
  args: {
    roomName: string;
    tipo: "consulta" | "turno";
    recursoId: string;
    identity: string;
    evento: "joined" | "left";
    raw: unknown;
  }
) {
  const { error } = await supabase.from("video_presencia").insert({
    room_name: args.roomName,
    tipo: args.tipo,
    recurso_id: args.recursoId,
    rol: parseRol(args.identity),
    identity: args.identity,
    evento: args.evento,
    raw: args.raw as Record<string, unknown>,
  });
  if (error) {
    logError("[LK/WEBHOOK]", "Error insertando video_presencia", {
      recursoId: args.recursoId,
      evento: args.evento,
      error: error.message,
    });
  }
}
