import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DescargarPDF from "@/app/documentos/DescargarPDF";

function calcularEdad(fechaNac: string | null): string {
  if (!fechaNac) return "";
  const hoy = new Date();
  const nac = new Date(fechaNac);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return `${edad} años`;
}

function formatFecha(fecha: string) {
  const d = new Date(fecha);
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function formatHora(fecha: string) {
  const d = new Date(fecha);
  return d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

const estadoLabel: Record<string, string> = {
  esperando: "Esperando",
  aceptada: "Aceptada",
  en_curso: "En curso",
  completada: "Completada",
  cancelada: "Cancelada",
};

const estadoColor: Record<string, string> = {
  esperando: "bg-amber-100 text-amber-700",
  aceptada: "bg-blue-100 text-blue-700",
  en_curso: "bg-green-100 text-green-700",
  completada: "bg-gray-100 text-gray-600",
  cancelada: "bg-red-100 text-red-600",
};

const tipoLabel: Record<string, string> = {
  receta: "Receta",
  indicaciones: "Indicaciones",
  certificado: "Certificado",
};

const tipoIcon: Record<string, string> = {
  receta: "💊",
  indicaciones: "📋",
  certificado: "📄",
};

export default async function FichaPacientePage({
  params,
}: {
  params: Promise<{ pacienteId: string }>;
}) {
  const { pacienteId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  // Verificar que es médico
  const { data: medico } = await supabase
    .from("medicos")
    .select("id, nombre_completo, especialidad, numero_matricula, tipo_matricula")
    .eq("user_id", user.id)
    .single();

  if (!medico) redirect("/dashboard");

  // Traer datos del paciente
  const { data: paciente } = await supabase
    .from("pacientes")
    .select("id, nombre_completo, fecha_nacimiento, dni, obra_social, nro_afiliado, telefono, email")
    .eq("id", pacienteId)
    .single();

  if (!paciente) redirect("/dashboard");

  const edad = calcularEdad(paciente.fecha_nacimiento);

  // Obtener user_id del paciente para buscar en consultas
  const { data: pacConUserId } = await supabase
    .from("pacientes")
    .select("user_id")
    .eq("id", pacienteId)
    .single();

  const { data: consultasData } = pacConUserId
    ? await supabase
        .from("consultas")
        .select("id, especialidad, estado, created_at, motivo_consulta, sintomas")
        .eq("medico_id", medico.id)
        .eq("paciente_id", pacConUserId.user_id)
        .order("created_at", { ascending: false })
    : { data: [] };

  const consultasFinal = consultasData ?? [];

  // Traer documentos de las consultas de este médico con este paciente
  const consultaIds = consultasFinal.map((c) => c.id);
  const { data: documentos } = consultaIds.length > 0
    ? await supabase
        .from("documentos")
        .select("id, tipo, diagnostico, contenido, created_at, consulta_id, medico_id")
        .eq("paciente_id", pacienteId)
        .eq("medico_id", medico.id)
        .in("consulta_id", consultaIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  // Agrupar documentos por consulta
  const docsPorConsulta = new Map<string, typeof documentosCompletos>();
  const documentosCompletos = (documentos ?? []).map((d) => ({
    ...d,
    medico_nombre: medico.nombre_completo,
    medico_especialidad: medico.especialidad,
    medico_matricula: `${medico.tipo_matricula} ${medico.numero_matricula}`.trim(),
    paciente_nombre: paciente.nombre_completo,
    paciente_dni: paciente.dni ?? "",
  }));

  for (const doc of documentosCompletos) {
    if (!docsPorConsulta.has(doc.consulta_id)) docsPorConsulta.set(doc.consulta_id, []);
    docsPorConsulta.get(doc.consulta_id)!.push(doc);
  }

  return (
    <div className="min-h-full bg-[#f8f9fa]">
      <nav className="bg-white" style={{ borderBottom: "0.5px solid #e5e7eb" }}>
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-6">
          <span className="text-lg font-medium text-gray-900">Uber Doc</span>
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
            Dashboard
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-6 py-8">
        {/* Datos del paciente */}
        <div className="rounded-xl bg-white p-6" style={{ border: "0.5px solid #e5e7eb" }}>
          <p className="text-xs font-medium tracking-wide text-gray-400">FICHA DEL PACIENTE</p>
          <p className="mt-3 text-2xl font-medium text-gray-900">{paciente.nombre_completo}</p>

          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            {edad && (
              <div>
                <p className="text-xs text-gray-400">Edad</p>
                <p className="mt-0.5 text-gray-700">{edad}</p>
              </div>
            )}
            {paciente.dni && (
              <div>
                <p className="text-xs text-gray-400">DNI</p>
                <p className="mt-0.5 text-gray-700">{paciente.dni}</p>
              </div>
            )}
            {paciente.obra_social && (
              <div>
                <p className="text-xs text-gray-400">Obra social</p>
                <p className="mt-0.5 text-gray-700">
                  {paciente.obra_social}
                  {paciente.nro_afiliado && ` · ${paciente.nro_afiliado}`}
                </p>
              </div>
            )}
            {paciente.telefono && (
              <div>
                <p className="text-xs text-gray-400">Teléfono</p>
                <p className="mt-0.5 text-gray-700">{paciente.telefono}</p>
              </div>
            )}
          </div>
        </div>

        {/* Historial de consultas */}
        <div className="mt-6">
          <p className="text-xs font-medium tracking-wide text-gray-400">
            HISTORIAL DE CONSULTAS · {consultasFinal.length}
          </p>

          {consultasFinal.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">No hay consultas registradas con este paciente.</p>
          ) : (
            <div className="mt-3 space-y-4">
              {consultasFinal.map((c) => {
                const docs = docsPorConsulta.get(c.id) ?? [];
                return (
                  <div
                    key={c.id}
                    className="rounded-xl bg-white p-5"
                    style={{ border: "0.5px solid #e5e7eb" }}
                  >
                    {/* Consulta header */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{c.especialidad}</p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {formatFecha(c.created_at)} — {formatHora(c.created_at)} hs
                        </p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${estadoColor[c.estado] ?? "bg-gray-100 text-gray-600"}`}>
                        {estadoLabel[c.estado] ?? c.estado}
                      </span>
                    </div>

                    {/* Motivo */}
                    {c.motivo_consulta && (
                      <p className="mt-3 text-sm text-gray-600">{c.motivo_consulta}</p>
                    )}

                    {/* Síntomas */}
                    {c.sintomas && c.sintomas.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {c.sintomas.map((s: string) => (
                          <span key={s} className="rounded-lg bg-gray-50 px-2 py-0.5 text-xs text-gray-500" style={{ border: "0.5px solid #e5e7eb" }}>
                            {s}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Documentos */}
                    {docs.length > 0 && (
                      <div className="mt-4 border-t pt-3" style={{ borderColor: "#e5e7eb" }}>
                        <p className="text-xs text-gray-400">Documentos</p>
                        <div className="mt-2 space-y-2">
                          {docs.map((doc) => (
                            <div key={doc.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm">{tipoIcon[doc.tipo] ?? "📄"}</span>
                                <span className="text-xs font-medium text-gray-700">
                                  {tipoLabel[doc.tipo] ?? doc.tipo} — {doc.diagnostico}
                                </span>
                              </div>
                              <DescargarPDF documento={doc} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
