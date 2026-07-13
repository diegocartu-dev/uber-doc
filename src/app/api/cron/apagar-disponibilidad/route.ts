import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushAlMedico } from "@/lib/push";
import { withCron } from "@/lib/cron-guard";

/**
 * Cron cada 30 min (decisión Diego 24/06/2026): apaga la disponibilidad de
 * Consulta Inmediata de cualquier médico que lleve más de 4 horas ENCENDIDO de
 * forma continua. Motivo: el toggle `disponible` no caduca solo — un médico que
 * lo deja prendido y se va aparece "disponible ahora" en la cartilla del paciente
 * sin estar realmente frente a la pantalla (riesgo de no-show). Caso real: Carina
 * lo dejó prendido 6 días (18/06 → 24/06).
 *
 * Fuente de verdad de "hace cuánto está encendido": `disponible_desde_at`, que se
 * setea en la transición real false→true y se limpia al apagar (ver
 * src/app/dashboard/actions.ts). Un médico con disponible=true pero
 * disponible_desde_at=null no tiene ancla de tiempo → se reporta pero NO se apaga.
 *
 * Guardas:
 * - NO toca cuentas de test (es_cuenta_test) — quedan disponibles para E2E.
 * - NO apaga a un médico con una consulta ACTIVA (esperando/aceptada/en_curso):
 *   no cortamos a alguien en medio de una atención.
 *
 * Al apagar: limpia el flag + timestamp, registra la transición offline en
 * `disponibilidad_log` (consistente con el toggle manual) y avisa al médico
 * (push + mensaje interno) para que se reactive si sigue atendiendo.
 */

const HORAS_MAX_ENCENDIDO = 4;
const CONSULTA_ACTIVA = ["esperando", "aceptada", "en_curso"];

async function handler(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - HORAS_MAX_ENCENDIDO * 60 * 60 * 1000).toISOString();

  // Médicos reales encendidos hace más de 4h (con ancla de tiempo conocida).
  const { data: stale, error } = await admin
    .from("medicos")
    .select("id, nombre_completo, disponible_desde_at")
    .eq("disponible", true)
    .not("es_cuenta_test", "is", true)
    .not("disponible_desde_at", "is", null)
    .lt("disponible_desde_at", cutoff);

  if (error) {
    console.error("[cron/apagar-disponibilidad] Error leyendo médicos:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  // Médicos disponibles sin ancla de tiempo: estado inconsistente, lo reportamos
  // para visibilidad pero no lo apagamos (no sabemos hace cuánto está encendido).
  const { count: sinAncla } = await admin
    .from("medicos")
    .select("id", { count: "exact", head: true })
    .eq("disponible", true)
    .not("es_cuenta_test", "is", true)
    .is("disponible_desde_at", null);

  if (sinAncla && sinAncla > 0) {
    console.warn(`[cron/apagar-disponibilidad] ${sinAncla} médico(s) disponible(s) sin disponible_desde_at — estado inconsistente, no se apagan.`);
  }

  if (!stale || stale.length === 0) {
    return NextResponse.json({ ok: true, apagados: 0, sinAncla: sinAncla ?? 0 });
  }

  // Excluir a los que tienen una consulta activa AHORA (no cortar una atención).
  const ids = stale.map((m) => m.id);
  const { data: activas } = await admin
    .from("consultas")
    .select("medico_id")
    .in("medico_id", ids)
    .in("estado", CONSULTA_ACTIVA);
  const conConsultaActiva = new Set((activas ?? []).map((c) => c.medico_id));

  const aApagar = stale.filter((m) => !conConsultaActiva.has(m.id));

  let apagados = 0;
  for (const m of aApagar) {
    // UPDATE condicionado al estado que leímos: si el médico se re-activó (o ya se
    // apagó) entre el SELECT y este UPDATE, no lo pisamos. Idempotente.
    const { error: errUpd } = await admin
      .from("medicos")
      .update({ disponible: false, disponible_desde_at: null })
      .eq("id", m.id)
      .eq("disponible", true)
      .not("disponible_desde_at", "is", null);
    if (errUpd) {
      console.error(`[cron/apagar-disponibilidad] Error apagando ${m.id}:`, errUpd.message);
      continue;
    }

    // Registrar la transición offline (consistente con el toggle manual).
    await admin.from("disponibilidad_log").insert({ medico_id: m.id, online: false });

    const horas = Math.floor(
      (Date.now() - new Date(m.disponible_desde_at as string).getTime()) / (60 * 60 * 1000)
    );
    const primerNombre = m.nombre_completo.split(" ")[0];

    // Mensaje interno persistente (lo ve aunque no tenga push).
    await admin.from("mensajes_internos_medicos").insert({
      medico_id: m.id,
      titulo: "Te desactivamos de Consulta Inmediata",
      cuerpo: `Hola ${primerNombre}. Estuviste ${horas}h marcado como disponible para Consulta Inmediata, así que te desactivamos automáticamente. Si seguís atendiendo, volvé a activarte desde tu panel para que los pacientes te puedan elegir.`,
      severidad: "media",
    });

    // Push best-effort.
    void pushAlMedico(m.id, {
      title: "Docto — te desactivamos de Consulta Inmediata",
      body: "Estuviste 4h disponible. Si seguís atendiendo, reactivate desde tu panel.",
      url: "/dashboard",
      tag: `auto-apagado-${m.id}`,
    }).catch(() => {});

    apagados++;
  }

  return NextResponse.json({
    ok: true,
    apagados,
    omitidosPorConsultaActiva: stale.length - aApagar.length,
    sinAncla: sinAncla ?? 0,
  });
}

export const GET = withCron("apagar-disponibilidad", handler);
