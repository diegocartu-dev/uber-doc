import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logInfo, logError } from "@/lib/logger";

// ---------------------------------------------------------------------------
// GET /api/cron/rejoin-expirar  (cada 1 min — ver vercel.json)
// Ref: docs/diseno-resolucion-consultas.md §6.4 · DECISIONES_PRODUCTO_DOCTO.md §13.3
//
// Reloj de rejoin server-authoritative. Cierra las consultas/turnos cuyo corte
// (desconectado_at) lleva >= 2 min sin reconexión.
//
// FASE 1: deliberadamente NO resuelve plata ni introduce estados terminales
// nuevos. Reusa la semántica de cerrar-huerfanas (→ completada/completado), solo
// que con un reloj de 2 min en vez de 10. El valor de Fase 1 es la UX de retomar
// y el bloqueo del médico; los estados (medico_ausente/interrumpida) y la plata
// son Fase 2 (este cron se "upgradeará" en F2-4 para aplicar el motor de
// resolución en lugar de cerrar a completada).
//
// Idempotente: el UPDATE está condicionado por estado = 'en_curso'. Si una
// reconexión limpió desconectado_at antes de este tick, el filtro no lo agarra.
// Si dos ticks se solapan, el segundo ya no encuentra en_curso → no re-resuelve.
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const hace2min = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  let totalCerradas = 0;
  const detalle: { tabla: string; cerradas: number; ids: string[] }[] = [];

  for (const tabla of ["consultas", "turnos"] as const) {
    // Candidatos: en_curso con corte pendiente que ya superó la ventana de 2 min.
    const { data: vencidas, error: errSelect } = await supabase
      .from(tabla)
      .select("id")
      .eq("estado", "en_curso")
      .not("desconectado_at", "is", null)
      .lt("desconectado_at", hace2min);

    if (errSelect) {
      logError("[CRON/REJOIN]", `Error seleccionando ${tabla}`, { error: errSelect.message });
      detalle.push({ tabla, cerradas: 0, ids: [`ERROR: ${errSelect.message}`] });
      continue;
    }

    if (!vencidas || vencidas.length === 0) {
      detalle.push({ tabla, cerradas: 0, ids: [] });
      continue;
    }

    const ids = vencidas.map((v) => v.id);
    const estadoFinal = tabla === "consultas" ? "completada" : "completado";

    // UPDATE condicionado por estado previo (at-most-once + anti-reconexión-tardía).
    const { data: actualizadas, error: errUpdate } = await supabase
      .from(tabla)
      .update({ estado: estadoFinal, desconectado_at: null })
      .in("id", ids)
      .eq("estado", "en_curso")
      .select("id");

    if (errUpdate) {
      logError("[CRON/REJOIN]", `Error actualizando ${tabla}`, { error: errUpdate.message, ids });
      detalle.push({ tabla, cerradas: 0, ids: [`ERROR update: ${errUpdate.message}`] });
      continue;
    }

    const cerradasIds = (actualizadas ?? []).map((r) => r.id);
    totalCerradas += cerradasIds.length;
    detalle.push({ tabla, cerradas: cerradasIds.length, ids: cerradasIds });
  }

  if (totalCerradas > 0) {
    logInfo("[CRON/REJOIN]", "Rejoin expirado: consultas cerradas por timeout de 2 min", {
      totalCerradas,
      detalle,
    });
  }

  return NextResponse.json({ ok: true, total_cerradas: totalCerradas, detalle });
}
