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
// rejoin en una finalización legítima.
//
// IMPORTANTE: listParticipants NO es fuente de verdad confiable para distinguir
// finalización de corte. LiveKit devuelve 200 + [] (no tira error) si el room ya
// fue borrado, y durante el DELETE puede devolver length===1 (un participante
// todavía adentro) → contar cabezas sola arranca el reloj sobre una consulta YA
// finalizada → desconectado_at huérfano. Por eso el gate real es doble:
//   (a) releer `estado` en DB y exigir que siga `en_curso` (no terminal), y
//   (b) mirar QUIÉN se fue por rol: si el que se va es el médico y no queda otro
//       médico presente, es patrón de finalización → NO arrancamos el reloj.
// listParticipants se usa solo como señal complementaria de "queda alguien".
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
    .update({ estado: estadoFinal, desconectado_at: null, completada_at: new Date().toISOString(), cierre_origen: "webhook_video" })
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
// participant_left — registra presencia. Arranca el reloj de rejoin
// (desconectado_at = now()) SOLO si es un corte real, no una finalización.
//
// Gate (orden importa — del más barato/autoritativo al complementario):
//   1. La consulta debe seguir `en_curso` en DB (re-leída acá). Si ya es terminal
//      (completada/cancelada/etc.) → finalización/cierre ya ocurrió → NO arrancar.
//   2. Idempotencia: si ya hay desconectado_at → no reiniciar el reloj.
//   3. Rol del que se fue: si se fue el MÉDICO y no queda médico presente, es el
//      patrón de finalización (#169) → NO arrancar. listParticipants puede mentir
//      durante el DELETE (devuelve [] o length===1 sin tirar error), así que el
//      rol es lo que decide, no el conteo de cabezas.
//   4. listParticipants como señal complementaria: si quedó 0 participantes el
//      room está vacío/cerrándose → NO arrancar.
//   → Solo si se fue alguien y queda contraparte viva con la consulta en_curso,
//     es un corte real → arrancar reloj.
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

  // (1) Gate de estado: re-leído de DB. Si ya es terminal, la finalización/cierre
  // ya ocurrió → NO arrancar reloj (protege #169 frente a participant_left tardío
  // del médico que llega cuando la consulta ya está completada).
  if (!registro || registro.estado !== "en_curso") {
    return NextResponse.json({ ok: true, action: "presencia_left", reason: "no en_curso" });
  }
  // (2) Idempotencia: ya hay un reloj corriendo, no lo reiniciamos.
  if (registro.desconectado_at) {
    return NextResponse.json({ ok: true, action: "presencia_left", reason: "reloj ya activo" });
  }

  // (3) Rol del que se fue + quién queda. Consultamos al server LiveKit, pero NO
  // confiamos en el conteo de cabezas para distinguir finalización: usamos el ROL.
  const rolQueSeFue = parseRol(identity);
  let participantes: { identity: string }[] = [];
  try {
    const svc = new RoomServiceClient(getHttpUrl(), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    participantes = await svc.listParticipants(roomName);
  } catch {
    // listParticipants tira error solo si el room ya no existe → finalización /
    // room cerrado → NO arrancar reloj. Protege #169.
    logInfo("[LK/WEBHOOK]", "participant_left: room inexistente (finalización), no arranca reloj", {
      tabla,
      recursoId,
    });
    return NextResponse.json({ ok: true, action: "presencia_left", reason: "room inexistente" });
  }

  // (4) Room vacío (0 participantes) → está cerrándose (room_finished vendrá) → no arrancar.
  if (participantes.length === 0) {
    return NextResponse.json({ ok: true, action: "presencia_left", reason: "room vacio" });
  }

  const quedaMedico = participantes.some((p) => parseRol(p.identity) === "medico");

  // Patrón de finalización (#169): se fue el médico y NO queda ningún médico
  // presente. Aunque listParticipants devuelva length===1 (el paciente todavía
  // adentro durante el DELETE), esto NO es un corte → NO arrancar el reloj.
  if (rolQueSeFue === "medico" && !quedaMedico) {
    logInfo("[LK/WEBHOOK]", "participant_left: se fue el médico sin médico presente (finalización), no arranca reloj", {
      tabla,
      recursoId,
      identity,
    });
    return NextResponse.json({ ok: true, action: "presencia_left", reason: "finalizacion medico" });
  }

  // Corte real: la consulta sigue en_curso, queda al menos una contraparte viva, y
  // no es el patrón de finalización del médico → arrancar reloj de rejoin.

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
