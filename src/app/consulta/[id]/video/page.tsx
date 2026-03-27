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

  if (!user) {
    redirect("/auth/login");
  }

  // Verificar consulta
  const { data: consulta } = await supabase
    .from("consultas")
    .select("id, estado, especialidad, paciente_id, medico_id")
    .eq("id", consultaId)
    .single();

  if (!consulta) {
    console.log("[Video] Consulta no encontrada:", consultaId);
    redirect("/dashboard");
  }

  if (consulta.estado === "completada" || consulta.estado === "cancelada") {
    console.log("[Video] Consulta finalizada, estado:", consulta.estado);
    redirect("/dashboard");
  }

  // Pasar a en_curso si todavía no lo está
  if (consulta.estado !== "en_curso") {
    await supabase
      .from("consultas")
      .update({ estado: "en_curso" })
      .eq("id", consultaId);
  }

  // Verificar que es paciente o médico de esta consulta
  const { data: medico } = await supabase
    .from("medicos")
    .select("id, nombre_completo")
    .eq("user_id", user.id)
    .single();

  const esPaciente = consulta.paciente_id === user.id;
  const esMedico = medico?.id === consulta.medico_id;

  if (!esPaciente && !esMedico) {
    redirect("/dashboard");
  }

  // Traer nombre del otro participante
  let nombreOtro = "";
  if (esPaciente) {
    const { data: med } = await supabase
      .from("medicos")
      .select("nombre_completo")
      .eq("id", consulta.medico_id)
      .single();
    nombreOtro = med?.nombre_completo ?? "Médico";
  } else {
    const { data: pac } = await supabase
      .from("pacientes")
      .select("nombre_completo")
      .eq("user_id", consulta.paciente_id)
      .single();
    nombreOtro = pac?.nombre_completo ?? "Paciente";
  }

  return (
    <div className="flex flex-col bg-gray-900" style={{ height: "100vh" }}>
      <nav className="border-b border-gray-700 bg-gray-800">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🩺</span>
            <span className="text-lg font-bold text-white">Uber Doc</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-300">
              {consulta.especialidad} — {esPaciente ? `Dr. ${nombreOtro}` : nombreOtro}
            </span>
            <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
            <span className="text-xs text-green-400">En curso</span>
          </div>
        </div>
      </nav>

      <VideoLlamada consultaId={consultaId} />
    </div>
  );
}
