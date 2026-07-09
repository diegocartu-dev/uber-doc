"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelarTurnoPorMedico } from "@/lib/cancelaciones";

// "No pude atender" (decisión Diego 08/07): ante una falla técnica en un turno en curso
// (o en espera), el médico cancela y el paciente recibe el reembolso — antes su única
// salida era marcarlo "completado" (paciente pagaba sin recibir nada). Own-session:
// el médico se identifica por SU sesión y cancelarTurnoPorMedico valida la propiedad.
export async function cancelarTurnoNoAtendido(
  turnoId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const admin = createAdminClient();
  const { data: medico } = await admin
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!medico) return { ok: false, error: "No encontramos tu perfil de médico." };

  const res = await cancelarTurnoPorMedico(
    turnoId,
    medico.id,
    "No pude atender el turno (falla técnica)"
  );
  return res.ok ? { ok: true } : { ok: false, error: res.error ?? "No se pudo cancelar." };
}
