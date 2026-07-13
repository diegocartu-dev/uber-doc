import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withCron } from "@/lib/cron-guard";

const MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

async function handler(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const cutoff = new Date(Date.now() - MAX_AGE_MS);

    // List all folders in the bucket
    const { data: folders } = await admin.storage
      .from("consultas-temp")
      .list("", { limit: 1000 });

    let totalBorrados = 0;

    for (const folder of folders ?? []) {
      if (!folder.id) continue;

      const { data: files } = await admin.storage
        .from("consultas-temp")
        .list(folder.name);

      if (!files || files.length === 0) continue;

      const oldFiles = files.filter((f) => {
        if (!f.created_at) return false;
        return new Date(f.created_at) < cutoff;
      });

      if (oldFiles.length > 0) {
        const paths = oldFiles.map((f) => `${folder.name}/${f.name}`);
        await admin.storage.from("consultas-temp").remove(paths);
        totalBorrados += oldFiles.length;
      }
    }

    console.log(`[cron/limpieza-estudios-temp] ${totalBorrados} archivos huérfanos eliminados`);

    return NextResponse.json({
      ok: true,
      borrados: totalBorrados,
    });
  } catch (err) {
    console.error("[cron/limpieza-estudios-temp] error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export const GET = withCron("limpieza-estudios-temp", handler);
