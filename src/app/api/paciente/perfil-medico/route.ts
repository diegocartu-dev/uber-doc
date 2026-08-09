import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calcularCuilFormateado } from "@/lib/cuil";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const body = await req.json();
  const { fecha_nacimiento, sexo_dni, tiene_cobertura, obra_social, nro_afiliado } = body;

  // Validaciones
  if (!fecha_nacimiento || typeof fecha_nacimiento !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha_nacimiento)) {
    return NextResponse.json({ error: "fecha_nacimiento requerido (formato YYYY-MM-DD)." }, { status: 400 });
  }

  if (!sexo_dni || (sexo_dni !== "masculino" && sexo_dni !== "femenino")) {
    return NextResponse.json({ error: "sexo_dni requerido ('masculino' o 'femenino')." }, { status: 400 });
  }

  if (tiene_cobertura && (!obra_social || typeof obra_social !== "string" || obra_social.trim() === "")) {
    return NextResponse.json({ error: "obra_social requerido cuando tiene_cobertura es true." }, { status: 400 });
  }

  // Buscar registro del paciente por user_id
  const { data: paciente, error: fetchError } = await supabase
    .from("pacientes")
    .select("id, dni")
    .eq("user_id", user.id)
    .single();

  if (fetchError || !paciente) {
    return NextResponse.json({ error: "Paciente no encontrado." }, { status: 404 });
  }

  // Calcular CUIL automáticamente a partir de DNI + sexo
  const cuil = paciente.dni ? calcularCuilFormateado(paciente.dni, sexo_dni) : null;

  // Construir update
  const updateData: Record<string, unknown> = {
    fecha_nacimiento,
    sexo_dni,
    tiene_cobertura: !!tiene_cobertura,
    obra_social: tiene_cobertura ? obra_social.trim() : null,
    nro_afiliado: tiene_cobertura && nro_afiliado ? nro_afiliado.trim() : null,
    cuil,
    perfil_medico_completado: true,
  };

  const { error: updateError } = await supabase
    .from("pacientes")
    .update(updateData)
    .eq("id", paciente.id);

  if (updateError) {
    return NextResponse.json({ error: "Error al guardar: " + updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
