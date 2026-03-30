import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { entrarSalaEspera } from "@/app/clinica/[medicoId]/turnos/actions";
import EsperaTurno from "./EsperaTurno";

export default async function EsperaTurnoPage({
  params,
}: {
  params: Promise<{ turnoId: string }>;
}) {
  const { turnoId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: turno } = await supabase
    .from("turnos")
    .select("id, fecha, hora_inicio, hora_fin, estado, monto, medico_id")
    .eq("id", turnoId)
    .single();

  if (!turno) redirect("/dashboard");
  if (turno.estado === "en_curso") redirect(`/consulta/${turnoId}/video`);
  if (turno.estado !== "confirmado" && turno.estado !== "en_espera") redirect("/dashboard");

  // Marcar como en_espera si está confirmado
  if (turno.estado === "confirmado") {
    await entrarSalaEspera(turnoId);
  }

  const { data: medico } = await supabase
    .from("medicos")
    .select("nombre_completo, especialidad")
    .eq("id", turno.medico_id)
    .single();

  return (
    <div className="min-h-full bg-[#f8f9fa]">
      <nav className="bg-white" style={{ borderBottom: "0.5px solid #e5e7eb" }}>
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-6">
          <span className="text-lg font-medium text-gray-900">Uber Doc</span>
          <a href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">Inicio</a>
        </div>
      </nav>

      <main className="mx-auto max-w-lg px-6 py-16">
        <EsperaTurno
          turnoId={turnoId}
          medicoNombre={medico?.nombre_completo ?? "Médico"}
          medicoEspecialidad={medico?.especialidad ?? ""}
          horaInicio={turno.hora_inicio}
        />
      </main>
    </div>
  );
}
