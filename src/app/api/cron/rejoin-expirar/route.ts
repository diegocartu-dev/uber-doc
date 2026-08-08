import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logInfo, logError } from "@/lib/logger";
import { withCron } from "@/lib/cron-guard";
import { rescatarBorradoresAlCerrar } from "@/lib/consultas/cerrar-con-rescate";

// ---------------------------------------------------------------------------
// GET /api/cron/rejoin-expirar  (BACKSTOP diario — ver vercel.json)
// Ref: docs/diseno-resolucion-consultas.md §6.4 · DECISIONES_PRODUCTO_DOCTO.md §13.3
//
// Reloj de rejoin server-authoritative. Cierra las consultas/turnos cuyo corte
// (desconectado_at) lleva >= 2 min sin reconexión.
//
// NOTA (plan Vercel): el cierre OPORTUNO a los 2 min lo hace el chequeo on-demand
// en /api/consulta-estado y /api/turno-estado (el que espera hace polling cada 5s).
// Este cron quedó como BACKSTOP DIARIO para el caso borde "los dos se cayeron y
// ninguno volvió a pollear" — un cron de cada minuto requería Vercel Pro.
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

// Cerrar es barato; rescatar el borrador no (emite, firma y manda mails/pushes).
// Con el default de 15 s de Vercel, una tanda de 4-5 encuentros mata la función.
export const maxDuration = 300;

// Techo de rescates por corrida. Lo que sobra no se pierde: lo levanta el repaso
// de "cerrado sin entregar" del cron cerrar-huerfanas (sigue sin documentos).
const MAX_RESCATES_POR_CORRIDA = 15;

async function handler(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const hace2min = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  let totalCerradas = 0;
  // Documentos que estaban escritos en el borrador y este backstop llegó a entregar.
  let totalDocumentosRescatados = 0;
  const detalle: { tabla: string; cerradas: number; ids: string[] }[] = [];
  // Encuentros cerrados por este cron cuyo borrador hay que rescatar. Se juntan
  // acá y se procesan DESPUÉS de cerrar todo: cerrar es lo urgente (destraba al
  // paciente en la pantalla de espera), rescatar es lo lento.
  const porRescatar: { tipo: "consulta" | "turno"; ids: string[] }[] = [];

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
    // Es también el mutex del rescate: solo las filas que devuelve fueron cerradas
    // por este cron, y solo a esas se les rescata el borrador.
    // `completada_at` + `cierre_origen` (08/08/2026): este backstop los venía
    // omitiendo, así que sus cierres quedaban sin hora ni firma de quién cerró.
    const { data: actualizadas, error: errUpdate } = await supabase
      .from(tabla)
      .update({
        estado: estadoFinal,
        desconectado_at: null,
        completada_at: new Date().toISOString(),
        cierre_origen: "rejoin_expirado",
      })
      .in("id", ids)
      .eq("estado", "en_curso")
      .select("id");

    if (errUpdate) {
      logError("[CRON/REJOIN]", `Error actualizando ${tabla}`, { error: errUpdate.message, ids });
      detalle.push({ tabla, cerradas: 0, ids: [`ERROR update: ${errUpdate.message}`] });
      continue;
    }

    const cerradasIds = (actualizadas ?? []).map((r) => r.id);
    porRescatar.push({ tipo: tabla === "consultas" ? "consulta" : "turno", ids: cerradasIds });

    totalCerradas += cerradasIds.length;
    detalle.push({ tabla, cerradas: cerradasIds.length, ids: cerradasIds });
  }

  // Rescate del borrador: lo escrito y no entregado sale ahora. Nunca lanza.
  // Como estos encuentros llevan al menos un día abiertos (este cron es diario),
  // la marca `cierre_origen='medico'` que pudiera haber quedado ya no significa
  // nada: el guardado en background del profesional murió hace rato. Se rescata
  // igual; contra duplicados está el chequeo de documentos del propio rescate.
  let rescatesHechos = 0;
  for (const grupo of porRescatar) {
    const cupo = MAX_RESCATES_POR_CORRIDA - rescatesHechos;
    if (cupo <= 0) break;
    const ids = grupo.ids.slice(0, cupo);
    rescatesHechos += ids.length;
    const rescates = await rescatarBorradoresAlCerrar(grupo.tipo, ids, "rejoin_expirado");
    totalDocumentosRescatados += rescates.reduce((acc, r) => acc + r.documentos_emitidos, 0);
  }

  if (totalCerradas > 0) {
    logInfo("[CRON/REJOIN]", "Rejoin expirado: consultas cerradas por timeout de 2 min", {
      totalCerradas,
      totalDocumentosRescatados,
      detalle,
    });
  }

  return NextResponse.json({
    ok: true,
    total_cerradas: totalCerradas,
    documentos_rescatados: totalDocumentosRescatados,
    detalle,
  });
}

export const GET = withCron("rejoin-expirar", handler);
