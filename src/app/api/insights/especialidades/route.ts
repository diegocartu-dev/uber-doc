import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin } from "@/lib/admin";

function fechaAR(offset = 0) {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  d.setDate(d.getDate() - offset);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function GET(req: NextRequest) {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const dias = parseInt(req.nextUrl.searchParams.get("dias") ?? "30", 10);
  const desde = fechaAR(dias);
  const admin = createAdminClient();

  const [{ data: medicos }, { data: consultas }] = await Promise.all([
    admin.from("medicos").select("id, especialidad, precio_consulta, disponible").eq("verificado", true),
    admin.from("consultas").select("id, estado, medico_id, especialidad, created_at, aceptada_at").gte("created_at", desde),
  ]);

  const espMap = new Map<string, {
    consultas: number; completadas: number; gmv: number;
    medicosActivos: Set<string>; medicosTotal: Set<string>;
    esperaMs: number[];
  }>();

  for (const m of medicos ?? []) {
    const esp = m.especialidad;
    if (!espMap.has(esp)) {
      espMap.set(esp, { consultas: 0, completadas: 0, gmv: 0, medicosActivos: new Set(), medicosTotal: new Set(), esperaMs: [] });
    }
    const e = espMap.get(esp)!;
    e.medicosTotal.add(m.id);
    if (m.disponible) e.medicosActivos.add(m.id);
  }

  for (const c of consultas ?? []) {
    const esp = c.especialidad;
    if (!espMap.has(esp)) {
      espMap.set(esp, { consultas: 0, completadas: 0, gmv: 0, medicosActivos: new Set(), medicosTotal: new Set(), esperaMs: [] });
    }
    const e = espMap.get(esp)!;
    e.consultas++;
    if (c.estado === "completada") {
      e.completadas++;
      const med = (medicos ?? []).find(m => m.id === c.medico_id);
      e.gmv += med?.precio_consulta ?? 0;
    }
    if (c.aceptada_at && c.created_at) {
      e.esperaMs.push(new Date(c.aceptada_at).getTime() - new Date(c.created_at).getTime());
    }
  }

  const result = [...espMap.entries()].map(([esp, d]) => {
    const ratio = d.medicosActivos.size > 0 ? d.consultas / d.medicosActivos.size : d.consultas > 0 ? Infinity : 0;
    let demanda: "alta" | "media" | "ok" = "ok";
    if (ratio > 10 || (d.consultas > 3 && d.medicosActivos.size === 0)) demanda = "alta";
    else if (ratio > 5) demanda = "media";

    return {
      especialidad: esp,
      consultas: d.consultas,
      completadas: d.completadas,
      gmv: d.gmv,
      medicosActivos: d.medicosActivos.size,
      medicosTotal: d.medicosTotal.size,
      esperaPromMs: d.esperaMs.length > 0 ? d.esperaMs.reduce((a, b) => a + b, 0) / d.esperaMs.length : null,
      demanda,
    };
  }).sort((a, b) => b.consultas - a.consultas);

  return NextResponse.json({ especialidades: result });
}
