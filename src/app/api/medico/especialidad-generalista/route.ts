import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * El profesional pasa su especialidad principal a "Medicina general"
 * (decisión de Diego, 08/10/2026): "se debería poder solo a médico
 * generalista, que es lo que todos los médicos son cuando se reciben". Es el
 * único cambio de especialidad que no necesita validación: REFEPS registra a
 * todo médico como "Médico". Cualquier otra especialidad no se elige acá.
 *
 * `especialidad` está protegida por el trigger de confianza (la sesión del
 * usuario no la puede cambiar): se escribe con service role, filtrando por el
 * user_id de la sesión.
 */
const GENERALISTA = "Medicina general";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Tu sesión venció. Volvé a ingresar." }, { status: 401 });

  const admin = createAdminClient();
  const { data: medico } = await admin
    .from("medicos")
    .select("id, especialidad, especialidades_adicionales")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!medico) return NextResponse.json({ error: "No encontramos tu ficha de profesional." }, { status: 404 });
  if (medico.especialidad === GENERALISTA) return NextResponse.json({ ok: true, especialidad: GENERALISTA });

  const adicionales = ((medico.especialidades_adicionales ?? []) as string[]).filter((e) => e !== GENERALISTA);
  const { error } = await admin
    .from("medicos")
    .update({ especialidad: GENERALISTA, especialidades_adicionales: adicionales })
    .eq("id", medico.id);
  if (error) {
    console.error("[especialidad-generalista] no se pudo cambiar", { medicoId: medico.id, error: error.message });
    return NextResponse.json({ error: "No pudimos cambiar tu especialidad. Probá de nuevo en un rato." }, { status: 500 });
  }
  console.info("[especialidad-generalista] cambio", { medicoId: medico.id, antes: medico.especialidad });
  return NextResponse.json({ ok: true, especialidad: GENERALISTA });
}
