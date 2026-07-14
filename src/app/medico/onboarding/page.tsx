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
  searchParams: Promise<{ paso?: string; mp?: string; error?: string; qa?: string }>;
}) {
  const sp = await searchParams;
  // QA solo en previews (NUNCA en producción): ?qa=1 deja ver el wizard con
  // cualquier médico, salteando los redirects de aprobado/test/completo. En prod
  // es siempre false → comportamiento normal intacto.
  const qa = sp.qa === "1" && process.env.VERCEL_ENV !== "production";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Fila propia del médico vía service role: el SELECT incluye celular_personal
  // (sin GRANT para authenticated) → con el cliente RLS PostgREST falla la query
  // entera, medico=null y el wizard rebotaba al dashboard (feature muerta en prod
  // desde 644e9a8). Es el dato propio del usuario, leído server-side por user_id.
  const adminDb = createAdminClient();

  const { data: medico } = await adminDb
    .from("medicos")
    .select(
      "id, nombre_completo, verificado, estado_registro, foto_url, firma_manuscrita_url, domicilio_consultorio, provincia, es_cuenta_test, celular_personal, identidad_validada, didit_status, biometria_exenta"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  // No es médico, o todavía no lo aprobaron → no hay wizard. El dashboard se
  // encarga (muestra pantalla de espera si está pendiente_revision).
  if (!medico || (!qa && (!medico.verificado || medico.estado_registro !== "aprobado"))) {
    redirect("/dashboard");
  }

  // Estado real de los pasos que no viven en la fila de medicos (mismo adminDb de arriba).
  const [mpRes, firmaRes] = await Promise.all([
    adminDb
      .from("medicos_mp_accounts")
      .select("estado")
      .eq("medico_id", medico.id)
      .eq("estado", "activo")
      .maybeSingle(),
    adminDb.from("medico_claves").select("id").eq("medico_id", medico.id).eq("activa", true).maybeSingle(),
  ]);

  // El biométrico cuenta como hecho si quedó validado o si la cuenta está exenta.
  const biometricoHecho = !!medico.identidad_validada || !!medico.biometria_exenta;
  const pasos = {
    mp: !!mpRes.data,
    celular: !!medico.celular_personal?.trim(),
    foto: !!medico.foto_url?.trim(),
    // Firma = claves electrónicas (medico_claves) Y la imagen manuscrita, igual que
    // el gate real de atender. Si no, un médico con claves pero sin imagen cerraría
    // el wizard "100%" pero el dashboard lo bloquearía de ponerse disponible.
    firma: !!firmaRes.data && !!medico.firma_manuscrita_url?.trim(),
    domicilio: !!medico.domicilio_consultorio?.trim(),
    biometrico: biometricoHecho,
  };

  // Cuentas test o ya 100% completas → no necesitan wizard.
  if (
    !qa &&
    (medico.es_cuenta_test ||
      (pasos.mp && pasos.celular && pasos.foto && pasos.firma && pasos.domicilio && pasos.biometrico))
  ) {
    redirect("/dashboard");
  }

  return (
    <OnboardingWizard
      nombre={medico.nombre_completo ?? ""}
      pasos={pasos}
      fotoUrl={medico.foto_url ?? null}
      firmaUrl={medico.firma_manuscrita_url ?? null}
      domicilioInicial={medico.domicilio_consultorio ?? ""}
      provinciaInicial={medico.provincia ?? ""}
      celularInicial={medico.celular_personal ?? ""}
      diditStatus={medico.didit_status ?? null}
      userId={user.id}
      pasoInicialParam={sp.paso ?? null}
      mpResultado={sp.mp ?? null}
      mpError={sp.error ?? null}
    />
  );
}
