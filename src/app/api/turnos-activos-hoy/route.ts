import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function getHoyAR(): string {
  const ar = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  return `${ar.getFullYear()}-${(ar.getMonth() + 1).toString().padStart(2, "0")}-${ar.getDate().toString().padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  const medicoId = req.nextUrl.searchParams.get("medicoId");
  if (!medicoId) return NextResponse.json({ error: "Falta medicoId" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: medico } = await supabase
    .from("medicos").select("id").eq("user_id", user.id).single();
  if (!medico || medico.id !== medicoId) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { count } = await supabase
    .from("turnos")
    .select("id", { count: "exact", head: true })
    .eq("medico_id", medicoId)
    .eq("fecha", getHoyAR())
    .in("estado", ["confirmado", "en_espera"]);

  return NextResponse.json({ count: count ?? 0 });
}
