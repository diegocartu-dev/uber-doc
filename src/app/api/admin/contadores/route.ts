import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin-auth";

/**
 * Los números de los globitos rojos del menú lateral.
 *
 * POR QUÉ EXISTE: el layout de /admin es un server component que los cuenta una
 * vez por render. Cuando el admin aprueba al último médico pendiente, la lista se
 * vacía en pantalla pero el globito seguía diciendo "1" hasta recargar el sitio
 * entero. Se intentó resolver con `router.refresh()` (PR #362) confiando en que
 * volviera a correr el layout; no alcanzó, y el número viejo siguió apareciendo.
 *
 * Este endpoint corta la dependencia: el globito puede preguntar por su cuenta,
 * cuando algo cambia y cuando la pestaña vuelve al frente. Es una lectura barata
 * —dos COUNT con `head: true`, sin traer filas— y no reemplaza el número que
 * pinta el servidor, solo lo corrige después.
 *
 * Mismo criterio EXACTO que el layout: si un día cambia allá, cambia acá.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !(await isAdmin(user.id))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const [{ count: medicos }, { count: alertas }] = await Promise.all([
    admin
      .from("medicos")
      .select("id", { count: "exact", head: true })
      .eq("estado_registro", "pendiente_revision")
      .eq("es_cuenta_test", false),
    admin.from("alertas_admin").select("id", { count: "exact", head: true }).eq("estado", "pendiente"),
  ]);

  return NextResponse.json({ medicos: medicos ?? 0, alertas: alertas ?? 0 });
}
