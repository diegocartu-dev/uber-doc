// Wizard de onboarding del médico — pantalla completa, post-aprobación.
// Solo para médicos APROBADOS con onboarding incompleto. Lee el estado real
// (foto/domicilio en `medicos`, MP en `medicos_mp_accounts`, firma electrónica
// en `medico_claves`) y delega el flujo guiado al cliente. Si ya completó todo,
// o no es médico, o no está aprobado, redirige al dashboard.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import OnboardingWizard from "./OnboardingWizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ paso?: string; mp?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: medico } = await supabase
    .from("medicos")
    .select(
      "id, nombre_completo, verificado, estado_registro, foto_url, firma_manuscrita_url, domicilio_consultorio, es_cuenta_test"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  // No es médico, o todavía no lo aprobaron → no hay wizard. El dashboard se
  // encarga (muestra pantalla de espera si está pendiente_revision).
  if (!medico || !medico.verificado || medico.estado_registro !== "aprobado") {
    redirect("/dashboard");
  }

  // Estado real de los pasos que no viven en la fila de medicos.
  const adminDb = createAdminClient();
  const [mpRes, firmaRes] = await Promise.all([
    adminDb
      .from("medicos_mp_accounts")
      .select("estado")
      .eq("medico_id", medico.id)
      .eq("estado", "activo")
      .maybeSingle(),
    adminDb.from("medico_claves").select("id").eq("medico_id", medico.id).maybeSingle(),
  ]);

  const pasos = {
    mp: !!mpRes.data,
    foto: !!medico.foto_url?.trim(),
    firma: !!firmaRes.data,
    domicilio: !!medico.domicilio_consultorio?.trim(),
  };

  // Cuentas test o ya 100% completas → no necesitan wizard.
  if (medico.es_cuenta_test || (pasos.mp && pasos.foto && pasos.firma && pasos.domicilio)) {
    redirect("/dashboard");
  }

  return (
    <OnboardingWizard
      nombre={medico.nombre_completo ?? ""}
      pasos={pasos}
      fotoUrl={medico.foto_url ?? null}
      firmaUrl={medico.firma_manuscrita_url ?? null}
      domicilioInicial={medico.domicilio_consultorio ?? ""}
      pasoInicialParam={sp.paso ?? null}
      mpResultado={sp.mp ?? null}
      mpError={sp.error ?? null}
    />
  );
}
