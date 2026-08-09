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

  // Nombre y título del médico. `titulo` ("Dr."/"Dra.") lo eligió el médico en su
  // registro y es lo único que evita tratar de "Dr." a una médica en la pantalla
  // que el paciente mira toda la consulta. Sumamos ESA columna y ninguna más: en
  // `medicos` hay columnas sin GRANT para `authenticated` y una sola de ellas
  // hace fallar la query entera en PostgREST, devolviendo null en silencio.
  const { data: medico } = await supabase
    .from("medicos")
    .select("nombre_completo, titulo")
    .eq("id", consulta.medico_id)
    .single();

  return (
    <SalaConsultaPaciente
      consultaId={consultaId}
      roomName={consulta.sala_video_url}
      // Sin texto de respaldo: `formatNombreMedico` capitaliza lo que reciba, así
      // que el viejo fallback "tu médico" llegaba al paciente como «Tu Médico»
      // ("Consulta con Tu Médico"). Mejor el nombre vacío —el componente lo
      // tolera— que un placeholder que se lee como el nombre del profesional.
      medicoNombre={medico?.nombre_completo ?? ""}
      medicoTitulo={medico?.titulo ?? null}
      especialidad={consulta.especialidad}
      horaInicio={consulta.en_curso_at ?? consulta.created_at}
    />
  );
}
