import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const consultaId = req.nextUrl.searchParams.get("consultaId");
  if (!consultaId) return NextResponse.json({ error: "Falta consultaId" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data } = await supabase
    .from("consultas")
    .select("estado, sala_video_url")
    .eq("id", consultaId)
    .single();

  if (!data) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  return NextResponse.json(data);
}
