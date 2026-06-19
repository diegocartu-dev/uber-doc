import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolverYAplicarConsulta } from "@/lib/aplicar-resolucion";
import { logInfo, logError } from "@/lib/logger";

// ---------------------------------------------------------------------------
// GET /api/cron/rejoin-expirar  (cada 1 min — Vercel Pro)
// Ref: docs/diseno-resolucion-consultas.md §6.4 / §7
//
// BACKSTOP del chequeo on-demand de /api/consulta-estado: resuelve consultas/turnos
// `en_curso` que ya corresponde cerrar cuando NADIE está polleando (el paciente
// cerró la pestaña). El cierre OPORTUNO lo hace el on-demand mientras el paciente
// espera; este cron lo cubre cuando no hay polling.
//
// Consultas CI (Fase 2): delega en el aplicador (resolverYAplicarConsulta), que
// hace cumplir la ventana de 15 min y la acción de plata (reembolso si el médico
// no finalizó). El aplicador es idempotente y NO toca consultas activas, así que
// es seguro pasarle todas las en_curso.
//
// Turnos: por ahora mantiene el comportamiento Fase 1 (cerrar a completado tras la
// ventana de corte). PENDIENTE F2: aplicar el motor a turnos (turno applicator).
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // ── Consultas CI: resolución vía el motor ──
  let consultasResueltas = 0;
  const { data: enCurso, error: errCi } = await supabase
    .from("consultas")
    .select("id")
    .eq("estado", "en_curso");
  if (errCi) {
    logError("[CRON/REJOIN]", "Error listando consultas en_curso", { error: errCi.message });
  } else {
    for (const c of enCurso ?? []) {
      try {
        const motivo = await resolverYAplicarConsulta(c.id, "cron_rejoin");
        if (motivo) consultasResueltas++;
      } catch (e) {
        logError("[CRON/REJOIN]", "Error resolviendo consulta", { id: c.id, error: String(e) });
      }
    }
  }

  // ── Turnos: comportamiento Fase 1 (cerrar a completado tras 2 min de corte) ──
  const hace2min = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  let turnosCerrados = 0;
  const { data: vencidos, error: errT } = await supabase
    .from("turnos")
    .select("id")
    .eq("estado", "en_curso")
    .not("desconectado_at", "is", null)
    .lt("desconectado_at", hace2min);
  if (errT) {
    logError("[CRON/REJOIN]", "Error seleccionando turnos", { error: errT.message });
  } else if (vencidos && vencidos.length > 0) {
    const ids = vencidos.map((v) => v.id);
    const { data: act, error: errU } = await supabase
      .from("turnos")
      .update({ estado: "completado", desconectado_at: null })
      .in("id", ids)
      .eq("estado", "en_curso")
      .select("id");
    if (errU) logError("[CRON/REJOIN]", "Error cerrando turnos", { error: errU.message, ids });
    else turnosCerrados = (act ?? []).length;
  }

  if (consultasResueltas > 0 || turnosCerrados > 0) {
    logInfo("[CRON/REJOIN]", "Resolución backstop", { consultasResueltas, turnosCerrados });
  }
  return NextResponse.json({
    ok: true,
    consultas_resueltas: consultasResueltas,
    turnos_cerrados: turnosCerrados,
  });
}
