import LinkNav from "@/components/ui/LinkNav";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ListaModelos from "./ListaModelos";
import FormularioModelo from "./FormularioModelo";
import PanelDerecho from "./PanelDerecho";
import AppNavbar from "@/components/AppNavbar";
import { getFlag } from "@/lib/feature-flags";

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ nuevo?: string; canal?: string }>;
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

  const fullName = user.user_metadata?.full_name || user.email;

  const { data: modelos } = await supabase
    .from("agenda_modelos")
    .select("id, nombre, fecha_inicio, fecha_fin, activo, prioridad, canal_origen, duracion_turno, precio, created_at")
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
  // Modelo B: el canal viene del punto de entrada (?canal=consultorio_privado
  // desde la pantalla del consultorio particular); default clínica virtual.
  const canalNuevo = params.canal === "consultorio_privado" ? "consultorio_privado" as const : "clinica_virtual" as const;

  return (
    <div className="flex flex-col min-h-screen md:h-screen md:overflow-hidden">
      <AppNavbar userName={fullName} userRole="medico" />
      <div className="flex flex-1 flex-col md:grid md:grid-cols-[40fr_60fr] md:overflow-hidden">
      {/*
        Mobile: flex-col apilado — PanelDerecho primero (agenda), luego modelos
        Desktop: grid 2 columnas — modelos izquierda, agenda derecha (order classes)
      */}

      {/*
        Panel calendario/grilla — mobile primero, desktop segundo (order-2).
        Al crear agenda (?nuevo=1) se oculta en MOBILE para que el formulario
        ocupe la pantalla desde arriba: el botón "+ Nueva agenda" deja al médico
        parado en la pantalla de crear, sin scroll ni saltos (decisión Sofía).
        En desktop se conserva el split (ahí no molesta y el form va al costado).
      */}
      <div className={`${mostrarFormulario ? "hidden md:block " : ""}order-1 md:order-2 overflow-y-auto bg-[#f8f9fa] md:border-l md:border-gray-200`}>
        <div className="p-4 md:p-6">
          <PanelDerecho medicoId={medico.id} precio={medico.precio_consulta} flagNovaAi={await getFlag("nova_ai")} />
        </div>
      </div>

      {/* Panel modelos — mobile segundo, desktop primero (order-1) */}
      <div className="order-2 md:order-1 overflow-y-auto">
        <div className="p-4 md:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[20px] md:text-[22px] font-semibold text-gray-900">Mi agenda</h1>
              <p className="mt-1 text-[13px] text-gray-500">Mis agendas</p>
            </div>
          </div>

          {mostrarFormulario ? (
            <div className="mt-6">
              {/* Modelo B: precio/duración son POR AGENDA, nada se hereda del perfil */}
              <FormularioModelo canal={canalNuevo} />
            </div>
          ) : (
            <div className="mt-6">
              <LinkNav
                href="/medico/agenda?nuevo=1"
                className="mb-4 w-full justify-center rounded-xl bg-[#378ADD] px-5 min-h-[48px] md:min-h-0 md:py-3 text-center text-[14px] font-medium text-white hover:bg-[#2e6fb5]"
              >
                + Nueva agenda
              </LinkNav>

              <div className="space-y-4">
                <ListaModelos modelos={modelosCompletos} />
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
