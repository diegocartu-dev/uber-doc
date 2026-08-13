// POST /api/otorgador/reprogramar-masivo — las DOS FASES de la reprogramación
// de un día de un profesional (spec institucional §4.3/§4.6).
//
//   · `{ medico_id, fecha, dry_run: true }` → EL PLAN. No toca nada.
//   · `{ items: [{turno_id, turno_nuevo_id}] }` → EJECUTA, uno por uno.
//
// Nova es un caller más de este endpoint, igual que la pantalla del otorgador y
// que un operador IA con API key: misma priorización, misma auditoría, mismos
// avisos. No hay un camino especial para ninguno de los tres.
//
// ── POR QUÉ LA EJECUCIÓN ES POR ÍTEM Y NO UNA TRANSACCIÓN ────────────────────
// Porque cada turno se mueve con un lock optimista contra `estado='disponible'`
// (reprogramar.ts) y cada uno dispara sus propios avisos por WhatsApp o mail.
// Un rollback no podría "des-enviar" un WhatsApp ya entregado, así que la
// atomicidad sería falsa. Lo que sí se garantiza es que cada ítem se informa
// por separado, con su resultado y su error: si el tercero perdió la carrera
// contra otro operador, los dos primeros están hechos, avisados, y se dice.
//
// El orden de los ítems se respeta tal como vinieron (la pantalla los manda en
// orden de horario) y la corrida NO se corta ante un fallo individual.
//
// SOLO instancia institucional; operador por sesión o API key.

import { NextRequest, NextResponse } from "next/server";
import { identificarOperador } from "@/lib/otorgador/auth";
import { planReprogramacionMasiva, type ErrorPlan } from "@/lib/otorgador/reprogramar-masivo";
import { reprogramarTurnoInstitucional } from "@/lib/otorgador/reprogramar";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STATUS_PLAN: Record<ErrorPlan, number> = {
  validacion: 422,
  no_encontrado: 404,
  sin_turnos: 409,
  interno: 500,
};

/** Tope de ítems por request: una agenda de un día no tiene 200 turnos. */
const MAX_ITEMS = 40;

export async function POST(req: NextRequest) {
  const identidad = await identificarOperador(req);
  if (!identidad) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: {
    medico_id?: string;
    fecha?: string;
    dry_run?: boolean;
    motivo?: string;
    items?: { turno_id?: string; turno_nuevo_id?: string }[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  // ── FASE 1: el plan ────────────────────────────────────────────────────────
  if (body.dry_run) {
    if (!body.medico_id || !body.fecha) {
      return NextResponse.json({ error: "Faltan medico_id y/o fecha." }, { status: 422 });
    }
    const res = await planReprogramacionMasiva({ medicoId: body.medico_id, fecha: body.fecha });
    if (!res.ok) {
      return NextResponse.json(
        { error: res.error, codigo: res.codigo },
        { status: STATUS_PLAN[res.codigo] }
      );
    }
    return NextResponse.json({ ok: true, dry_run: true, plan: res.plan });
  }

  // ── FASE 2: la ejecución ───────────────────────────────────────────────────
  const items = body.items ?? [];
  if (items.length === 0) {
    return NextResponse.json(
      { error: "Sin ítems para reprogramar (¿faltó `dry_run: true`?)." },
      { status: 422 }
    );
  }
  if (items.length > MAX_ITEMS) {
    return NextResponse.json({ error: `Máximo ${MAX_ITEMS} turnos por pedido.` }, { status: 422 });
  }
  if (items.some((i) => !i.turno_id || !i.turno_nuevo_id)) {
    return NextResponse.json(
      { error: "Cada ítem necesita turno_id y turno_nuevo_id." },
      { status: 422 }
    );
  }

  const resultados = [];
  for (const item of items) {
    const res = await reprogramarTurnoInstitucional({
      turnoAnteriorId: item.turno_id as string,
      turnoNuevoId: item.turno_nuevo_id as string,
      operadorId: identidad.operador.id,
      via: identidad.via,
      motivo: body.motivo,
    });
    resultados.push(
      res.ok
        ? {
            turno_id: item.turno_id,
            ok: true as const,
            turno_nuevo: res.turnoNuevo,
            // El checklist de avisos en vivo del panel se pinta con ESTO: el
            // resultado real de cada envío, el mismo que quedó registrado en
            // `asignaciones.detalle`. No es una animación.
            avisos: res.avisos,
          }
        : { turno_id: item.turno_id, ok: false as const, codigo: res.codigo, error: res.error }
    );
  }

  const hechos = resultados.filter((r) => r.ok).length;
  return NextResponse.json({
    ok: hechos > 0,
    reprogramados: hechos,
    fallados: resultados.length - hechos,
    resultados,
  });
}
