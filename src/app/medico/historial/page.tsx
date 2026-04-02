import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminConsultas from "@/app/dashboard/AdminConsultas";

export default async function HistorialPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: medico } = await supabase
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!medico) redirect("/dashboard");

  const fullName = user.user_metadata?.full_name || user.email;

  // Fetch pacientes helper
  async function fetchPacientes(ids: string[]) {
    if (ids.length === 0) return new Map<string, { id: string; nombre: string }>();
    const { data: pacs } = await supabase
      .from("pacientes")
      .select("id, user_id, nombre_completo")
      .in("user_id", ids);
    return new Map(
      (pacs ?? []).map((p) => [p.user_id, { id: p.id, nombre: p.nombre_completo }])
    );
  }

  // Todas las consultas del médico
  const { data: todas } = await supabase
    .from("consultas")
    .select("id, especialidad, estado, created_at, paciente_id, medico_id, motivo_consulta, sintomas, sala_video_url")
    .eq("medico_id", medico.id)
    .order("created_at", { ascending: false });

  let consultas: {
    id: string; especialidad: string; estado: string; created_at: string;
    motivo_consulta: string | null; sintomas: string[] | null; sala_video_url: string | null;
    paciente_nombre: string; paciente_tabla_id: string | null; medico_nombre: string;
  }[] = [];

  if (todas && todas.length > 0) {
    const pacMap = await fetchPacientes([...new Set(todas.map((c) => c.paciente_id))]);
    consultas = todas.map((c) => ({
      id: c.id, especialidad: c.especialidad, estado: c.estado, created_at: c.created_at,
      motivo_consulta: c.motivo_consulta, sintomas: c.sintomas, sala_video_url: c.sala_video_url,
      paciente_nombre: pacMap.get(c.paciente_id)?.nombre ?? "—",
      paciente_tabla_id: pacMap.get(c.paciente_id)?.id ?? null,
      medico_nombre: fullName,
    }));
  }

  return (
    <div className="min-h-full bg-[#f8f9fa]">
      <nav className="bg-white" style={{ borderBottom: "0.5px solid #e5e7eb" }}>
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <a href="/dashboard" className="text-lg font-medium text-gray-900">Uber Doc</a>
            <span className="text-lg text-gray-300">/</span>
            <span className="text-lg font-medium text-gray-500">Historial</span>
          </div>
          <a href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">Dashboard</a>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-6 py-6">
        <AdminConsultas consultas={consultas} medicoId={medico.id} />
      </main>
    </div>
  );
}
