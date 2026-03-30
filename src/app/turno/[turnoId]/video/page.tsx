import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import VideoLlamada from "@/app/consulta/[id]/video/VideoLlamada";

export default async function VideoTurnoPage({
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
    .select("id, estado, medico_id, paciente_id, sala_video_url, hora_inicio")
    .eq("id", turnoId)
    .single();

  if (!turno) redirect("/dashboard");
  if (turno.estado === "completado" || turno.estado === "cancelado_paciente" || turno.estado === "cancelado_medico") redirect("/dashboard");

  if (turno.estado !== "en_curso") {
    await supabase.from("turnos").update({ estado: "en_curso", iniciado_en: new Date().toISOString() }).eq("id", turnoId);
  }

  // Verificar participante
  const { data: medicoData } = await supabase
    .from("medicos").select("id, nombre_completo, especialidad").eq("user_id", user.id).maybeSingle();

  const esPaciente = turno.paciente_id !== null;
  const esMedico = medicoData?.id === turno.medico_id;

  if (!esPaciente && !esMedico) redirect("/dashboard");

  // Traer datos del paciente
  const { data: paciente } = await supabase
    .from("pacientes").select("nombre_completo, fecha_nacimiento, cuil")
    .eq("id", turno.paciente_id).maybeSingle();

  // Traer nombre del médico
  const { data: medico } = await supabase
    .from("medicos").select("nombre_completo, domicilio")
    .eq("id", turno.medico_id).single();

  return (
    <div className="flex flex-col bg-gray-900" style={{ height: "100vh" }}>
      <VideoLlamada
        consultaId={turnoId}
        esMedico={esMedico}
        apiEndpoint="/api/videollamada-turno"
        consulta={{
          especialidad: medicoData?.especialidad ?? "",
          motivo_consulta: null,
          sintomas: null,
          tiempo_sintomas: null,
          paciente_nombre: paciente?.nombre_completo ?? "Paciente",
          paciente_nacimiento: paciente?.fecha_nacimiento ?? null,
          paciente_cuil: paciente?.cuil ?? null,
          medico_nombre: medico?.nombre_completo ?? "Médico",
          medico_domicilio: medico?.domicilio ?? null,
        }}
      />
    </div>
  );
}
