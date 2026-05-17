import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const body = await req.json();
    const { telefono, domicilio_consultorio, tipo_matricula, numero_matricula, provincia } = body;

    // Only allow updating specific fields
    const updates: Record<string, string | null> = {};
    if (telefono !== undefined) updates.telefono = telefono?.trim() || null;
    if (domicilio_consultorio !== undefined) updates.domicilio_consultorio = domicilio_consultorio?.trim() || null;
    if (tipo_matricula !== undefined) updates.tipo_matricula = tipo_matricula?.trim() || null;
    if (numero_matricula !== undefined) updates.numero_matricula = numero_matricula?.trim() || null;
    if (provincia !== undefined) updates.provincia = provincia?.trim() || null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Sin cambios" }, { status: 400 });
    }

    const { error } = await supabase
      .from("medicos")
      .update(updates)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
