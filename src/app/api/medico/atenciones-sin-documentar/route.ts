// GET /api/medico/documentacion-pendiente
//
// Atenciones cerradas del médico de la sesión que no le entregaron NI UN
// documento clínico al paciente. Alimenta el aviso del dashboard.
//
// Se sirve al médico dueño y a nadie más: la lista lleva nombres de pacientes.

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { atencionesSinDocumentacion } from "@/lib/atenciones-sin-documentar";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: medico } = await supabase
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!medico) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  try {
    const items = await atencionesSinDocumentacion(medico.id);
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    console.error("[documentacion-pendiente] falló:", err instanceof Error ? err.message : err);
    // Fail-safe silencioso: el dashboard del médico no se rompe por este aviso.
    return NextResponse.json({ ok: false, items: [] });
  }
}
