import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import AppNavbar from "@/components/AppNavbar";
import GrillaEspecialidades from "./GrillaEspecialidades";
import { getFlag } from "@/lib/feature-flags";
import { identidadHabilitada } from "@/lib/perfil-medico";
import { guardRutaPaciente } from "@/lib/auth/rol";

export default async function ClinicaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Esta es una ruta de PACIENTE: si entra un médico → /dashboard, un admin → /admin.
  // El paciente (y el usuario nuevo en onboarding) pasa.
  await guardRutaPaciente(supabase, user.id);

  const { data: paciente } = await supabase
    .from("pacientes")
    .select("nombre_completo, dni, fecha_nacimiento, sexo_dni, es_cuenta_test")
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
  // Carril de prueba (universos paralelos): un paciente test ve SOLO médicos test, y
  // un paciente real SOLO médicos reales. Nunca se cruzan. Los reportes ya excluyen test.
  const esPacienteTest = paciente?.es_cuenta_test === true;

  const flagIdentidadGate = await getFlag("identidad_gate_activa");
  // Decisión Diego (22/06): NO ocultar a los médicos no validados (gate de identidad).
  // Se traen TODOS los aprobados/visibles y se marca `habilitadoIdentidad`. La grilla
  // muestra a los no habilitados GRISADOS / no reservables (en vez de esconderlos), para
  // que el paciente perciba la oferta y el médico tenga incentivo a validarse. El candado
  // real ya vive en la RESERVA (crearConsulta + reservarTurno bloquean server-side a un
  // no-validado, incluso por deep-link), así que mostrarlos en el listado no abre agujero.
  const { data: medicosRaw } = await supabase
    .from("medicos")
    .select("id, especialidad, modalidad_atencion, nombre_completo, disponible, disponible_desde, disponible_hasta, disponible_desde_at, precio_consulta, duracion_consulta, foto_url, identidad_validada, biometria_exenta, es_cuenta_test")
    .eq("oculto_clinica", false)
    .eq("verificado", true)
    .eq("estado_registro", "aprobado")
    .eq("es_cuenta_test", esPacienteTest);
  const medicos = (medicosRaw ?? []).map(
    ({ identidad_validada, biometria_exenta, es_cuenta_test, ...m }) => ({
      ...m,
      // Reservable según el gate: si el gate está apagado, todos; si está activo, solo
      // validados/exentos/test. Misma fuente de verdad que el guard de reserva.
      habilitadoIdentidad: !flagIdentidadGate || identidadHabilitada({ identidad_validada, biometria_exenta, es_cuenta_test }),
    })
  );

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

  // Médicos con un turno RESERVADO activo ahora (en_espera/en_curso, hoy en adelante):
  // para que el semáforo diga "En consulta" en vez de "Sin espera" cuando el médico está
  // ocupado con un turno. NO cambia la reservabilidad (sigue reservable — decisión 30/06).
  // Solo medico_id agregado, con admin client (igual criterio que consultasEspera).
  const { data: turnosActivos } = await supabaseAdmin
    .from("turnos")
    .select("medico_id")
    .in("estado", ["en_espera", "en_curso"])
    .gte("fecha", hoy);
  const medicosEnTurno = [...new Set((turnosActivos ?? []).map((t) => t.medico_id).filter(Boolean))];

  // R2 (decisión Diego 30/06): la CI NO se ofrece en el bloque horario de un turno
  // RESERVADO (confirmado/en_espera/en_curso), ni 30 min antes ni después — el turno
  // programado tiene prioridad. Solo turnos con paciente (no slots vacíos). Se computa
  // server-side con la hora AR: un médico cuyo AHORA cae dentro de [inicio-30, fin+30] de
  // algún turno reservado de hoy queda NO reservable para CI (ver puedeAtenderAhora).
  const { data: turnosReservadosHoy } = await supabaseAdmin
    .from("turnos")
    .select("medico_id, hora_inicio, hora_fin")
    .in("estado", ["confirmado", "en_espera", "en_curso"])
    .eq("fecha", hoy);
  const aMin = (h: string) => { const [a, b] = h.split(":").map(Number); return a * 60 + b; };
  const ahoraMin = ahoraAR.getHours() * 60 + ahoraAR.getMinutes();
  const GRACIA_TURNO_MIN = 30;
  const medicosCiBloqueada = new Set<string>();
  for (const t of turnosReservadosHoy ?? []) {
    if (!t.medico_id || !t.hora_inicio || !t.hora_fin) continue;
    if (ahoraMin >= aMin(t.hora_inicio) - GRACIA_TURNO_MIN && ahoraMin <= aMin(t.hora_fin) + GRACIA_TURNO_MIN) {
      medicosCiBloqueada.add(t.medico_id);
    }
  }
  const medicosConEstado = medicos.map((m) => ({ ...m, ciBloqueadaPorTurno: medicosCiBloqueada.has(m.id) }));

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
          medicos={medicosConEstado}
          consultasEspera={consultasEspera ?? []}
          turnosClinicaVirtual={turnosDisponibles ?? []}
          medicosEnTurno={medicosEnTurno}
          flagCiActiva={await getFlag("consulta_inmediata_global")}
          flagTurnosActivos={await getFlag("turnos_global")}
        />
      </main>
    </div>
  );
}
