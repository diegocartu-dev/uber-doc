import { redirect } from "next/navigation";
import { waitUntil } from "@vercel/functions";
import { trackEvent } from "@/lib/funnel";
import { createClient } from "@/lib/supabase/server";
import PagoPendiente from "./PagoPendiente";
import DoctoLogo from "@/components/DoctoLogo";
import { getReturnUrl } from "@/lib/consultorio-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { profesionDeLaFicha } from "@/lib/medicos/profesion-ficha";

export default async function PagoTurnoPage({
  params,
  searchParams,
}: {
  params: Promise<{ turnoId: string }>;
  searchParams: Promise<{ pago?: string }>;
}) {
  const { turnoId } = await params;
  // Mercado Pago vuelve acá con ?pago=error (rechazado) o ?pago=pendiente: la
  // reserva es la misma y el paciente puede reintentar con otro medio.
  const { pago } = await searchParams;
  const vuelta = pago === "error" ? "rechazado" : pago === "pendiente" ? "pendiente" : null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: turno } = await supabase
    .from("turnos")
    .select("id, fecha, hora_inicio, hora_fin, estado, monto, reservado_hasta, medico_id, canal_origen")
    .eq("id", turnoId)
    .single();

  if (!turno) redirect("/clinica");
  const returnUrl = await getReturnUrl(turno.medico_id, turno.canal_origen);
  if (turno.estado === "confirmado") redirect(`/turno/${turnoId}/confirmacion`);
  if (turno.estado !== "reservado_pendiente") redirect("/clinica");

  // El paciente llegó a la pantalla de pago. `waitUntil` y no un await: un
  // evento de análisis no puede demorar la página de pago ni un milisegundo.
  // Recargar la página emite otro evento — igual que `clinica_vista`; el
  // análisis dedupea por paciente+turno.
  waitUntil(
    trackEvent({
      evento: "pago_vista",
      pacienteId: user.id,
      metadata: { tipo: "turno", turnoId },
    })
  );

  // `titulo` ("Dr."/"Dra.") lo elige el médico en su registro. Sin él, el detalle del
  // turno muestra el nombre sin tratamiento. Tiene GRANT SELECT para authenticated,
  // así que sumarlo a este SELECT con cliente RLS es seguro.
  const { data: medico } = await supabase
    .from("medicos")
    .select("nombre_completo, especialidad, duracion_consulta, titulo")
    .eq("id", turno.medico_id)
    .single();
  // Profesión de la ficha (13/10/2026) en query propia: el SELECT de arriba no se toca.
  const profesion = await profesionDeLaFicha(createAdminClient(), { medicoId: turno.medico_id });

  return (
    <div className="min-h-full bg-[#f8f9fa]">
      <nav className="bg-white" style={{ borderBottom: "0.5px solid #e5e7eb" }}>
        <div className="mx-auto flex h-14 max-w-lg items-center px-6">
          <DoctoLogo />
        </div>
      </nav>

      <main className="mx-auto max-w-lg px-6 py-10">
        <PagoPendiente
          turnoId={turnoId}
          vuelta={vuelta}
          reservadoHasta={turno.reservado_hasta}
          returnUrl={returnUrl}
          medico={{
            // Sin ficha, nombre vacío (formatNombreMedico lo tolera): "Médico" no sirve
            // de nombre para una psicóloga.
            nombre: medico?.nombre_completo ?? "",
            titulo: medico?.titulo ?? null,
            profesion,
            especialidad: medico?.especialidad ?? "",
            duracion: medico?.duracion_consulta ?? 20,
          }}
          turno={{
            fecha: turno.fecha,
            horaInicio: turno.hora_inicio,
            horaFin: turno.hora_fin,
            monto: turno.monto ?? 0,
          }}
        />
      </main>
    </div>
  );
}
