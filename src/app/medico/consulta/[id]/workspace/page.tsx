import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import WorkspaceConsulta from "./WorkspaceConsulta";

export default async function WorkspacePage({
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
    .select("id, nombre_completo")
    .eq("user_id", user.id)
    .single();

  if (!medico) redirect("/dashboard");

  const { data: consulta } = await supabase
    .from("consultas")
    .select(
      "id, estado, especialidad, paciente_id, medico_id, motivo_consulta, sintomas, tiempo_sintomas, doc_borrador, created_at"
    )
    .eq("id", consultaId)
    .single();

  if (!consulta || consulta.medico_id !== medico.id) redirect("/dashboard");

  const estadosPermitidos = ["pagada", "en_curso"];
  if (!estadosPermitidos.includes(consulta.estado)) redirect("/dashboard");

  const { data: paciente } = await supabase
    .from("pacientes")
    .select("nombre_completo, fecha_nacimiento, cuil")
    .eq("user_id", consulta.paciente_id)
    .single();

  // Crear/obtener sala Daily.co + token
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  let dailyUrl: string | null = null;
  let dailyToken: string | null = null;
  let videoError: string | null = null;

  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const cookieHeader = cookieStore
      .getAll()
      .map((c: { name: string; value: string }) => `${c.name}=${c.value}`)
      .join("; ");

    const res = await fetch(`${baseUrl}/api/videollamada`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: cookieHeader,
      },
      body: JSON.stringify({ consultaId }),
    });
    const data = await res.json();

    if (data.url) {
      dailyUrl = data.url;
      dailyToken = data.token ?? null;
    } else {
      videoError = data.error || "No se pudo crear la sala de video.";
    }
  } catch {
    videoError = "Error al conectar con el servicio de video.";
  }

  // Si la sala se creó y el estado era "pagada", el endpoint ya lo cambió a "en_curso"
  const horaInicio = consulta.created_at;

  return (
    <WorkspaceConsulta
      consultaId={consultaId}
      medicoId={medico.id}
      dailyUrl={dailyUrl}
      dailyToken={dailyToken}
      videoError={videoError}
      horaInicio={horaInicio}
      consulta={{
        especialidad: consulta.especialidad,
        motivo_consulta: consulta.motivo_consulta,
        sintomas: consulta.sintomas,
        tiempo_sintomas: consulta.tiempo_sintomas,
        paciente_nombre: paciente?.nombre_completo ?? "Paciente",
        paciente_nacimiento: paciente?.fecha_nacimiento ?? null,
        paciente_cuil: paciente?.cuil ?? null,
        paciente_id: consulta.paciente_id,
        doc_borrador: consulta.doc_borrador ?? null,
      }}
    />
  );
}
