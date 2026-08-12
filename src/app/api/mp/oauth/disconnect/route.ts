import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { trackEvent } from "@/lib/funnel";
import { guardarSiteMp } from "@/lib/mp-site-db";
import { assertNoInstitucional } from "@/lib/instancia";

export async function POST() {
  // Modo institucional: sin Mercado Pago — este endpoint no existe (Capa B).
  if (!assertNoInstitucional()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: medico } = await admin
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!medico) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const ahora = new Date().toISOString();

  const { count } = await admin
    .from("medicos_mp_accounts")
    .update(
      {
        estado: "revocado",
        desconectado_en: ahora,
        updated_at: ahora,
      },
      { count: "exact" }
    )
    .eq("medico_id", medico.id)
    .eq("estado", "activo");

  // El país verificado describe una cuenta que ya no está conectada: si queda
  // pegado, el panel muestra "Cobros de otro país — no puede cobrar" sobre un
  // médico que simplemente se desconectó. Va en un update aparte y best-effort
  // porque esas columnas pueden no estar migradas todavía, y la desconexión
  // (que es lo que el médico pidió) no puede fallar por esto.
  await guardarSiteMp(
    medico.id,
    { site_id: null, site_verificado_at: null, site_extranjera_desde: null },
    "[MP/DISCONNECT]"
  );

  await trackEvent({
    evento: "mp_oauth_disconnect",
    medicoId: medico.id,
    metadata: { tenia_registro: (count ?? 0) > 0 },
  });

  return NextResponse.json({ ok: true });
}
