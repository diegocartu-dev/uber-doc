import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { headers } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, tipo, nombre, provincia, especialidad } = body;

    if (!email || !tipo || !["medico", "paciente"].includes(tipo)) {
      return NextResponse.json(
        { error: "Email y tipo son requeridos" },
        { status: 400 }
      );
    }

    // Validar email basico
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Email invalido" },
        { status: 400 }
      );
    }

    const hdrs = await headers();
    const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const userAgent = hdrs.get("user-agent") || null;

    const supabase = createAdminClient();

    const { error } = await supabase.from("lista_espera").upsert(
      {
        email: email.trim().toLowerCase(),
        tipo,
        nombre: nombre?.trim() || null,
        provincia: provincia || null,
        especialidad: tipo === "medico" ? especialidad || null : null,
        ip_address: ip,
        user_agent: userAgent,
      },
      { onConflict: "email,tipo", ignoreDuplicates: true }
    );

    if (error) {
      console.error("[lista-espera] Error:", error);
      return NextResponse.json(
        { error: "Error al registrar" },
        { status: 500 }
      );
    }

    // Contar total
    const { count } = await supabase
      .from("lista_espera")
      .select("id", { count: "exact", head: true });

    return NextResponse.json({ ok: true, total: count ?? 0 });
  } catch {
    return NextResponse.json(
      { error: "Error interno" },
      { status: 500 }
    );
  }
}
