import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await request.json();
    const { tipo, borrador } = body as {
      tipo: "consulta" | "turno";
      borrador: {
        diagnostico: string;
        receta: string;
        indicaciones: string;
        certificado: string;
        updated_at: string;
      };
    };

    if (!tipo || !borrador) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    // Verificar que el user es el médico de esta consulta/turno
    const { data: medico } = await supabase
      .from("medicos")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!medico) {
      return NextResponse.json({ error: "No es médico" }, { status: 403 });
    }

    const tabla = tipo === "turno" ? "turnos" : "consultas";

    const { data: registro } = await supabase
      .from(tabla)
      .select("medico_id")
      .eq("id", id)
      .single();

    if (!registro || registro.medico_id !== medico.id) {
      return NextResponse.json(
        { error: "No autorizado para esta consulta" },
        { status: 403 }
      );
    }

    const { error: updateError } = await supabase
      .from(tabla)
      .update({ doc_borrador: borrador })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json(
        { error: "Error al guardar borrador" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Error interno" },
      { status: 500 }
    );
  }
}
