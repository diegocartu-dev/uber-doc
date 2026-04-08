import { createClient } from "@/lib/supabase/server";

/**
 * Dado un medico_id y canal_origen, devuelve la URL de retorno adecuada.
 * Si es consultorio_privado, devuelve /dr/[slug]/consultorio.
 * Si no, devuelve el fallback (por defecto /clinica).
 */
export async function getReturnUrl(
  medicoId: string,
  canalOrigen: string | null | undefined,
  fallback = "/clinica"
): Promise<string> {
  if (canalOrigen !== "consultorio_privado") return fallback;

  const supabase = await createClient();
  const { data: medico } = await supabase
    .from("medicos")
    .select("slug")
    .eq("id", medicoId)
    .maybeSingle();

  if (medico?.slug) return `/dr/${medico.slug}/consultorio`;
  return fallback;
}
