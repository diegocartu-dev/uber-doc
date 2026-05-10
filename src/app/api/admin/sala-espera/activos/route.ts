import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin } from "@/lib/admin-auth";

export async function GET() {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("sala_espera_entradas")
    .select(`
      id, paciente_id, medico_id, tipo, entrada_en,
      consulta_id, turno_id,
      paciente:pacientes(nombre_completo, dni, email),
      medico:medicos(nombre_completo)
    `)
    .is("salida_en", null)
    .order("entrada_en", { ascending: true });

  if (error) {
    console.error("[admin/sala-espera/activos] Error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  const entradas = (data || []).map((e: Record<string, unknown>) => {
    const minutos = Math.floor(
      (Date.now() - new Date(e.entrada_en as string).getTime()) / 60000
    );
    return {
      ...e,
      tiempo_espera_min: minutos,
      urgencia: minutos > 20 ? "alta" : minutos > 10 ? "media" : "baja",
    };
  });

  return NextResponse.json({ entradas });
}
