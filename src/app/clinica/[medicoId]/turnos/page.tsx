import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CalendarioTurnos from "./CalendarioTurnos";
import { capitalizarNombre } from "@/lib/utils/texto";
import { obtenerCreditosPendientes } from "@/lib/cancelaciones";

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

  const { data: perfilPac } = await supabase
    .from("pacientes")
    .select("nombre_completo, dni, fecha_nacimiento, sexo_dni")
    .eq("user_id", user.id)
    .maybeSingle();

  const perfilCompleto =
    perfilPac?.nombre_completo?.trim() &&
    perfilPac?.dni?.trim() &&
    perfilPac?.fecha_nacimiento &&
    perfilPac?.sexo_dni;

  if (!perfilCompleto) {
    redirect(`/onboarding?redirectTo=/clinica/${medicoId}/turnos${sp.canal ? `?canal=${sp.canal}` : ""}`);
  }

  const { data: medico } = await supabase
    .from("medicos")
    .select("id, nombre_completo, especialidad, precio_consulta, duracion_consulta")
    .eq("id", medicoId)
    .single();

  if (!medico) redirect("/clinica");

  // Detectar créditos pendientes por DB
  const { data: paciente } = await supabase
    .from("pacientes").select("id").eq("user_id", user.id).maybeSingle();
  const creditos = paciente
    ? await obtenerCreditosPendientes(paciente.id, medicoId)
    : [];
  const credito = creditos.length > 0 ? creditos[0] : null;

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
          <p className="text-xs font-medium tracking-wide text-gray-400">
            {credito ? "REPROGRAMAR TURNO" : "AGENDAR TURNO"}
          </p>
          <p className="mt-2 text-lg font-medium text-gray-900">Dr. {capitalizarNombre(medico.nombre_completo)}</p>
          <p className="mt-0.5 text-sm text-gray-500">
            {medico.especialidad} · {medico.duracion_consulta} min · ${medico.precio_consulta?.toLocaleString("es-AR")}
          </p>
        </div>

        <CalendarioTurnos
          turnos={turnos ?? []}
          medico={{
            id: medico.id,
            nombre: capitalizarNombre(medico.nombre_completo),
            especialidad: medico.especialidad,
            duracion: medico.duracion_consulta,
            precio: medico.precio_consulta,
          }}
          canalOrigen={canalOrigen}
          credito={credito}
        />
      </main>
    </div>
  );
}
