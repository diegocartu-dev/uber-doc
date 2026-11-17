import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withCron } from "@/lib/cron-guard";
import { copiarStorage, debeSonar, refDelProyecto } from "@/lib/respaldo/copia-storage";

// Copia diaria del Storage a Vercel Blob (privado). Corre en los dos deploys:
// cada uno copia su propio proyecto de Supabase, separado por el ref.
// Detalle y prueba de restauración: docs/infra/2026-11-16-restauracion-probada.md.
export const maxDuration = 300;

async function handler(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Falta BLOB_READ_WRITE_TOKEN: no hay dónde copiar" }, { status: 500 });
  }
  try {
    const ref = refDelProyecto(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const r = await copiarStorage(createAdminClient(), ref, { presupuestoMs: 220_000 });
    // Sin rutas en el log ni en el mail: llevan el uid del profesional.
    const resumen = { ...r, fallas: r.fallas.slice(0, 5) };
    console.log("[cron/copia-storage]", JSON.stringify({ ...r, fallas: r.fallas.length }));
    const motivo = debeSonar(r);
    if (motivo) return NextResponse.json({ ...resumen, error: motivo }, { status: 500 });
    return NextResponse.json({ ok: true, ...resumen });
  } catch (err) {
    console.error("[cron/copia-storage] error:", (err as Error).message);
    return NextResponse.json({ error: (err as Error).message.slice(0, 200) }, { status: 500 });
  }
}

export const GET = withCron("copia-storage", handler);
