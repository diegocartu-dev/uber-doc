import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import InfoMedicaForm from "@/components/InfoMedicaForm";
import { tieneNombreYApellido } from "@/lib/pacientes/nombre";

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
    .select("nombre_completo, nombre, apellido, dni, fecha_nacimiento, sexo_dni, telefono, tiene_cobertura, obra_social, obra_social_id, obra_social_otra, nro_afiliado, plan_obra_social")
    .eq("user_id", user.id)
    .single();

  // Perfil completo = identidad + teléfono + (si declaró cobertura) nro de afiliado.
  // El paciente NO puede avanzar a la consulta sin esto. El particular (sin
  // cobertura) no necesita afiliado: declarar "particular" es un estado completo.
  //
  // Identidad = nombre Y apellido (Diego, 22/08/2026): este es el último lugar
  // donde se puede frenar antes de que lo que dice la ficha se imprima y se
  // selle en una receta. Una sola palabra ya no pasa — va al onboarding.
  const perfilCompleto =
    paciente &&
    tieneNombreYApellido(paciente) &&
    paciente?.dni?.trim() &&
    paciente?.fecha_nacimiento &&
    paciente?.sexo_dni &&
    paciente?.telefono?.trim() &&
    (!paciente?.tiene_cobertura || paciente?.nro_afiliado?.trim());

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
