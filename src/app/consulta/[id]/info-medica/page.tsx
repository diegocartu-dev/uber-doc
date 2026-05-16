import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import InfoMedicaForm from "@/components/InfoMedicaForm";

export default async function InfoMedicaConsultaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { id: consultaId } = await params;
  const { redirect: redirectUrl } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const destino = redirectUrl ?? `/consulta/${consultaId}/confirmacion`;
  const currentPath = `/consulta/${consultaId}/info-medica?redirect=${encodeURIComponent(destino)}`;

  const { data: paciente } = await supabase
    .from("pacientes")
    .select("nombre_completo, dni, fecha_nacimiento, sexo_dni, tiene_cobertura, obra_social, obra_social_id, obra_social_otra, nro_afiliado, plan_obra_social, cobertura_validada_en")
    .eq("user_id", user.id)
    .single();

  const perfilCompleto =
    paciente?.nombre_completo?.trim() &&
    paciente?.dni?.trim() &&
    paciente?.fecha_nacimiento &&
    paciente?.sexo_dni;

  if (!perfilCompleto) {
    redirect(`/onboarding?redirectTo=${encodeURIComponent(currentPath)}`);
  }

  // Resolve obra social name from FK if available
  let obraSocialNombre: string | null = null;
  if (paciente?.obra_social_id) {
    const { data: os } = await supabase
      .from("obras_sociales")
      .select("nombre")
      .eq("id", paciente.obra_social_id)
      .single();
    obraSocialNombre = os?.nombre ?? null;
  }

  // Skip validation if cobertura was validated less than 30 days ago
  const coberturaValidadaEn = paciente?.cobertura_validada_en
    ? new Date(paciente.cobertura_validada_en)
    : null;
  const skipValidation =
    coberturaValidadaEn &&
    Date.now() - coberturaValidadaEn.getTime() < 30 * 24 * 60 * 60 * 1000;

  if (skipValidation) {
    redirect(destino);
  }

  return (
    <InfoMedicaForm
      paciente={{
        ...paciente,
        obra_social_nombre: obraSocialNombre,
      }}
      redirect={destino}
      editUrl={`/onboarding?redirectTo=${encodeURIComponent(currentPath)}&edit=true`}
    />
  );
}
