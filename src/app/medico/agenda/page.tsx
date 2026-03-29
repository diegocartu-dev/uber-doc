import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ListaModelos from "./ListaModelos";
import FormularioModelo from "./FormularioModelo";
import PanelDerecho from "./PanelDerecho";

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
    .order("created_at", { ascending: false });

  const modeloIds = (modelos ?? []).map((m) => m.id);
  const { data: franjas } = modeloIds.length > 0
    ? await supabase.from("agenda_franjas").select("id, modelo_id, dia_semana, hora_inicio, hora_fin").in("modelo_id", modeloIds)
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
    <div className="grid h-screen overflow-hidden" style={{ gridTemplateColumns: "60fr 40fr" }}>
      {/* Columna izquierda — modelos */}
      <div className="overflow-y-auto p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-medium text-gray-900">Mi agenda</h1>
            <p className="mt-1 text-sm text-gray-500">Modelos de disponibilidad para turnos programados</p>
          </div>
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">Inicio</Link>
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
          <div className="mt-6 space-y-3">
            <ListaModelos modelos={modelosCompletos} />
            <Link
              href="/medico/agenda?nuevo=1"
              className="block rounded-xl bg-white p-4 text-center text-sm text-gray-500 hover:bg-gray-50 active:scale-95 transition-all duration-100"
              style={{ border: "0.5px solid #e5e7eb" }}
            >
              + Nuevo modelo de agenda
            </Link>
          </div>
        )}
      </div>

      {/* Columna derecha — calendarios */}
      <div className="overflow-y-auto bg-[#f8f9fa] p-6" style={{ borderLeft: "0.5px solid #e5e7eb" }}>
        <PanelDerecho medicoId={medico.id} precio={medico.precio_consulta} />
      </div>
    </div>
  );
}
