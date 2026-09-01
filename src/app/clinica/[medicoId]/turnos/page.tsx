import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CalendarioTurnos from "./CalendarioTurnos";
import { capitalizarNombre, formatNombreMedico } from "@/lib/utils/texto";
import { identidadHabilitada } from "@/lib/perfil-medico";
import { guardRutaPaciente } from "@/lib/auth/rol";

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
  const fromUrl = sp.from && sp.from.startsWith("/") && !sp.from.startsWith("//") && !sp.from.includes("://") ? sp.from : null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Ruta de PACIENTE (reserva de turno): médico → /dashboard, admin → /admin.
  await guardRutaPaciente(supabase, user.id);

  const { data: paciente } = await supabase
    .from("pacientes")
    .select("id, nombre_completo, dni, fecha_nacimiento, sexo_dni")
    .eq("user_id", user.id)
    .maybeSingle();

  const perfilCompleto =
    paciente?.nombre_completo?.trim() &&
    paciente?.dni?.trim() &&
    paciente?.fecha_nacimiento &&
    paciente?.sexo_dni;

  if (!perfilCompleto) {
    redirect(`/onboarding?redirectTo=/clinica/${medicoId}/turnos${sp.canal ? `?canal=${sp.canal}` : ""}`);
  }

  const { data: medico } = await supabase
    .from("medicos")
    // `titulo` ("Dr."/"Dra.") lo elige el médico en su registro: sin él, el paciente
    // ve el nombre pelado (o peor, el "Dr." que se inventaba antes). Tiene GRANT para
    // authenticated, así que suma sin riesgo de tirar la query entera.
    .select("id, nombre_completo, titulo, especialidad, precio_consulta, duracion_consulta, identidad_validada, biometria_exenta, es_cuenta_test, visible_consultorio_particular")
    .eq("id", medicoId)
    .single();

  // Gate de identidad (Didit): con el flag activo, no mostrar el calendario de un
  // médico sin validar (consistencia con las otras puertas de visibilidad).
  const { getFlag } = await import("@/lib/feature-flags");
  if (!medico || ((await getFlag("identidad_gate_activa")) && !identidadHabilitada(medico))) redirect("/clinica");

  // Agenda despublicada por no-show (T8): el calendario tampoco se ve por URL
  // directa. SERVICE ROLE en query aparte: la columna no tiene GRANT y sumarla
  // al SELECT de arriba (cliente RLS) rompería la query entera (outage 22/06).
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { data: pausaRow } = await createAdminClient()
    .from("medicos").select("agenda_pausada_at").eq("id", medicoId).maybeSingle();
  if (pausaRow?.agenda_pausada_at) redirect("/clinica");

  // Enforcement del canal privado (Roberto, gate 15/07): consultorio apagado =
  // su calendario privado tampoco se ve por URL directa.
  if (canalOrigen === "consultorio_privado" && medico.visible_consultorio_particular === false) {
    redirect("/clinica");
  }

  // Traer turnos disponibles futuros (fecha en ART, no UTC)
  const ahoraAR = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const hoy = `${ahoraAR.getFullYear()}-${(ahoraAR.getMonth() + 1).toString().padStart(2, "0")}-${ahoraAR.getDate().toString().padStart(2, "0")}`;
  const { data: turnosRaw } = await supabase
    .from("turnos")
    .select("id, fecha, hora_inicio, hora_fin, monto")
    .eq("medico_id", medicoId)
    .eq("estado", "disponible")
    .eq("canal_origen", canalOrigen)
    .gte("fecha", hoy)
    .order("fecha", { ascending: true })
    .order("hora_inicio", { ascending: true });

  // Los slots de HOY ya empezados (o por empezar en <15 min) no se ofrecen — server-side
  // con hora AR, mismo margen que valida reservarTurno (incidente 08/07: un slot de las
  // 11:40 se compraba a las 11:38). El cliente re-filtra por frescura, pero la verdad es esta.
  const MARGEN_MIN = 15;
  const corteMin = ahoraAR.getHours() * 60 + ahoraAR.getMinutes() + MARGEN_MIN;
  const turnos = (turnosRaw ?? []).filter((t) => {
    if (t.fecha !== hoy) return true;
    const [h, m] = (t.hora_inicio ?? "00:00").split(":").map(Number);
    return h * 60 + m > corteMin;
  });

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
            AGENDAR TURNO
          </p>
          <p className="mt-2 text-lg font-medium text-gray-900">{formatNombreMedico(medico.nombre_completo, medico.titulo)}</p>
          {/* Modelo B: duración/precio del PERFIL pueden ser NULL (viven por agenda;
              cada slot muestra su monto real en el calendario). Solo se muestran si existen. */}
          <p className="mt-0.5 text-sm text-gray-500">
            {medico.especialidad}
            {medico.duracion_consulta ? ` · ${medico.duracion_consulta} min` : ""}
            {medico.precio_consulta ? ` · desde $${Number(medico.precio_consulta).toLocaleString("es-AR")}` : ""}
          </p>
        </div>

        <CalendarioTurnos
          turnos={turnos ?? []}
          medico={{
            id: medico.id,
            nombre: capitalizarNombre(medico.nombre_completo),
            titulo: medico.titulo,
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
