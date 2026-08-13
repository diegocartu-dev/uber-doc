import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rebotePaciente } from "@/lib/instancia";
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

  // En la instancia el paciente no tiene login: su salida es pedir el enlace.
  if (!user) redirect(rebotePaciente("/auth/login", "/acceso/reenviar"));

  // Verificar que el turno existe
  const { data: turno } = await supabase
    .from("turnos")
    .select("id, estado, sala_video_url, medico_id, paciente_id")
    .eq("id", turnoId)
    .single();

  if (!turno) redirect(rebotePaciente("/dashboard", "/acceso/reenviar"));

  // Verificar que el user es el paciente del turno
  const { data: paciente } = await supabase
    .from("pacientes")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!paciente || paciente.id !== turno.paciente_id)
    redirect(rebotePaciente("/dashboard", "/acceso/reenviar"));

  // Solo permitir acceso si el turno está en curso
  // El rebote del B2C es la sala de espera vieja, que a su vez rebota al
  // dashboard: recargar esta URL después de la consulta —lo que hace cualquiera
  // con mala señal— sacaba al paciente institucional del universo cerrado y lo
  // dejaba en el marketplace. En la instancia vuelve a SU pantalla.
  if (turno.estado !== "en_curso") {
    redirect(rebotePaciente(`/turno/${turnoId}/espera`, `/turno/${turnoId}/acceso`));
  }

  // Nombre, título y especialidad del médico. `titulo` ("Dr."/"Dra.") lo eligió el
  // médico en su registro y es lo único que evita tratar de "Dr." a una médica en
  // la pantalla que el paciente mira toda la consulta. Sumamos ESA columna y
  // ninguna más: en `medicos` hay columnas sin GRANT para `authenticated` y una
  // sola de ellas hace fallar la query entera en PostgREST, devolviendo null en
  // silencio.
  const { data: medico } = await supabase
    .from("medicos")
    .select("nombre_completo, titulo, especialidad")
    .eq("id", turno.medico_id)
    .single();

  return (
    <SalaConsultaPaciente
      consultaId={turnoId}
      roomName={turno.sala_video_url}
      // Sin texto de respaldo: `formatNombreMedico` capitaliza lo que reciba, así
      // que el viejo fallback "tu médico" llegaba al paciente como «Tu Médico»
      // ("Consulta con Tu Médico"). Mejor el nombre vacío —el componente lo
      // tolera— que un placeholder que se lee como el nombre del profesional.
      medicoNombre={medico?.nombre_completo ?? ""}
      medicoTitulo={medico?.titulo ?? null}
      especialidad={medico?.especialidad ?? ""}
      tipo="turno"
    />
  );
}
