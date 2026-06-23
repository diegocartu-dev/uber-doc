import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Stethoscope } from "lucide-react";
import OnboardingForm from "@/components/OnboardingForm";
import { guardRutaPaciente } from "@/lib/auth/rol";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; error?: string; edit?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/");

  // Ruta de PACIENTE (onboarding del paciente nuevo): médico → /dashboard, admin → /admin.
  // El usuario nuevo sin fila todavía PASA (es justo el que tiene que completar acá).
  await guardRutaPaciente(supabase, user.id);

  const { data: paciente } = await supabase
    .from("pacientes")
    .select("nombre_completo, dni, fecha_nacimiento, sexo_dni, tiene_cobertura, obra_social, obra_social_id, obra_social_otra, nro_afiliado, plan_obra_social, telefono")
    .eq("user_id", user.id)
    .maybeSingle();

  const { redirectTo, error, edit } = await searchParams;

  const perfilCompleto =
    paciente?.nombre_completo?.trim() &&
    paciente?.dni?.trim() &&
    paciente?.fecha_nacimiento &&
    paciente?.sexo_dni;

  if (perfilCompleto && !edit) {
    const dest =
      redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//") && !redirectTo.includes("://")
        ? redirectTo
        : "/";
    redirect(dest);
  }

  const safeRedirect =
    redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//") && !redirectTo.includes("://")
      ? redirectTo
      : "/";

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <Stethoscope size={28} strokeWidth={2} color="var(--color-brand)" />
          <span className="text-2xl font-bold" style={{ color: "#1a1a1a" }}>docto</span>
        </div>

        <h1 className="text-center text-xl font-semibold" style={{ color: "#1a1a1a" }}>
          {edit ? "Editá tu perfil" : "Completá tu perfil para continuar"}
        </h1>
        <p className="mt-2 text-center text-sm" style={{ color: "#6b7280" }}>
          {edit
            ? "Modificá los datos que necesites."
            : "Necesitamos estos datos para tu primera consulta."}
        </p>

        <OnboardingForm
          paciente={paciente}
          redirectTo={safeRedirect}
          error={error}
        />
      </div>
    </div>
  );
}
