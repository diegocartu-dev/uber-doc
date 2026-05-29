import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SalaConsultaPaciente from "./SalaConsultaPaciente";

export default async function SalaPage({
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

  // Verificar que la consulta existe y el user es el paciente
  const { data: consulta } = await supabase
    .from("consultas")
    .select("id, estado, sala_video_url, medico_id, especialidad, paciente_id, en_curso_at, created_at")
    .eq("id", consultaId)
    .eq("paciente_id", user.id)
    .single();

  if (!consulta) redirect("/dashboard");

  // Solo permitir acceso si la consulta está en curso
  if (consulta.estado !== "en_curso") {
    redirect(`/consulta/${consultaId}/confirmacion`);
  }

  // Fetch nombre del médico
  const { data: medico } = await supabase
    .from("medicos")
    .select("nombre_completo")
    .eq("id", consulta.medico_id)
    .single();

  return (
    <SalaConsultaPaciente
      consultaId={consultaId}
      roomName={consulta.sala_video_url}
      medicoNombre={medico?.nombre_completo ?? "tu médico"}
      especialidad={consulta.especialidad}
      horaInicio={consulta.en_curso_at ?? consulta.created_at}
    />
  );
}
