import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
    .select("id, especialidad, estado, medico_id")
    .eq("id", consultaId)
    .eq("paciente_id", user.id)
    .single();

  if (!consulta) {
    redirect("/clinica");
  }

  // Actualizar estado a en_curso
  if (consulta.estado === "aceptada") {
    await supabase
      .from("consultas")
      .update({ estado: "en_curso" })
      .eq("id", consultaId);
  }

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
            <span className="text-xl font-bold text-gray-900">Uber Doc</span>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-lg px-4 py-16">
        <div className="text-center">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-green-50">
            <span className="text-5xl">✅</span>
          </div>

          <h1 className="mt-6 text-2xl font-bold text-gray-900">
            ¡Pago confirmado!
          </h1>

          <p className="mt-2 text-gray-600">
            Tu consulta está lista para comenzar
          </p>
        </div>

        {medico && (
          <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Médico</span>
                <span className="font-medium text-gray-900">
                  {medico.nombre_completo}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Especialidad</span>
                <span className="font-medium text-gray-900">
                  {consulta.especialidad}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Duración</span>
                <span className="font-medium text-gray-900">
                  {medico.duracion_consulta} min
                </span>
              </div>
              <div className="border-t border-gray-100 pt-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Estado</span>
                  <span className="font-medium text-green-600">Pagada</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 space-y-3">
          <button className="w-full rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
            Iniciar videollamada
          </button>

          <Link
            href="/dashboard"
            className="block w-full rounded-xl border border-gray-300 px-6 py-3 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Volver al dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
