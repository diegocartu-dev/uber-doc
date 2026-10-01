import type { SupabaseClient } from "@supabase/supabase-js";
import { slugConMatricula } from "./matricula-refeps";

/**
 * El perfil público lleva la matrícula en la URL ("…-MN123456"). Si la matrícula
 * se corrige, el slug la sigue — pero SOLO en un profesional que nunca estuvo
 * aprobado: a uno que ya atendió le llegaron mails y avisos con su link, y
 * cambiárselo los deja en un 404 sin redirección. Para esos, queda el viejo.
 *
 * "Nunca aprobado" se decide con la ficha de ANTES de cambiar la matrícula (a un
 * aprobado, el trigger reverificar_medico le borra la aprobación en el mismo
 * update) y con el log de auditoría. Ante la duda (un error al leer), no se toca
 * nada. Nunca frena a quien lo llama.
 */
export async function moverSlugSiNuncaSeAprobo(
  admin: SupabaseClient,
  medicoId: string,
  antes: {
    slug: string | null | undefined;
    tipo_matricula: string | null | undefined;
    numero_matricula: string | null | undefined;
    verificado: boolean | null | undefined;
    verificado_at: string | null | undefined;
  },
  nueva: { tipo: string; numero: string }
): Promise<void> {
  if (antes.verificado === true || antes.verificado_at) return;
  const slugNuevo = slugConMatricula(antes.slug, { tipo: antes.tipo_matricula, numero: antes.numero_matricula }, nueva);
  if (!slugNuevo || slugNuevo === antes.slug) return;

  const { data: aprobaciones, error: errLog } = await admin
    .from("admin_audit_log")
    .select("id")
    .eq("recurso_tipo", "medico")
    .eq("recurso_id", medicoId)
    .in("accion", ["aprobar_medico", "reactivar_medico"])
    .limit(1);
  if (errLog || (aprobaciones?.length ?? 0) > 0) return;

  const { error } = await admin.from("medicos").update({ slug: slugNuevo }).eq("id", medicoId).eq("slug", antes.slug as string);
  // Si el slug nuevo ya existe (índice único), queda el viejo: una URL con el
  // número anterior no traba a nadie.
  if (error) console.warn("[medicos/slug] el slug no se pudo actualizar:", error.message);
}
