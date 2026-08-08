// POST /api/medico/documentos-pendientes
//
// Avisa al médico, de forma PERSISTENTE, que una atención suya se cerró sin que
// la documentación llegara al paciente.
//
// POR QUÉ EXISTE
// Al finalizar una consulta el médico es redirigido al dashboard y el guardado
// de documentos corre después, en segundo plano. Si ese guardado falla no hay
// pantalla donde mostrarle el error: hasta hoy el trabajo se perdía en silencio
// y nadie se enteraba (un caso de junio apareció recién en la auditoría de
// agosto; otro de agosto lo reclamó el paciente cinco días después).
//
// Este endpoint escribe una fila en `notificaciones_medico` — el canal que ya
// alimenta la campanita del dashboard. No inventa tabla ni canal nuevo.
//
// REGLA: este endpoint NUNCA bloquea ni revierte nada. Es un aviso. Si falla,
// el médico igual ve el cartel local del dashboard (lib/documentacion-pendiente).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Motivo = "documentos" | "cierre";

type Body = {
  consultaId?: string;
  tipo?: "consulta" | "turno";
  motivo?: Motivo;
};

/** Consulta inmediata: `en_curso_at`/`created_at` son timestamptz → hora argentina. */
function momentoConsulta(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const tz: Intl.DateTimeFormatOptions = { timeZone: "America/Argentina/Buenos_Aires" };
  const hora = d.toLocaleTimeString("es-AR", { ...tz, hour: "2-digit", minute: "2-digit" });
  const fecha = d.toLocaleDateString("es-AR", { ...tz, day: "2-digit", month: "2-digit" });
  return `${hora} del ${fecha}`;
}

/**
 * Turno: `fecha` es date y `hora_inicio` es time — ya están en hora local
 * argentina. Se arman a mano a propósito: pasarlos por `new Date()` los
 * interpretaría como UTC y correría la hora.
 */
function momentoTurno(fecha: string | null, horaInicio: string | null): string {
  if (!fecha || !horaInicio) return "";
  const [anio, mes, dia] = fecha.split("-");
  if (!anio || !mes || !dia) return "";
  return `${horaInicio.slice(0, 5)} del ${dia}/${mes}`;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Body inválido" }, { status: 400 });
  }

  const id = body.consultaId;
  const tipo = body.tipo === "turno" ? "turno" : "consulta";
  const motivo: Motivo = body.motivo === "cierre" ? "cierre" : "documentos";

  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Atención inválida" }, { status: 400 });
  }

  // Solo columnas con GRANT para authenticated (ver regla de grants en CLAUDE.md).
  const { data: medico } = await supabase
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!medico) return NextResponse.json({ ok: false, error: "No es médico" }, { status: 403 });

  // La atención tiene que ser de este médico: nadie se avisa a sí mismo sobre
  // una consulta ajena.
  const admin = createAdminClient();
  let medicoDelRegistro: string | null = null;
  let momento = "";

  if (tipo === "turno") {
    const { data } = await admin
      .from("turnos")
      .select("medico_id, fecha, hora_inicio")
      .eq("id", id)
      .maybeSingle();
    medicoDelRegistro = data?.medico_id ?? null;
    momento = momentoTurno(data?.fecha ?? null, data?.hora_inicio ?? null);
  } else {
    const { data } = await admin
      .from("consultas")
      .select("medico_id, en_curso_at, created_at")
      .eq("id", id)
      .maybeSingle();
    medicoDelRegistro = data?.medico_id ?? null;
    momento = momentoConsulta(data?.en_curso_at ?? data?.created_at ?? null);
  }

  if (!medicoDelRegistro || medicoDelRegistro !== medico.id) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 403 });
  }

  const referencia = momento ? `de las ${momento}` : "reciente";
  const dondeVolver =
    tipo === "turno" ? "Volvé a entrar a ese turno" : "Volvé a entrar a esa consulta";

  const titulo = "Quedó documentación sin entregar";
  const mensaje =
    motivo === "cierre"
      ? `Los documentos de tu consulta ${referencia} sí llegaron al paciente, pero no se pudo guardar la evolución.\n\nLo que escribiste está guardado. ${dondeVolver} y tocá "Finalizar consulta" para completarla.`
      : `Tu consulta ${referencia} se cerró sin que los documentos llegaran al paciente.\n\nLo que escribiste NO se perdió: quedó guardado. ${dondeVolver} y tocá "Finalizar consulta" para enviarlos.`;

  // Anti-duplicado: un reintento no debe llenarle la campanita de carteles
  // iguales. El par (título, mensaje) ya incluye la hora de la atención, así que
  // alcanza como clave natural mientras el aviso siga sin leer.
  const { data: yaAvisado } = await admin
    .from("notificaciones_medico")
    .select("id")
    .eq("medico_id", medico.id)
    .eq("titulo", titulo)
    .eq("mensaje", mensaje)
    .eq("leida", false)
    .limit(1);

  if (yaAvisado && yaAvisado.length > 0) {
    return NextResponse.json({ ok: true, duplicado: true });
  }

  const { error } = await admin.from("notificaciones_medico").insert({
    medico_id: medico.id,
    titulo,
    mensaje,
    // `enviada_por` queda null a propósito: no la mandó un admin, la generó el
    // sistema al detectar que la entrega no se completó.
  });

  if (error) {
    console.error("[documentacion-pendiente] no se pudo avisar al médico:", error.message);
    return NextResponse.json({ ok: false, error: "No se pudo registrar el aviso" });
  }

  // Log de servidor para que la falla también sea visible desde operaciones y no
  // dependa de que el médico mire la campanita.
  console.error(
    `[documentacion-pendiente] ${tipo} ${id} sin entregar (motivo=${motivo}) — médico avisado`
  );

  return NextResponse.json({ ok: true });
}
