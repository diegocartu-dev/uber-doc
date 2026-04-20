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
    .select("nombre_completo, dni, fecha_nacimiento, sexo_dni, tiene_cobertura, obra_social, nro_afiliado")
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

  return (
    <InfoMedicaForm
      paciente={paciente}
      redirect={destino}
      editUrl={`/onboarding?redirectTo=${encodeURIComponent(currentPath)}&edit=true`}
    />
  );
}
