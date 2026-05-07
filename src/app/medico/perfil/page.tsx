export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppNavbar from "@/components/AppNavbar";
import NovaToggle from "./NovaToggle";

export default async function PerfilMedicoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: medico } = await supabase
    .from("medicos")
    .select("id, nombre_completo, especialidad, numero_matricula, tipo_matricula, email, provincia, precio_consulta, duracion_consulta, modalidad_atencion, nova_evolucion_activa")
    .eq("user_id", user.id)
    .single();

  if (!medico) redirect("/dashboard");

  return (
    <div className="min-h-full bg-[#f8f9fa]">
      <AppNavbar userName={medico.nombre_completo} userRole="medico" />

      <main className="mx-auto max-w-2xl px-6 py-8">
        <p className="text-xs font-medium tracking-wide text-gray-400">MI PERFIL</p>
        <p className="mt-3 text-2xl font-medium text-gray-900">{medico.nombre_completo}</p>
        <p className="mt-1 text-sm text-gray-500">{medico.especialidad}</p>

        <div
          className="mt-6 rounded-xl bg-white p-6"
          style={{ border: "0.5px solid #e5e7eb" }}
        >
          <p className="text-xs font-medium tracking-wide text-gray-400">DATOS PROFESIONALES</p>
          <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs text-gray-400">Matrícula</p>
              <p className="mt-0.5 text-gray-700">{medico.tipo_matricula} {medico.numero_matricula}</p>
            </div>
            {medico.provincia && (
              <div>
                <p className="text-xs text-gray-400">Provincia</p>
                <p className="mt-0.5 text-gray-700">{medico.provincia}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-400">Email</p>
              <p className="mt-0.5 text-gray-700">{medico.email}</p>
            </div>
            {medico.precio_consulta && (
              <div>
                <p className="text-xs text-gray-400">Precio consulta</p>
                <p className="mt-0.5 text-gray-700">${medico.precio_consulta}</p>
              </div>
            )}
            {medico.duracion_consulta && (
              <div>
                <p className="text-xs text-gray-400">Duración</p>
                <p className="mt-0.5 text-gray-700">{medico.duracion_consulta} min</p>
              </div>
            )}
            {medico.modalidad_atencion && (
              <div>
                <p className="text-xs text-gray-400">Modalidad</p>
                <p className="mt-0.5 text-gray-700 capitalize">{medico.modalidad_atencion}</p>
              </div>
            )}
          </div>
        </div>

        <div
          className="mt-6 rounded-xl bg-white p-6"
          style={{ border: "0.5px solid #e5e7eb" }}
        >
          <NovaToggle medicoId={medico.id} initialValue={medico.nova_evolucion_activa ?? false} />
        </div>
      </main>
    </div>
  );
}
