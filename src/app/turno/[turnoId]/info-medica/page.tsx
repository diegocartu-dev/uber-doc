import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import InfoMedicaForm from "@/components/InfoMedicaForm";

export default async function InfoMedicaTurnoPage({
  params,
  searchParams,
}: {
  params: Promise<{ turnoId: string }>;
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { turnoId } = await params;
  const { redirect: redirectUrl } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  // Fallback: si no hay redirect, ir a confirmacion del turno
  const destino = redirectUrl ?? `/turno/${turnoId}/confirmacion`;

  // Fetch perfil medico del paciente
  const { data: paciente } = await supabase
    .from("pacientes")
    .select("fecha_nacimiento, sexo_dni, tiene_cobertura, obra_social, nro_afiliado, perfil_medico_completado")
    .eq("user_id", user.id)
    .single();

  // REGLA DEFENSIVA: si falla, renderizar form en estado A (primera vez)
  return <InfoMedicaForm paciente={paciente ?? null} redirect={destino} />;
}
