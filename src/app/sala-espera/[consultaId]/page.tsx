import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SalaEsperaCliente from "./SalaEsperaCliente";

export default async function SalaEsperaPage({
  params,
}: {
  params: Promise<{ consultaId: string }>;
}) {
  const { consultaId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Traer la consulta con datos del médico
  const { data: consulta, error } = await supabase
    .from("consultas")
    .select("id, especialidad, estado, created_at, medico_id")
    .eq("id", consultaId)
    .eq("paciente_id", user.id)
    .single();

  if (error || !consulta) {
    redirect("/clinica");
  }

  // Traer datos del médico
  const { data: medico } = await supabase
    .from("medicos")
    .select("id, nombre_completo, precio_consulta, duracion_consulta")
    .eq("id", consulta.medico_id)
    .single();

  if (!medico) {
    redirect("/clinica");
  }

  // Contar posición en la cola (consultas esperando antes que esta)
  const { count } = await supabase
    .from("consultas")
    .select("id", { count: "exact", head: true })
    .eq("medico_id", consulta.medico_id)
    .eq("estado", "esperando")
    .lt("created_at", consulta.created_at);

  const posicion = (count ?? 0) + 1;
  const tiempoEstimado = posicion * medico.duracion_consulta;

  return (
    <div className="min-h-full bg-gray-50">
      <nav className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🩺</span>
            <span className="text-xl font-bold text-gray-900">Uber Doc</span>
          </div>
          <Link
            href="/clinica"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Volver a la clínica
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-lg px-4 py-16">
        <SalaEsperaCliente
          consultaId={consulta.id}
          estado={consulta.estado}
          medicoNombre={medico.nombre_completo}
          precio={medico.precio_consulta}
          duracion={medico.duracion_consulta}
          especialidad={consulta.especialidad}
          posicion={posicion}
          tiempoEstimado={tiempoEstimado}
        />
      </main>
    </div>
  );
}
