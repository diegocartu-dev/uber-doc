import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "./LogoutButton";
import DisponibilidadMedico from "./DisponibilidadMedico";
import ConsultasPendientes from "./ConsultasPendientes";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const fullName = user.user_metadata?.full_name || user.email;
  const role = user.user_metadata?.role;

  // Si es médico, traer su disponibilidad y duración de consulta
  let medico: {
    id: string;
    disponible: boolean;
    disponible_desde: string | null;
    disponible_hasta: string | null;
    duracion_consulta: number;
  } | null = null;

  let consultasPendientes: {
    id: string;
    especialidad: string;
    estado: string;
    created_at: string;
    paciente_nombre: string;
  }[] = [];

  if (role === "medico") {
    const { data } = await supabase
      .from("medicos")
      .select("id, disponible, disponible_desde, disponible_hasta, duracion_consulta")
      .eq("user_id", user.id)
      .single();
    medico = data;

    if (data) {
      // Traer consultas en espera
      const { data: consultas } = await supabase
        .from("consultas")
        .select("id, especialidad, estado, created_at, paciente_id")
        .eq("medico_id", data.id)
        .eq("estado", "esperando")
        .order("created_at", { ascending: true });

      if (consultas && consultas.length > 0) {
        // Traer nombres de pacientes por user_id
        const pacienteIds = consultas.map((c) => c.paciente_id);
        const { data: pacientes } = await supabase
          .from("pacientes")
          .select("user_id, nombre_completo")
          .in("user_id", pacienteIds);

        const nombresPorId = new Map(
          (pacientes ?? []).map((p) => [p.user_id, p.nombre_completo])
        );

        consultasPendientes = consultas.map((c) => ({
          id: c.id,
          especialidad: c.especialidad,
          estado: c.estado,
          created_at: c.created_at,
          paciente_nombre: nombresPorId.get(c.paciente_id) ?? "Paciente",
        }));
      }
    }
  }

  return (
    <div className="min-h-full">
      <nav className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🩺</span>
            <span className="text-xl font-bold text-gray-900">Uber Doc</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">Hola, {fullName}</span>
            <LogoutButton />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Bienvenido a Uber Doc. Desde acá podés gestionar tus consultas
          médicas.
        </p>

        {/* Disponibilidad y consultas pendientes del médico */}
        {role === "medico" && medico && (
          <div className="mt-8 space-y-6">
            {consultasPendientes.length > 0 && (
              <ConsultasPendientes consultas={consultasPendientes} />
            )}
            <DisponibilidadMedico
              disponible={medico.disponible}
              disponibleDesde={medico.disponible_desde}
              disponibleHasta={medico.disponible_hasta}
              duracionConsulta={medico.duracion_consulta}
              pacientesEnEspera={consultasPendientes.length}
            />
          </div>
        )}

        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">

          {role !== "medico" && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="text-3xl">📅</div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">
                Mis turnos
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                No tenés turnos programados.
              </p>
              <Link
                href="/clinica"
                className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Agendar turno
              </Link>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="text-3xl">📋</div>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">
              {role === "medico" ? "Mis consultas" : "Historial médico"}
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              {role === "medico"
                ? "Revisá tus consultas pasadas y pendientes."
                : "Accedé a tus consultas anteriores y recetas."}
            </p>
            <button className="mt-4 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              {role === "medico" ? "Ver consultas" : "Ver historial"}
            </button>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="text-3xl">👤</div>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">
              Mi perfil
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Editá tus datos personales y preferencias.
            </p>
            <button className="mt-4 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Editar perfil
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
