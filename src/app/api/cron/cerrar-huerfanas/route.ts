import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// GET /api/cron/cerrar-huerfanas
//
// Safety net: cierra consultas y turnos que quedaron en_curso por mas de
// 10 minutos sin actividad. Corre cada 5 minutos via Vercel Cron.
//
// Protegido con CRON_SECRET (mismo patron que generar-slots).
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Timestamp de hace 10 minutos en UTC (Supabase almacena en UTC)
  const hace10min = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  let totalCerradas = 0;
  const detalle: { tabla: string; cerradas: number; ids: string[] }[] = [];

  for (const tabla of ["consultas", "turnos"] as const) {
    // Buscar registros en_curso con updated_at anterior a 10 min
    const { data: huerfanas, error: errSelect } = await supabase
      .from(tabla)
      .select("id")
      .eq("estado", "en_curso")
      .lt("updated_at", hace10min);

    if (errSelect) {
      detalle.push({
        tabla,
        cerradas: 0,
        ids: [`ERROR: ${errSelect.message}`],
      });
      continue;
    }

    if (!huerfanas || huerfanas.length === 0) {
      detalle.push({ tabla, cerradas: 0, ids: [] });
      continue;
    }

    const ids = huerfanas.map((h) => h.id);

    const { error: errUpdate } = await supabase
      .from(tabla)
      .update({ estado: "completada" })
      .in("id", ids);

    if (errUpdate) {
      detalle.push({
        tabla,
        cerradas: 0,
        ids: [`ERROR update: ${errUpdate.message}`],
      });
      continue;
    }

    totalCerradas += ids.length;
    detalle.push({ tabla, cerradas: ids.length, ids });
  }

  // ─── Reembolso automático: créditos de médico vencidos (45 días) ───
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

  return NextResponse.json({
    ok: true,
    total_cerradas: totalCerradas,
    creditos_reembolsados: reembolsados,
    detalle,
  });
}
