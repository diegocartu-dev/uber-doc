import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AccessToken } from "livekit-server-sdk";

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "";

// ---------------------------------------------------------------------------
// POST — Generar token fresco para entrar a una sala existente
// Lo usa el paciente (y el medico si reconecta)
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

  // Verificar que existe y obtener participantes
  const { data: consulta } = await supabase
    .from(tabla)
    .select("id, estado, paciente_id, medico_id")
    .eq("id", consultaId)
    .single();

  if (!consulta) return NextResponse.json({ error: "No encontrado." }, { status: 404 });

  // --- Gate de estado (Fase 1, defensa en profundidad) — WHITELIST ---
  // Emitimos token SOLO si el estado es "conectable". Whitelist (no blacklist):
  // cualquier estado no listado (incl. terminales actuales y futuros de Fase 2)
  // recibe 409 sin que tengamos que enumerarlos uno por uno. Más robusto.
  //
  // Estados conectables según el ENUM real de cada tabla:
  //   - consultas: en_curso (incluye la ventana de rejoin), pagada
  //   - turnos:    en_curso, confirmado, en_espera, pagada
  // Coherente con #169: si el médico ya cerró (completada/completado), un 409 al
  // reintentar token es correcto — el paciente ya está en su pantalla de cierre.
  const ESTADOS_CONECTABLES = tipo === "turno"
    ? ["en_curso", "confirmado", "en_espera", "pagada"]
    : ["en_curso", "pagada"];
  if (!ESTADOS_CONECTABLES.includes(consulta.estado)) {
    return NextResponse.json({ error: "Esta consulta ya finalizó." }, { status: 409 });
  }

  // Determinar si es paciente o medico
  let esPaciente = false;
  let esMedico = false;
  let identity = "";
  let displayName = "Participante";

  // Consultas inmediatas: paciente_id es auth.users.id
  if (tipo === "consulta" && consulta.paciente_id === user.id) {
    esPaciente = true;
    identity = `paciente-${user.id}`;
    displayName = "Paciente";
  }

  // Turnos: paciente_id es pacientes.id
  if (tipo === "turno") {
    const { data: paciente } = await supabase
      .from("pacientes")
      .select("id, nombre_completo")
      .eq("user_id", user.id)
      .maybeSingle();
    if (paciente?.id === consulta.paciente_id) {
      esPaciente = true;
      identity = `paciente-${user.id}`;
      displayName = paciente?.nombre_completo || "Paciente";
    }
  }

  // Medico
  const { data: medico } = await supabase
    .from("medicos")
    .select("id, nombre_completo")
    .eq("user_id", user.id)
    .maybeSingle();

  if (medico?.id === consulta.medico_id) {
    esMedico = true;
    identity = `medico-${medico!.id}`;
    displayName = medico!.nombre_completo || "Medico";
  }

  if (!esPaciente && !esMedico) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  try {
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      name: displayName,
      ttl: "2h",
    });
    at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
    const token = await at.toJwt();

    return NextResponse.json({ token, roomName });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al generar token";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
