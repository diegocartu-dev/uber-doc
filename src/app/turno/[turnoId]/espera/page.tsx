import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { entrarSalaEspera } from "@/app/clinica/[medicoId]/turnos/actions";
import EsperaTurno from "./EsperaTurno";
import DoctoLogo from "@/components/DoctoLogo";
import { getReturnUrl } from "@/lib/consultorio-url";
import { registrarEntradaSala } from "@/lib/sala-espera";

export default async function EsperaTurnoPage({
  params,
}: {
  params: Promise<{ turnoId: string }>;
}) {
  const { turnoId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: turno } = await supabase
    .from("turnos")
    .select("id, fecha, hora_inicio, hora_fin, estado, monto, medico_id, canal_origen")
    .eq("id", turnoId)
    .single();

  if (!turno) redirect("/dashboard");
  const returnUrl = await getReturnUrl(turno.medico_id, turno.canal_origen, "/dashboard");
  if (turno.estado === "en_curso") redirect(`/turno/${turnoId}/sala`);
  if (turno.estado !== "confirmado" && turno.estado !== "en_espera") redirect("/dashboard");

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
          medicoNombre={medico?.nombre_completo ?? "Médico"}
          medicoTitulo={medico?.titulo ?? null}
          medicoEspecialidad={medico?.especialidad ?? ""}
          horaInicio={turno.hora_inicio}
          returnUrl={returnUrl}
        />
      </main>
    </div>
  );
}
