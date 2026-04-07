import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EsperaVideo from "./EsperaVideo";

export default async function ConfirmacionPagoPage({
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

  // Verificar consulta del paciente
  const { data: consulta } = await supabase
    .from("consultas")
    .select("id, especialidad, estado, medico_id, sala_video_url")
    .eq("id", consultaId)
    .eq("paciente_id", user.id)
    .single();

  if (!consulta) {
    redirect("/clinica");
  }

  // Si el pago aún no fue confirmado por webhook, mostrar estado apropiado
  const pagoConfirmado = consulta.estado === "pagada" || consulta.estado === "en_curso";

  // Traer datos del médico
  const { data: medico } = await supabase
    .from("medicos")
    .select("nombre_completo, especialidad, duracion_consulta, precio_consulta")
    .eq("id", consulta.medico_id)
    .single();

  return (
    <div className="min-h-full bg-gray-50">
      <nav className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🩺</span>
            <span className="text-xl font-bold text-gray-900">Docto</span>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-lg px-4 py-16">
        <EsperaVideo
          consultaId={consultaId}
          salaVideoUrlInicial={consulta.sala_video_url}
          estadoInicial={consulta.estado}
          medicoNombre={medico?.nombre_completo ?? ""}
          especialidad={consulta.especialidad}
          duracionConsulta={medico?.duracion_consulta ?? 20}
        />

        <div className="mt-4">
          <Link
            href="/dashboard"
            className="block w-full rounded-xl border border-gray-300 px-6 py-3 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Volver al inicio
          </Link>
        </div>
      </main>
    </div>
  );
}
