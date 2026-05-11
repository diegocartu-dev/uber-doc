import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppNavbar from "@/components/AppNavbar";
import GrillaEspecialidades from "./GrillaEspecialidades";
import { getFlag } from "@/lib/feature-flags";

export default async function ClinicaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: paciente } = await supabase
    .from("pacientes")
    .select("nombre_completo, dni, fecha_nacimiento, sexo_dni")
    .eq("user_id", user.id)
    .maybeSingle();

  if (paciente !== null) {
    const perfilCompleto =
      paciente?.nombre_completo?.trim() &&
      paciente?.dni?.trim() &&
      paciente?.fecha_nacimiento &&
      paciente?.sexo_dni;
    if (!perfilCompleto) redirect("/onboarding?redirectTo=/clinica");
  }

  const fullName = user.user_metadata?.full_name || user.email;

  const { data: medicos } = await supabase
    .from("medicos")
    .select("id, especialidad, modalidad_atencion, nombre_completo, disponible, disponible_desde, disponible_hasta, precio_consulta, duracion_consulta")
    .eq("oculto_clinica", false)
    .eq("verificado", true)
    .eq("estado_registro", "aprobado")
    .eq("es_cuenta_test", false);

  // Contar turnos disponibles en clínica virtual por médico (para decidir visibilidad del botón "Agendar turno")
  const hoy = new Date().toISOString().split("T")[0];
  const { data: turnosDisponibles } = await supabase
    .from("turnos")
    .select("medico_id")
    .eq("estado", "disponible")
    .eq("canal_origen", "clinica_virtual")
    .gte("fecha", hoy)
    .limit(500);

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
          turnosClinicaVirtual={turnosDisponibles ?? []}
          flagCiActiva={await getFlag("consulta_inmediata_global")}
          flagTurnosActivos={await getFlag("turnos_global")}
        />
      </main>
    </div>
  );
}
