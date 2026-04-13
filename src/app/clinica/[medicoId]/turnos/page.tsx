import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CalendarioTurnos from "./CalendarioTurnos";

export default async function TurnosPage({
  params,
  searchParams,
}: {
  params: Promise<{ medicoId: string }>;
  searchParams: Promise<{ canal?: string; from?: string }>;
}) {
  const { medicoId } = await params;
  const sp = await searchParams;
  const canalOrigen = sp.canal === "consultorio_privado" ? "consultorio_privado" as const : "clinica_virtual" as const;
  const fromUrl = sp.from;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: medico } = await supabase
    .from("medicos")
    .select("id, nombre_completo, especialidad, precio_consulta, duracion_consulta")
    .eq("id", medicoId)
    .single();

  if (!medico) redirect("/clinica");

  // Traer turnos disponibles futuros
  const hoy = new Date().toISOString().split("T")[0];
  const { data: turnos } = await supabase
    .from("turnos")
    .select("id, fecha, hora_inicio, hora_fin, monto")
    .eq("medico_id", medicoId)
    .eq("estado", "disponible")
    .eq("canal_origen", canalOrigen)
    .gte("fecha", hoy)
    .order("fecha", { ascending: true })
    .order("hora_inicio", { ascending: true });

  return (
    <div className="min-h-full bg-[#f8f9fa]">
      <nav className="bg-white" style={{ borderBottom: "0.5px solid #e5e7eb" }}>
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-6">
          <span className="text-lg font-medium text-gray-900">Docto</span>
          <a href={fromUrl ?? "/clinica"} className="text-sm text-gray-500 hover:text-gray-700">Volver</a>
        </div>
      </nav>

      <main className="mx-auto max-w-lg px-6 py-8">
        <div>
          <p className="text-xs font-medium tracking-wide text-gray-400">AGENDAR TURNO</p>
          <p className="mt-2 text-lg font-medium text-gray-900">Dr. {medico.nombre_completo}</p>
          <p className="mt-0.5 text-sm text-gray-500">
            {medico.especialidad} · {medico.duracion_consulta} min · ${medico.precio_consulta?.toLocaleString("es-AR")}
          </p>
        </div>

        <CalendarioTurnos
          turnos={turnos ?? []}
          medico={{
            id: medico.id,
            nombre: medico.nombre_completo,
            especialidad: medico.especialidad,
            duracion: medico.duracion_consulta,
            precio: medico.precio_consulta,
          }}
          canalOrigen={canalOrigen}
        />
      </main>
    </div>
  );
}
