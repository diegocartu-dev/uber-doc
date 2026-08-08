import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  evaluarSelladoDiferido,
  sellarDocumentoDiferido,
  TIPOS_FIRMABLES,
} from "@/lib/firma/documento";

/**
 * Sellado de integridad diferido — ejecución DENTRO de producción.
 *
 * El backfill nació como script de terminal, pero no puede correr ahí: la clave
 * maestra que protege las claves de los médicos (`FIRMA_MASTER_KEY`) es un
 * secreto de Vercel que no se puede leer de vuelta — y está bien que así sea.
 * O sea que el sellado tiene que ejecutarse donde esa clave vive: acá.
 *
 * Misma lógica exacta que el script (`sellarDocumentoDiferido`), mismos guards,
 * mismo lote. Lo que cambia es dónde corre.
 *
 * Protegido con CRON_SECRET (igual que las tareas automáticas).
 *
 *   GET  ?dry=1              → simula: cuenta y explica, no escribe nada
 *   POST { aplicar: true }   → sella, en tandas, reanudable con el mismo lote
 *
 * Idempotente: un documento ya sellado se saltea. Se puede llamar de nuevo
 * hasta que `pendientes` llegue a 0.
 */
export const maxDuration = 300;

const CORTE_SELLADO_AUTOMATICO = "2026-08-07T19:09:00Z";
const MOTIVO_LOTE = "remediacion_falla_de_sellado_automatico";
const TANDA = 10;

function autorizado(req: NextRequest): boolean {
  return req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
}

async function candidatos() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("documentos")
    .select("id, tipo, created_at")
    .is("firma_digital", null)
    .in("tipo", [...TIPOS_FIRMABLES])
    .lt("created_at", CORTE_SELLADO_AUTOMATICO)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`candidatos: ${error.message}`);
  return data ?? [];
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const docs = await candidatos();
  const porMotivo: Record<string, number> = {};
  let aptos = 0;
  for (const d of docs) {
    const e = await evaluarSelladoDiferido(d.id);
    if (e.apto) aptos++;
    else porMotivo[e.motivo] = (porMotivo[e.motivo] ?? 0) + 1;
  }
  return NextResponse.json({ simulacion: true, sin_sello: docs.length, se_sellarian: aptos, se_saltearian: porMotivo });
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { aplicar?: boolean; loteId?: string };
  if (body.aplicar !== true) {
    return NextResponse.json({ error: "Falta { aplicar: true }. Usá GET para simular." }, { status: 400 });
  }

  const admin = createAdminClient();
  const docs = await candidatos();

  // Lote: uno solo para toda la remediación, reutilizable entre tandas.
  let loteId = body.loteId ?? null;
  if (!loteId) {
    const { data: lote } = await admin
      .from("sellado_diferido_lote")
      .insert({ motivo: MOTIVO_LOTE, total: docs.length })
      .select("id")
      .single();
    loteId = lote?.id ?? null;
  }
  if (!loteId) return NextResponse.json({ error: "No se pudo crear el lote" }, { status: 500 });

  const sellados: string[] = [];
  const fallidos: { id: string; motivo: string; detalle?: string }[] = [];

  for (const d of docs.slice(0, TANDA)) {
    try {
      const r = await sellarDocumentoDiferido(d.id, { loteId, loteTotal: docs.length });
      if (r.ok) sellados.push(d.id);
      else fallidos.push({ id: d.id, motivo: r.motivo, detalle: r.detalle });
    } catch (e) {
      // Un documento que falla NUNCA frena a los demás.
      fallidos.push({ id: d.id, motivo: "excepcion", detalle: e instanceof Error ? e.message : String(e) });
    }
  }

  const restantes = Math.max(0, docs.length - TANDA);
  return NextResponse.json({
    loteId,
    sellados: sellados.length,
    fallidos,
    pendientes: restantes,
    seguir: restantes > 0 ? "volvé a llamar con el mismo loteId" : "terminado",
  });
}
