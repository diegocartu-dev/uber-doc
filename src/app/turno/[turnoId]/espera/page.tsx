import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rebotePaciente, esInstitucional } from "@/lib/instancia";
import { entrarSalaEspera } from "@/app/clinica/[medicoId]/turnos/actions";
import EsperaTurno from "./EsperaTurno";
import DoctoLogo from "@/components/DoctoLogo";
import { getReturnUrl } from "@/lib/consultorio-url";
import { registrarEntradaSala } from "@/lib/sala-espera";
import { createAdminClient } from "@/lib/supabase/admin";
import { profesionDeLaFicha } from "@/lib/medicos/profesion-ficha";
import { antesDeLaSala } from "@/lib/turnos/sala-abierta";

export default async function EsperaTurnoPage({
  params,
}: {
  params: Promise<{ turnoId: string }>;
}) {
  const { turnoId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(rebotePaciente("/auth/login", "/acceso/reenviar"));

  const { data: turno } = await supabase
    .from("turnos")
    .select("id, fecha, hora_inicio, hora_fin, estado, monto, medico_id, canal_origen")
    .eq("id", turnoId)
    .single();

  if (!turno) redirect(rebotePaciente("/dashboard", "/acceso/reenviar"));
  const returnUrl = await getReturnUrl(turno.medico_id, turno.canal_origen, "/dashboard");
  if (turno.estado === "en_curso") redirect(`/turno/${turnoId}/sala`);
  // Ídem: en la instancia esta pantalla es un paso intermedio del que hay que
  // salir hacia la del paciente, nunca hacia el dashboard del B2C.
  if (turno.estado !== "confirmado" && turno.estado !== "en_espera")
    redirect(rebotePaciente("/dashboard", `/turno/${turnoId}/acceso`));

  // La sala abre 15 minutos antes del turno (16/10/2026, src/lib/turnos/sala-abierta.ts).
  // Antes de eso no se marca "esperando" ni se avisa al profesional: se vuelve a
  // la confirmación del turno, que ya dice cuándo es y muestra el botón de la sala
  // cuando abre. El mail de "Turno confirmado" trae un link directo a esta página.
  // Solo B2C: la instancia institucional tiene su propio camino de acceso.
  if (turno.estado === "confirmado" && !esInstitucional() && antesDeLaSala(turno.fecha, turno.hora_inicio)) {
    redirect(`/turno/${turnoId}/confirmacion`);
  }

  // Marcar como en_espera si está confirmado
  if (turno.estado === "confirmado") {
    await entrarSalaEspera(turnoId);
  }

  // Registrar entrada en sala de espera (idempotente, fire-and-forget)
  const { data: pacienteTurno } = await supabase
    .from("pacientes").select("id").eq("user_id", user.id).maybeSingle();
  if (pacienteTurno) {
    registrarEntradaSala({
      pacienteId: pacienteTurno.id,
      medicoId: turno.medico_id,
      turnoId: turno.id,
      canalOrigen: turno.canal_origen,
    }).catch((e) => console.error("[turno-espera] Error registrando entrada:", e));
  }

  // `titulo` ("Dr."/"Dra.") lo elige el médico en su registro. Sin él la sala de espera
  // no puede armar frases con género ("La Dra. X canceló el turno") y muestra el nombre
  // pelado. Tiene GRANT SELECT para authenticated, así que es seguro pedirlo con RLS.
  const { data: medico } = await supabase
    .from("medicos")
    .select("nombre_completo, especialidad, titulo")
    .eq("id", turno.medico_id)
    .single();
  // Profesión de la ficha (13/10/2026) en query propia: el SELECT de arriba no se toca.
  const profesion = await profesionDeLaFicha(createAdminClient(), { medicoId: turno.medico_id });

  return (
    <div className="min-h-full bg-[#f8f9fa]">
      <nav className="bg-white" style={{ borderBottom: "0.5px solid #e5e7eb" }}>
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-6">
          <DoctoLogo />
          <a href={returnUrl} className="text-sm text-gray-500 hover:text-gray-700">
            {returnUrl.startsWith("/dr/") ? "Consultorio" : "Inicio"}
          </a>
        </div>
      </nav>

      <main className="mx-auto max-w-lg px-6 py-16">
        <EsperaTurno
          turnoId={turnoId}
          // Sin ficha, nombre vacío: el componente cae a "El profesional", que vale para todos.
          medicoNombre={medico?.nombre_completo ?? ""}
          medicoTitulo={medico?.titulo ?? null}
          medicoEspecialidad={medico?.especialidad ?? ""}
          profesion={profesion}
          horaInicio={turno.hora_inicio}
          returnUrl={returnUrl}
        />
      </main>
    </div>
  );
}
