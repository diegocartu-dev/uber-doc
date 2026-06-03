import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import AppNavbar from "@/components/AppNavbar";
import GrillaEspecialidades from "./GrillaEspecialidades";
import { getFlag } from "@/lib/feature-flags";

export default async function ClinicaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: paciente } = await supabase
    .from("pacientes")
    .select("nombre_completo, dni, fecha_nacimiento, sexo_dni")
    .eq("user_id", user.id)
    .maybeSingle();

  if (paciente !== null) {
    const perfilCompleto =
      paciente?.nombre_completo?.trim() &&
      paciente?.dni?.trim() &&
      paciente?.fecha_nacimiento &&
      paciente?.sexo_dni;
    if (!perfilCompleto) redirect("/onboarding?redirectTo=/clinica");
  }

  const fullName = user.user_metadata?.full_name || user.email;

  // Gate de identidad (Didit): con el flag activo, un médico sin identidad
  // validada no aparece en la clínica. Mismo chokepoint que verificado+aprobado.
  const flagIdentidadGate = await getFlag("identidad_gate_activa");
  let medicosQuery = supabase
    .from("medicos")
    .select("id, especialidad, modalidad_atencion, nombre_completo, disponible, disponible_desde, disponible_hasta, disponible_desde_at, precio_consulta, duracion_consulta, foto_url")
    .eq("oculto_clinica", false)
    .eq("verificado", true)
    .eq("estado_registro", "aprobado")
    .eq("es_cuenta_test", false);
  if (flagIdentidadGate) medicosQuery = medicosQuery.eq("identidad_validada", true);
  const { data: medicos } = await medicosQuery;

  // Turnos disponibles en clínica virtual: traemos fecha + hora_inicio para poder
  // ordenar los médicos por "turno libre más cercano" (decisión §11.2). Mismo
  // filtro que ya andaba en producción (estado disponible, canal clinica_virtual,
  // fecha >= hoy); solo se amplían las columnas seleccionadas de la misma tabla.
  const ahoraAR = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const hoy = `${ahoraAR.getFullYear()}-${(ahoraAR.getMonth() + 1).toString().padStart(2, "0")}-${ahoraAR.getDate().toString().padStart(2, "0")}`;
  const { data: turnosDisponibles } = await supabase
    .from("turnos")
    .select("medico_id, fecha, hora_inicio")
    .eq("estado", "disponible")
    .eq("canal_origen", "clinica_virtual")
    .gte("fecha", hoy)
    .order("fecha", { ascending: true })
    .order("hora_inicio", { ascending: true })
    .limit(500);

  // Cola en espera por médico (decisión §11.3): "pacientes en sala de espera
  // INCLUYENDO al que está siendo atendido" = consultas en estado esperando +
  // en_curso. La RLS de `consultas` solo deja al paciente ver SUS propias
  // consultas (auth.uid() = paciente_id), por lo que con el client del paciente
  // este conteo daría siempre ~0. Usamos admin client para leer el AGREGADO real
  // de la cola: solo se selecciona medico_id (un número por médico), NUNCA datos
  // ni identidad de otros pacientes. Server-side, el service role no sale al cliente.
  const supabaseAdmin = createAdminClient();
  const { data: consultasEspera } = await supabaseAdmin
    .from("consultas")
    .select("medico_id")
    .in("estado", ["esperando", "en_curso"]);

  return (
    <div className="min-h-full" style={{ backgroundColor: "var(--color-bg-secondary)" }}>
      <AppNavbar userName={fullName} userRole="paciente" />

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Clínica Virtual</h1>
          <p className="mt-2 text-gray-600">
            Elegí una especialidad para consultar con un médico.
          </p>
        </div>

        <GrillaEspecialidades
          medicos={medicos ?? []}
          consultasEspera={consultasEspera ?? []}
          turnosClinicaVirtual={turnosDisponibles ?? []}
          flagCiActiva={await getFlag("consulta_inmediata_global")}
          flagTurnosActivos={await getFlag("turnos_global")}
        />
      </main>
    </div>
  );
}
