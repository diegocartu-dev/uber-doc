import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import VideoLlamada from "./VideoLlamada";

export default async function VideoPage({
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

  const { data: consulta } = await supabase
    .from("consultas")
    .select("id, estado, especialidad, paciente_id, medico_id, motivo_consulta, sintomas")
    .eq("id", consultaId)
    .single();

  if (!consulta) redirect("/dashboard");
  if (consulta.estado === "completada" || consulta.estado === "cancelada") redirect("/dashboard");

  if (consulta.estado !== "en_curso") {
    await supabase.from("consultas").update({ estado: "en_curso" }).eq("id", consultaId);
  }

  const { data: medicoData } = await supabase
    .from("medicos")
    .select("id, nombre_completo")
    .eq("user_id", user.id)
    .single();

  const esPaciente = consulta.paciente_id === user.id;
  const esMedico = medicoData?.id === consulta.medico_id;

  if (!esPaciente && !esMedico) redirect("/dashboard");

  // Traer datos del paciente
  const { data: paciente } = await supabase
    .from("pacientes")
    .select("nombre_completo, fecha_nacimiento")
    .eq("user_id", consulta.paciente_id)
    .single();

  // Traer nombre del médico
  const { data: medico } = await supabase
    .from("medicos")
    .select("nombre_completo")
    .eq("id", consulta.medico_id)
    .single();

  return (
    <div className="flex flex-col bg-gray-900" style={{ height: "100vh" }}>
      <VideoLlamada
        consultaId={consultaId}
        esMedico={esMedico}
        consulta={{
          especialidad: consulta.especialidad,
          motivo_consulta: consulta.motivo_consulta,
          sintomas: consulta.sintomas,
          paciente_nombre: paciente?.nombre_completo ?? "Paciente",
          paciente_nacimiento: paciente?.fecha_nacimiento ?? null,
          medico_nombre: medico?.nombre_completo ?? "Médico",
        }}
      />
    </div>
  );
}
