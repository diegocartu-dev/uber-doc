import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PagoPendiente from "./PagoPendiente";
import { getReturnUrl } from "@/lib/consultorio-url";

export default async function PagoTurnoPage({
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
    .select("id, fecha, hora_inicio, hora_fin, estado, monto, reservado_hasta, medico_id, canal_origen")
    .eq("id", turnoId)
    .single();

  if (!turno) redirect("/clinica");
  const returnUrl = await getReturnUrl(turno.medico_id, turno.canal_origen);
  if (turno.estado === "confirmado") redirect(`/turno/${turnoId}/confirmacion`);
  if (turno.estado !== "reservado_pendiente") redirect("/clinica");

  const { data: medico } = await supabase
    .from("medicos")
    .select("nombre_completo, especialidad, duracion_consulta")
    .eq("id", turno.medico_id)
    .single();

  return (
    <div className="min-h-full bg-[#f8f9fa]">
      <nav className="bg-white" style={{ borderBottom: "0.5px solid #e5e7eb" }}>
        <div className="mx-auto flex h-14 max-w-lg items-center px-6">
          <span className="text-lg font-medium text-gray-900">Docto</span>
        </div>
      </nav>

      <main className="mx-auto max-w-lg px-6 py-10">
        <PagoPendiente
          turnoId={turnoId}
          reservadoHasta={turno.reservado_hasta}
          returnUrl={returnUrl}
          medico={{
            nombre: medico?.nombre_completo ?? "Médico",
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
