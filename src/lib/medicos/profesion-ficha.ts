// La profesión de una ficha (13/10/2026, docs/sprints/2026-10-13-psicologos.md),
// en una query PROPIA a propósito: los SELECT que arman cada pantalla no se tocan
// (lección del outage 22/06). Si esta lectura falla, la ficha se trata como
// médico, que es lo que son todas las anteriores; la base igual le impide a un
// psicólogo la consulta inmediata (medicos_psicologo_sin_consulta_inmediata).

import type { SupabaseClient } from "@supabase/supabase-js";
import { profesionDe, type Profesion } from "@/lib/refeps/profesion";

export async function profesionDeLaFicha(
  admin: SupabaseClient,
  filtro: { userId: string } | { medicoId: string }
): Promise<Profesion> {
  const q = admin.from("medicos").select("profesion");
  const { data, error } = await ("userId" in filtro ? q.eq("user_id", filtro.userId) : q.eq("id", filtro.medicoId)).maybeSingle();
  // Ante un error se cae a "médico" (lo que son todas las fichas anteriores), pero
  // queda escrito: un psicólogo tratado como médico por una lectura rota no se
  // nota en ningún otro lado.
  if (error) console.warn("[profesion-ficha] no se pudo leer la profesión, se asume médico:", error.message);
  return profesionDe((data as { profesion?: string | null } | null)?.profesion);
}
