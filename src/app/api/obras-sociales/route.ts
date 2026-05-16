import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  // Fetch all active obras sociales ordered by orden_visualizacion
  const { data: obrasSociales, error: osError } = await supabase
    .from("obras_sociales")
    .select("id, nombre, tipo, orden_visualizacion")
    .eq("activo", true)
    .order("orden_visualizacion");

  if (osError) {
    console.error("[API obras-sociales]", osError.message);
    return NextResponse.json({ error: "Error cargando obras sociales" }, { status: 500 });
  }

  // Fetch all active planes
  const { data: planes, error: planesError } = await supabase
    .from("obras_sociales_planes")
    .select("id, obra_social_id, nombre, orden_visualizacion")
    .eq("activo", true)
    .order("orden_visualizacion");

  if (planesError) {
    console.error("[API obras-sociales planes]", planesError.message);
    return NextResponse.json({ error: "Error cargando planes" }, { status: 500 });
  }

  // Group planes by obra_social_id
  const planesPorOS: Record<string, { id: string; nombre: string }[]> = {};
  for (const plan of planes ?? []) {
    if (!planesPorOS[plan.obra_social_id]) {
      planesPorOS[plan.obra_social_id] = [];
    }
    planesPorOS[plan.obra_social_id].push({ id: plan.id, nombre: plan.nombre });
  }

  // Separate into prepagas and obras_sociales
  const prepagas = (obrasSociales ?? []).filter((os) => os.tipo === "prepaga");
  const obras = (obrasSociales ?? []).filter((os) => os.tipo !== "prepaga");

  return NextResponse.json({
    prepagas: prepagas.map((os) => ({
      id: os.id,
      nombre: os.nombre,
      planes: planesPorOS[os.id] ?? [],
    })),
    obras_sociales: obras.map((os) => ({
      id: os.id,
      nombre: os.nombre,
      planes: planesPorOS[os.id] ?? [],
    })),
  });
}
