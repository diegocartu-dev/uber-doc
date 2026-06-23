import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Notificaciones del médico (campanita). Canal unidireccional admin → médico.
// Todo server-side con service role: la tabla notificaciones_medico tiene RLS cerrada.
// GET: lista las del médico de la sesión + cuántas no leídas.
// POST: marca como leídas (todas las del médico).

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ notificaciones: [], noLeidas: 0 });

  const admin = createAdminClient();
  const { data: medico } = await admin
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  // Sirve para CUALQUIER inscripto (pendiente/aprobado/rechazado): si tiene fila en
  // medicos, recibe sus notificaciones.
  if (!medico) return NextResponse.json({ notificaciones: [], noLeidas: 0 });

  const { data: notifs } = await admin
    .from("notificaciones_medico")
    .select("id, titulo, mensaje, leida, created_at")
    .eq("medico_id", medico.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const noLeidas = (notifs ?? []).filter((n) => !n.leida).length;
  return NextResponse.json({ notificaciones: notifs ?? [], noLeidas });
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: true });

  const admin = createAdminClient();
  const { data: medico } = await admin
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!medico) return NextResponse.json({ ok: true });

  await admin
    .from("notificaciones_medico")
    .update({ leida: true, leida_at: new Date().toISOString() })
    .eq("medico_id", medico.id)
    .eq("leida", false);

  return NextResponse.json({ ok: true });
}
