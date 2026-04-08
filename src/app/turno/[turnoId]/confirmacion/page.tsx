import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getReturnUrl } from "@/lib/consultorio-url";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function formatFecha(f: string) {
  const d = new Date(f + "T12:00:00");
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

export default async function ConfirmacionTurnoPage({
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
    .select("id, fecha, hora_inicio, hora_fin, monto, estado, medico_id, recordatorios, canal_origen")
    .eq("id", turnoId)
    .single();

  if (!turno || turno.estado === "disponible") redirect("/clinica");
  const returnUrl = await getReturnUrl(turno.medico_id, turno.canal_origen, "/dashboard");

  const { data: medico } = await supabase
    .from("medicos")
    .select("nombre_completo, especialidad, duracion_consulta")
    .eq("id", turno.medico_id)
    .single();

  const recordatorios = turno.recordatorios as { cuando?: string; canal?: string } | null;

  return (
    <div className="min-h-full bg-[#f8f9fa]">
      <nav className="bg-white" style={{ borderBottom: "0.5px solid #e5e7eb" }}>
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-6">
          <span className="text-lg font-medium text-gray-900">Docto</span>
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">Inicio</Link>
        </div>
      </nav>

      <main className="mx-auto max-w-lg px-6 py-10">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#1D9E75]/10">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <h1 className="mt-4 text-xl font-medium text-gray-900">¡Turno confirmado!</h1>
          <p className="mt-2 text-sm text-gray-500">Tu pago fue acreditado</p>
        </div>

        <div className="mt-6 rounded-xl bg-white p-5" style={{ border: "0.5px solid #e5e7eb" }}>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Médico</span>
              <span className="font-medium text-gray-900">Dr. {medico?.nombre_completo ?? "Médico"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Especialidad</span>
              <span className="text-gray-900">{medico?.especialidad ?? ""}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Fecha</span>
              <span className="text-gray-900">{formatFecha(turno.fecha)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Horario</span>
              <span className="text-gray-900">{turno.hora_inicio.slice(0, 5)} — {turno.hora_fin.slice(0, 5)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Duración</span>
              <span className="text-gray-900">{medico?.duracion_consulta ?? 20} min</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Valor</span>
              <span className="font-medium text-[#1D9E75]">${(turno.monto ?? 0).toLocaleString("es-AR")}</span>
            </div>
            {recordatorios?.cuando && (
              <div className="flex justify-between">
                <span className="text-gray-500">Recordatorios</span>
                <span className="text-gray-900">{recordatorios.cuando}</span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-lg bg-gray-50 p-4 text-center" style={{ border: "0.5px solid #e5e7eb" }}>
          <p className="text-xs text-gray-500">
            Podés cancelar sin costo hasta 48 hs antes del turno.
            Si el profesional cancela, se reintegra el 100% del monto.
          </p>
        </div>

        <div className="mt-6 space-y-3">
          {(() => {
            const ahora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
            const hoyStr = `${ahora.getFullYear()}-${(ahora.getMonth() + 1).toString().padStart(2, "0")}-${ahora.getDate().toString().padStart(2, "0")}`;
            const esHoy = turno.fecha === hoyStr;
            const [h, m] = turno.hora_inicio.split(":").map(Number);
            const minutosTurno = h * 60 + m;
            const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();
            const faltanMenos15 = esHoy && minutosTurno - minutosAhora <= 15 && minutosTurno - minutosAhora >= -30;
            const enEspera = turno.estado === "en_espera";

            if (faltanMenos15 || enEspera) {
              return (
                <Link
                  href={`/turno/${turnoId}/espera`}
                  className="block w-full rounded-xl bg-[#1D9E75] px-6 py-3 text-center text-sm font-medium text-white"
                >
                  Ir a sala de espera
                </Link>
              );
            }
            return null;
          })()}
          <Link
            href={returnUrl}
            className="block w-full rounded-xl bg-gray-100 px-6 py-3 text-center text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            {returnUrl.startsWith("/dr/") ? "Volver al consultorio" : "Volver al inicio"}
          </Link>
        </div>
      </main>
    </div>
  );
}
