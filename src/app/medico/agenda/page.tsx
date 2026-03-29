import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ListaModelos from "./ListaModelos";
import FormularioModelo from "./FormularioModelo";
import PanelCalendario from "./PanelCalendario";

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ nuevo?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: medico } = await supabase
    .from("medicos")
    .select("id, duracion_consulta, precio_consulta")
    .eq("user_id", user.id)
    .single();
  if (!medico) redirect("/dashboard");

  const { data: modelos } = await supabase
    .from("agenda_modelos")
    .select("id, nombre, fecha_inicio, fecha_fin, activo, prioridad, created_at")
    .eq("medico_id", medico.id)
    .order("prioridad", { ascending: false });

  const modeloIds = (modelos ?? []).map((m) => m.id);
  const { data: franjas } = modeloIds.length > 0
    ? await supabase
        .from("agenda_franjas")
        .select("id, modelo_id, dia_semana, hora_inicio, hora_fin")
        .in("modelo_id", modeloIds)
    : { data: [] };

  type FranjaRow = { id: string; modelo_id: string; dia_semana: number; hora_inicio: string; hora_fin: string };
  const franjasPorModelo = new Map<string, FranjaRow[]>();
  for (const f of (franjas ?? []) as FranjaRow[]) {
    if (!franjasPorModelo.has(f.modelo_id)) franjasPorModelo.set(f.modelo_id, []);
    franjasPorModelo.get(f.modelo_id)!.push(f);
  }

  const modelosCompletos = (modelos ?? []).map((m) => ({
    ...m,
    franjas: franjasPorModelo.get(m.id) ?? [],
  }));

  const mostrarFormulario = params.nuevo === "1";

  return (
    <div className="min-h-full bg-[#f8f9fa]">
      <nav className="bg-white" style={{ borderBottom: "0.5px solid #e5e7eb" }}>
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <span className="text-lg font-medium text-gray-900">Uber Doc</span>
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
            Inicio
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-medium text-gray-900">Mi agenda</h1>
            <p className="mt-1 text-sm text-gray-500">
              Configurá tus modelos de disponibilidad para turnos programados
            </p>
          </div>
          {!mostrarFormulario && (
            <Link
              href="/medico/agenda?nuevo=1"
              className="rounded-lg bg-[#1D9E75] px-4 py-2 text-sm font-medium text-white hover:bg-[#178a64] active:scale-95 active:opacity-80 transition-all duration-100"
            >
              Nuevo modelo
            </Link>
          )}
        </div>

        {mostrarFormulario ? (
          <div className="mt-6">
            <FormularioModelo
              modelosExistentes={modelosCompletos}
              duracionConsulta={medico.duracion_consulta}
              precioConsulta={medico.precio_consulta}
            />
          </div>
        ) : (
          <div className="mt-6 gap-6 md:grid md:grid-cols-[1fr_400px]">
            {/* Columna izquierda — modelos */}
            <div className="space-y-4">
              <ListaModelos modelos={modelosCompletos} />
            </div>

            {/* Columna derecha — calendarios */}
            <div className="mt-6 md:mt-0">
              <PanelCalendario medicoId={medico.id} precio={medico.precio_consulta} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
