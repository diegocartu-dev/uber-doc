// POST /api/panel/nova — la voz de Nova: interpreta el pedido en castellano y,
// si lo entendió, devuelve LA PROPUESTA (spec institucional §4.6, 03-spec §5).
//
// Este endpoint NO ejecuta nada. La ejecución la dispara el operador desde la
// tarjeta, contra `/api/otorgador/reprogramar-masivo`. La separación es la que
// sostiene la frase que Nova le dice al operador: *"todavía no cambié nada"*.
//
// Guard `admin_institucion`: Nova vive adentro del panel de la institución. Un
// otorgador reprograma desde su turnero, con la misma API por abajo.
//
// SOLO instancia institucional: en B2C es 404.

import { NextResponse } from "next/server";
import { notFound } from "next/navigation";
import { esInstitucional } from "@/lib/instancia";
import { requireAdminInstitucion } from "@/lib/auth/rol-institucional";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConfigInstitucion } from "@/lib/institucional/config";
import { fechaAR } from "@/lib/insights/fechas";
import {
  interpretarPedido,
  textoPropuesta,
  type ProfesionalConocido,
} from "@/lib/otorgador/nova";
import { planReprogramacionMasiva, etiquetaLarga } from "@/lib/otorgador/reprogramar-masivo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Lo único que Nova sabe hacer en V1, dicho sin vueltas. */
const NO_SE_HACERLO =
  "Por ahora sé hacer una sola cosa: reprogramar el día de un profesional que no puede atender. " +
  "Escribime algo como “el Dr. Pérez no puede atender el martes 20” y te preparo la propuesta.";

export async function POST(req: Request) {
  if (!esInstitucional()) notFound();

  const sesion = await requireAdminInstitucion();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  let body: { mensaje?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }
  const mensaje = (body.mensaje ?? "").trim();
  if (!mensaje) return NextResponse.json({ error: "Mensaje vacío." }, { status: 422 });
  if (mensaje.length > 500) {
    return NextResponse.json({ error: "El mensaje es demasiado largo." }, { status: 422 });
  }

  // El padrón que Nova conoce: los profesionales del piloto. Nombre y
  // especialidad y nada más — acá no se leen columnas con grant restringido.
  const config = await getConfigInstitucion();
  const admin = createAdminClient();
  const { data: medicos, error } = await admin
    .from("medicos")
    .select("id, nombre_completo, titulo, especialidad")
    .eq("estado_registro", "aprobado")
    .in("especialidad", config.especialidades);
  if (error) {
    console.error("[panel/nova] No se pudo leer el padrón:", error.message);
    return NextResponse.json(
      { ok: false, texto: "No pude leer la agenda en este momento. Probá de nuevo en un minuto." },
      { status: 500 }
    );
  }

  const padron: ProfesionalConocido[] = (medicos ?? []).map((m) => ({
    id: m.id as string,
    nombre: `${((m.titulo as string | null) ?? "").trim()} ${((m.nombre_completo as string | null) ?? "").trim()}`.trim(),
    especialidad: (m.especialidad as string | null) ?? "",
  }));

  const pedido = interpretarPedido(mensaje, padron, fechaAR());

  if (pedido.tipo === "no_entiendo") {
    return NextResponse.json({ ok: false, texto: NO_SE_HACERLO });
  }
  if (pedido.tipo === "falta_profesional") {
    return NextResponse.json({
      ok: false,
      texto: "¿De qué profesional hablamos? Decime el apellido y el día que no puede atender.",
    });
  }
  if (pedido.tipo === "ambiguo") {
    const nombres = pedido.candidatos.map((c) => `${c.nombre} (${c.especialidad})`).join(" · ");
    return NextResponse.json({
      ok: false,
      texto: `Tengo más de un profesional que coincide: ${nombres}. ¿Cuál de los dos?`,
    });
  }
  if (pedido.tipo === "falta_fecha") {
    return NextResponse.json({
      ok: false,
      texto: `¿Qué día no puede atender ${pedido.medicoNombre}? Podés decirme “el martes 20” o “20/10”.`,
    });
  }

  const res = await planReprogramacionMasiva({ medicoId: pedido.medicoId, fecha: pedido.fecha });
  if (!res.ok) {
    // "No tiene turnos ese día" no es un error del sistema: es una respuesta.
    const texto =
      res.codigo === "sin_turnos"
        ? `${pedido.medicoNombre} no tiene turnos asignados el ${etiquetaLarga(pedido.fecha).toLowerCase()}. No hay nada que reprogramar.`
        : res.error;
    return NextResponse.json({ ok: false, texto });
  }

  return NextResponse.json({
    ok: true,
    texto: textoPropuesta({
      medicoNombre: res.plan.medico.nombre,
      turnos: res.plan.items.length,
      fechaCorta: `${res.plan.fecha_label.toLowerCase()}`,
      especialidad: res.plan.medico.especialidad,
    }),
    plan: res.plan,
  });
}
