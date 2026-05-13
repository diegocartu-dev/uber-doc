import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logInfo, logError } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const hace10min = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  let totalCerradas = 0;
  const detalle: { tabla: string; cerradas: number; ids: string[] }[] = [];

  for (const tabla of ["consultas", "turnos"] as const) {
    const { data: huerfanas, error: errSelect } = await supabase
      .from(tabla)
      .select("id")
      .eq("estado", "en_curso")
      .lt("updated_at", hace10min);

    if (errSelect) {
      logError("[CRON/HUERFANAS]", `Error seleccionando ${tabla}`, { error: errSelect.message });
      detalle.push({ tabla, cerradas: 0, ids: [`ERROR: ${errSelect.message}`] });
      continue;
    }

    if (!huerfanas || huerfanas.length === 0) {
      detalle.push({ tabla, cerradas: 0, ids: [] });
      continue;
    }

    const ids = huerfanas.map((h) => h.id);
    const estadoFinal = tabla === "consultas" ? "completada" : "completado";

    const { error: errUpdate } = await supabase
      .from(tabla)
      .update({ estado: estadoFinal })
      .in("id", ids);

    if (errUpdate) {
      logError("[CRON/HUERFANAS]", `Error actualizando ${tabla}`, { error: errUpdate.message, ids });
      detalle.push({ tabla, cerradas: 0, ids: [`ERROR update: ${errUpdate.message}`] });
      continue;
    }

    totalCerradas += ids.length;
    detalle.push({ tabla, cerradas: ids.length, ids });
  }

  const hace45dias = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();

  const { data: creditosVencidos } = await supabase
    .from("turnos")
    .select("id")
    .eq("estado", "cancelado_medico")
    .eq("reintegro_estado", "pendiente")
    .lt("updated_at", hace45dias);

  let reembolsados = 0;
  if (creditosVencidos && creditosVencidos.length > 0) {
    const ids = creditosVencidos.map((t) => t.id);
    const { error: errReembolso } = await supabase
      .from("turnos")
      .update({ reintegro_estado: "reembolsado" })
      .in("id", ids);

    if (!errReembolso) reembolsados = ids.length;
  }

  if (totalCerradas > 0 || reembolsados > 0) {
    logInfo("[CRON/HUERFANAS]", "Ejecución con cambios", {
      totalCerradas,
      creditosReembolsados: reembolsados,
      detalle,
    });
  }

  return NextResponse.json({
    ok: true,
    total_cerradas: totalCerradas,
    creditos_reembolsados: reembolsados,
    detalle,
  });
}
