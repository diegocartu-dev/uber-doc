import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SalaConsultaPaciente from "@/app/consulta/[id]/sala/SalaConsultaPaciente";

export default async function SalaTurnoPage({
  params,
}: {
  params: Promise<{ turnoId: string }>;
}) {
  const { turnoId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  // Verificar que el turno existe
  const { data: turno } = await supabase
    .from("turnos")
    .select("id, estado, sala_video_url, medico_id, paciente_id")
    .eq("id", turnoId)
    .single();

  if (!turno) redirect("/dashboard");

  // Verificar que el user es el paciente del turno
  const { data: paciente } = await supabase
    .from("pacientes")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!paciente || paciente.id !== turno.paciente_id) redirect("/dashboard");

  // Solo permitir acceso si el turno está en curso
  if (turno.estado !== "en_curso") {
    redirect(`/turno/${turnoId}/espera`);
  }

  // Fetch nombre del médico
  const { data: medico } = await supabase
    .from("medicos")
    .select("nombre_completo, especialidad")
    .eq("id", turno.medico_id)
    .single();

  return (
    <SalaConsultaPaciente
      consultaId={turnoId}
      roomName={turno.sala_video_url}
      medicoNombre={medico?.nombre_completo ?? "tu médico"}
      especialidad={medico?.especialidad ?? ""}
      tipo="turno"
    />
  );
}
