import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppNavbar from "@/components/AppNavbar";
import GrillaEspecialidades from "./GrillaEspecialidades";

export default async function ClinicaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const fullName = user.user_metadata?.full_name || user.email;

  const { data: medicos } = await supabase
    .from("medicos")
    .select("id, especialidad, modalidad_atencion, nombre_completo, disponible, disponible_desde, disponible_hasta, precio_consulta, duracion_consulta")
    .eq("oculto_clinica", false);

  // Contar consultas en espera por médico para estimar tiempos
  const { data: consultasEspera } = await supabase
    .from("consultas")
    .select("medico_id")
    .eq("estado", "esperando");

  return (
    <div className="min-h-full" style={{ backgroundColor: "var(--color-bg-secondary)" }}>
      <AppNavbar userName={fullName} userRole="paciente" />

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Clínica Virtual</h1>
          <p className="mt-2 text-gray-600">
            Elegí una especialidad para consultar con un médico.
          </p>
        </div>

        <GrillaEspecialidades
          medicos={medicos ?? []}
          consultasEspera={consultasEspera ?? []}
        />
      </main>
    </div>
  );
}
