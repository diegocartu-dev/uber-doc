// La versión del consentimiento de un turno, leída IGUAL por la página que lo
// muestra y por la API que lo guarda (13/10/2026). Antes cada una calculaba la
// profesión por su lado: si una lectura fallaba en una y no en la otra, la
// pantalla mostraba el texto médico, la API esperaba el de psicología y el
// paciente quedaba trabado con "Intentá de nuevo".
//
// Service role, filtrando por el turno y comparando contra el paciente de la
// sesión. Si la profesión no se puede leer, NO se adivina el texto: mostrar el
// médico a quien atiende un psicólogo sería registrar un consentimiento que no
// leyó. Quien llama decide qué hacer con "no_se_pudo_leer".

import type { SupabaseClient } from "@supabase/supabase-js";
import { profesionDe, type Profesion } from "@/lib/refeps/profesion";
import { versionConsentimiento, type VersionConsentimiento } from "@/lib/legal/consentimiento-version";

export type VersionDelTurno =
  | { ok: true; version: VersionConsentimiento; profesion: Profesion }
  | { ok: false; motivo: "no_es_suyo" | "no_se_pudo_leer" };

export async function versionConsentimientoDelTurno(
  admin: SupabaseClient,
  turnoId: string,
  pacienteId: string,
): Promise<VersionDelTurno> {
  // `turnos.paciente_id` es `pacientes.id`, no el user_id (asimetría de esquema).
  const { data: turno, error } = await admin
    .from("turnos")
    .select("paciente_id, medico_id")
    .eq("id", turnoId)
    .maybeSingle();
  if (error) {
    console.warn("[consentimiento-turno] no se pudo leer el turno:", error.message);
    return { ok: false, motivo: "no_se_pudo_leer" };
  }
  if (!turno || turno.paciente_id !== pacienteId) return { ok: false, motivo: "no_es_suyo" };
  if (!turno.medico_id) return { ok: false, motivo: "no_se_pudo_leer" };

  const { data: medico, error: errMedico } = await admin
    .from("medicos")
    .select("profesion")
    .eq("id", turno.medico_id)
    .maybeSingle();
  if (errMedico || !medico) {
    console.warn("[consentimiento-turno] no se pudo leer la profesión:", errMedico?.message ?? "sin ficha");
    return { ok: false, motivo: "no_se_pudo_leer" };
  }
  const profesion = profesionDe((medico as { profesion?: string | null }).profesion);
  return { ok: true, version: versionConsentimiento(profesion), profesion };
}
