import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CompletarConsulta from "./CompletarConsulta";

export default async function CompletarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: consultaId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  // Solo médicos
  const { data: medico } = await supabase
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!medico) redirect("/dashboard");

  const { data: consulta } = await supabase
    .from("consultas")
    .select("id, estado, especialidad, paciente_id, medico_id, motivo_consulta, sintomas, tiempo_sintomas")
    .eq("id", consultaId)
    .single();

  if (!consulta || consulta.medico_id !== medico.id) redirect("/dashboard");
  if (consulta.estado === "completada" || consulta.estado === "cancelada") redirect("/dashboard");

  const { data: paciente } = await supabase
    .from("pacientes")
    .select("nombre_completo, fecha_nacimiento, cuil")
    .eq("user_id", consulta.paciente_id)
    .single();

  return (
    <div className="min-h-full bg-[#f8f9fa]">
      <nav className="bg-white" style={{ borderBottom: "0.5px solid #e5e7eb" }}>
        <div className="mx-auto flex h-14 max-w-lg items-center px-6">
          <span className="text-lg font-medium text-gray-900">Uber Doc</span>
        </div>
      </nav>

      <CompletarConsulta
        consultaId={consultaId}
        medicoId={medico.id}
        consulta={{
          especialidad: consulta.especialidad,
          motivo_consulta: consulta.motivo_consulta,
          sintomas: consulta.sintomas,
          tiempo_sintomas: consulta.tiempo_sintomas,
          paciente_nombre: paciente?.nombre_completo ?? "Paciente",
          paciente_nacimiento: paciente?.fecha_nacimiento ?? null,
          paciente_cuil: paciente?.cuil ?? null,
          paciente_id: consulta.paciente_id,
        }}
      />
    </div>
  );
}
