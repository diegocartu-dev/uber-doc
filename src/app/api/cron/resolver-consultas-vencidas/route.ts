import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withCron } from "@/lib/cron-guard";
import {
  ESTADOS_RESOLUBLES,
  PLAZO_CI_MIN,
  medicosOcupados,
  momentoDePago,
  momentoDeAsignacion,
  resolverConsultaVencida,
} from "@/lib/consultas/resolver-vencidas";
import { esInstitucional } from "@/lib/instancia";
import { resolverSolicitudesSinRespuesta } from "@/lib/consultas/sin-respuesta";

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

  // CANDIDATAS: pagadas de verdad, en las que el profesional NUNCA abrió la sala.
  //
  // NO se filtra por `estado = 'pagada'`. Un pago REAL de CI salta de `aceptada`
  // directo a `en_curso` (lo escribe el webhook de MP al acreditar, antes de que
  // el profesional toque nada); `pagada` solo la escribe la simulación de las
  // cuentas de test. Filtrar por `pagada` era filtrar por el estado que la plata
  // real NUNCA alcanza: este cron no se ejecutaba sobre una sola consulta de
  // verdad, mientras la regla del Uber sí retenía al paciente.
  //
  // `sala_video_url IS NULL` es la señal de que el profesional no entró: esa
  // columna solo la escriben el workspace y /api/livekit/crear-sala, y las dos
  // exigen que actúe él.
  // ── MODO INSTITUCIONAL (spec institucional §6.3, gate #401) ────────────────
  // Acá no existe Mercado Pago: la CI la asigna un operador y nace 'pagada'
  // (compromiso institucional — decisión §4.5) SIN mp_status. Filtrar por
  // `mp_status='approved'` dejaría el cron ciego para SIEMPRE (el mismo modo de
  // falla que el filtro por 'pagada' tuvo en B2C — ver el comentario de abajo).
  // Candidatas institucionales: ESTADOS_RESOLUBLES ('pagada' es el estado
  // normal de la CI asignada; 'en_curso' con sala null cubre cualquier flip
  // espurio — hallazgo revisión Etapa 2: filtrar SOLO por 'pagada' dejaba
  // invisible para siempre una CI que otro proceso hubiera movido de estado
  // sin que el profesional abriera la sala) + sala nunca abierta, ancladas
  // en `asignada_at` (+30 min). La columna `asignada_at` SOLO existe en la DB
  // de la instancia (migración institucional 003): jamás sumarla a la query B2C
  // — PostgREST fallaría la query entera.
  let vencidas: {
    id: string;
    estado: string;
    medico_id: string;
    paciente_id: string;
    pago_id: string | null;
    mp_net_amount_medico: number | null;
    mp_application_fee: number | null;
  }[] = [];

  if (esInstitucional()) {
    const { data: asignadas } = await admin
      .from("consultas")
      .select(
        "id, estado, medico_id, paciente_id, pago_id, mp_net_amount_medico, mp_application_fee, asignada_at, created_at"
      )
      .in("estado", ESTADOS_RESOLUBLES)
      .is("sala_video_url", null)
      .order("created_at", { ascending: true })
      .limit(200);

    vencidas = (asignadas ?? []).filter((c) => {
      const ancla = momentoDeAsignacion(c);
      return !Number.isNaN(ancla) && nowMs >= ancla + plazoMs;
    });
  } else {
    const { data: pagadas } = await admin
      .from("consultas")
      .select(
        "id, estado, medico_id, paciente_id, pago_id, mp_net_amount_medico, mp_application_fee, mp_payment_created_at, aceptada_at, created_at"
      )
      .eq("mp_status", "approved")
      .in("estado", ESTADOS_RESOLUBLES)
      .is("sala_video_url", null)
      .order("created_at", { ascending: true })
      .limit(200);

    vencidas = (pagadas ?? []).filter((c) => {
      const pago = momentoDePago(c);
      return !Number.isNaN(pago) && nowMs >= pago + plazoMs;
    });
  }

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

  // ── SEGUNDA FASE: las solicitudes que nadie aceptó ────────────────────────
  // Va acá y no en un cron nuevo porque es el mismo trabajo —liberar al paciente
  // de una atención que no va a ocurrir— y comparte el criterio de "el
  // profesional ocupado no está ausente". Solo B2C: en institucional la CI la
  // asigna un operador y nace 'pagada', así que nunca hay un 'esperando' sin
  // aceptar. Aislado en su propio try: si falla, no se lleva puesta la fase de
  // arriba, que es la que mueve plata.
  let sinRespuesta = {
    liberadas: 0,
    omitidasPorProfesionalOcupado: 0,
    carrerasPerdidas: 0,
    desactivados: 0,
  };
  if (!esInstitucional()) {
    try {
      sinRespuesta = await resolverSolicitudesSinRespuesta();
    } catch (err) {
      console.error("[cron/consultas-vencidas] fase sin-respuesta falló:", err);
    }
  }

  const resumen = {
    ok: true,
    candidatas: vencidas.length,
    medico_ausente: medicoAusente,
    paciente_ausente: pacienteAusente,
    con_medico_ocupado: conMedicoOcupado,
    carreras_perdidas: carrerasPerdidas,
    sin_respuesta_liberadas: sinRespuesta.liberadas,
    sin_respuesta_profesional_ocupado: sinRespuesta.omitidasPorProfesionalOcupado,
  };

  if (medicoAusente || pacienteAusente || conMedicoOcupado || sinRespuesta.liberadas) {
    console.log("[cron/consultas-vencidas]", JSON.stringify(resumen));
  }
  return NextResponse.json(resumen);
}

export const GET = withCron("resolver-consultas-vencidas", handler);
