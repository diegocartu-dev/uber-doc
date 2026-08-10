import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withCron } from "@/lib/cron-guard";
import {
  PLAZO_CI_MIN,
  medicosOcupados,
  momentoDePago,
  resolverConsultaVencida,
} from "@/lib/consultas/resolver-vencidas";

/**
 * Plazo de la consulta inmediata — 30 minutos (decisión Diego, 09/08/2026).
 *
 * Espejo de `resolver-turnos-vencidos`, que existe desde el 08/07. La CI no
 * tenía plazo NINGUNO: una consulta pagada que nadie tomaba se quedaba ahí
 * hasta el cron de las 3 AM, y con la regla del Uber eso dejaba al paciente sin
 * poder consultar con otro hasta la madrugada.
 *
 * A los 30 minutos del PAGO, con el profesional libre:
 *   · el profesional no entró  → medico_ausente + reintegro del 100%
 *   · el paciente nunca entró  → no_show_paciente, sin reintegro
 *
 * Si el profesional está atendiendo a otro paciente NO se resuelve nada: está
 * trabajando, no ausente. La consulta espera a la próxima corrida.
 *
 * La lógica vive en `@/lib/consultas/resolver-vencidas` para poder testearla
 * sin levantar el cron.
 */

export const maxDuration = 60;

// Techo por corrida: cada resolución puede disparar un refund contra MP, que es
// lo lento. Lo que no entre lo levanta la corrida de 10 minutos después.
const MAX_POR_CORRIDA = 20;

async function handler() {
  const admin = createAdminClient();
  const nowMs = Date.now();
  const plazoMs = PLAZO_CI_MIN * 60 * 1000;

  const { data: pagadas } = await admin
    .from("consultas")
    .select(
      "id, medico_id, paciente_id, pago_id, mp_net_amount_medico, mp_application_fee, mp_payment_created_at, aceptada_at, created_at"
    )
    .eq("estado", "pagada")
    .order("created_at", { ascending: true })
    .limit(200);

  const vencidas = (pagadas ?? []).filter((c) => {
    const pago = momentoDePago(c);
    return !Number.isNaN(pago) && nowMs >= pago + plazoMs;
  });

  const ocupados = await medicosOcupados([
    ...new Set(vencidas.map((c) => c.medico_id).filter(Boolean)),
  ]);

  let medicoAusente = 0;
  let pacienteAusente = 0;
  let conMedicoOcupado = 0;
  let carrerasPerdidas = 0;

  for (const c of vencidas.slice(0, MAX_POR_CORRIDA)) {
    const r = await resolverConsultaVencida(c, ocupados);
    if (!r.resuelta) {
      if (r.motivo === "medico_ocupado") conMedicoOcupado++;
      else carrerasPerdidas++;
      continue;
    }
    if (r.desenlace === "medico_ausente") medicoAusente++;
    else pacienteAusente++;
  }

  const resumen = {
    ok: true,
    candidatas: vencidas.length,
    medico_ausente: medicoAusente,
    paciente_ausente: pacienteAusente,
    con_medico_ocupado: conMedicoOcupado,
    carreras_perdidas: carrerasPerdidas,
  };

  if (medicoAusente || pacienteAusente || conMedicoOcupado) {
    console.log("[cron/consultas-vencidas]", JSON.stringify(resumen));
  }
  return NextResponse.json(resumen);
}

export const GET = withCron("resolver-consultas-vencidas", handler);
