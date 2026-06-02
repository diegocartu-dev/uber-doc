import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const body = await req.json();
    const { telefono, domicilio_consultorio, tipo_matricula, numero_matricula, provincia, celular_personal, email_personal } = body;

    // Only allow updating specific fields
    const updates: Record<string, string | null> = {};
    if (telefono !== undefined) updates.telefono = telefono?.trim() || null;
    if (domicilio_consultorio !== undefined) updates.domicilio_consultorio = domicilio_consultorio?.trim() || null;
    if (tipo_matricula !== undefined) updates.tipo_matricula = tipo_matricula?.trim() || null;
    if (numero_matricula !== undefined) updates.numero_matricula = numero_matricula?.trim() || null;
    if (provincia !== undefined) updates.provincia = provincia?.trim() || null;
    if (celular_personal !== undefined) updates.celular_personal = celular_personal?.trim() || null;
    if (email_personal !== undefined) updates.email_personal = email_personal?.trim() || null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Sin cambios" }, { status: 400 });
    }

    // A1 (Roberto): la matrícula NO se puede cambiar una vez validada la
    // identidad. Si no, se rompe el cruce DNI↔matrícula (TOCTOU): el médico
    // podría validar con su matrícula real y luego cambiarla por la de otro.
    // El DNI no es editable acá, así que el titular verificado se mantiene.
    if (
      updates.tipo_matricula !== undefined ||
      updates.numero_matricula !== undefined
    ) {
      const { data: actual } = await supabase
        .from("medicos")
        .select("identidad_validada")
        .eq("user_id", user.id)
        .maybeSingle();
      if (actual?.identidad_validada) {
        return NextResponse.json(
          {
            error:
              "Tu matrícula está verificada y no se puede modificar. Escribinos a soporte@docto.com.ar para cambiarla.",
          },
          { status: 403 }
        );
      }
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
