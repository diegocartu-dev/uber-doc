import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DescargarPDF from "./DescargarPDF";

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

function formatFechaConsulta(fecha: string) {
  const d = new Date(fecha);
  const dia = d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  });
  const hora = d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  });
  return { dia: dia.toUpperCase(), hora };
}

export default async function DocumentosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: paciente } = await supabase
    .from("pacientes")
    .select("id, nombre_completo, dni")
    .eq("user_id", user.id)
    .single();

  if (!paciente) redirect("/dashboard");

  // Traer documentos con consulta_id
  const { data: documentos } = await supabase
    .from("documentos")
    .select("id, tipo, diagnostico, contenido, created_at, medico_id, consulta_id")
    .eq("paciente_id", paciente.id)
    .order("created_at", { ascending: false });

  // Traer consultas para fecha/hora y especialidad
  const consultaIds = [...new Set((documentos ?? []).map((d) => d.consulta_id))];
  const { data: consultas } = consultaIds.length > 0
    ? await supabase.from("consultas").select("id, especialidad, created_at").in("id", consultaIds)
    : { data: [] };

  const consultasMap = new Map(
    (consultas ?? []).map((c) => [c.id, c])
  );

  // Traer médicos
  const medicoIds = [...new Set((documentos ?? []).map((d) => d.medico_id))];
  const { data: medicos } = medicoIds.length > 0
    ? await supabase.from("medicos").select("id, nombre_completo, especialidad, numero_matricula, tipo_matricula").in("id", medicoIds)
    : { data: [] };

  const medicosMap = new Map(
    (medicos ?? []).map((m) => [m.id, m])
  );

  // Enriquecer documentos
  const docsCompletos = (documentos ?? []).map((d) => {
    const med = medicosMap.get(d.medico_id);
    return {
      ...d,
      medico_nombre: med?.nombre_completo ?? "Médico",
      medico_especialidad: med?.especialidad ?? "",
      medico_matricula: `${med?.tipo_matricula ?? ""} ${med?.numero_matricula ?? ""}`.trim(),
      paciente_nombre: paciente.nombre_completo,
      paciente_dni: paciente.dni,
    };
  });

  // Agrupar por consulta_id (orden por fecha de consulta desc)
  const porConsulta = new Map<string, typeof docsCompletos>();
  for (const doc of docsCompletos) {
    const key = doc.consulta_id;
    if (!porConsulta.has(key)) porConsulta.set(key, []);
    porConsulta.get(key)!.push(doc);
  }

  // Ordenar consultas por fecha desc
  const consultasOrdenadas = [...porConsulta.entries()].sort((a, b) => {
    const ca = consultasMap.get(a[0]);
    const cb = consultasMap.get(b[0]);
    return new Date(cb?.created_at ?? 0).getTime() - new Date(ca?.created_at ?? 0).getTime();
  });

  const totalDocs = docsCompletos.length;

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
        <h1 className="text-xl font-medium text-gray-900">Mis documentos</h1>
        <p className="mt-1 text-sm text-gray-500">
          {totalDocs} documento{totalDocs !== 1 ? "s" : ""} · {consultasOrdenadas.length} consulta{consultasOrdenadas.length !== 1 ? "s" : ""}
        </p>

        {totalDocs === 0 ? (
          <div className="mt-12 text-center">
            <p className="text-3xl">📄</p>
            <p className="mt-3 text-sm text-gray-500">
              No tenés documentos todavía. Se generan al finalizar una consulta.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {consultasOrdenadas.map(([consultaId, docs]) => {
              const consulta = consultasMap.get(consultaId);
              const { dia, hora } = consulta
                ? formatFechaConsulta(consulta.created_at)
                : { dia: "—", hora: "--:--" };
              const especialidad = consulta?.especialidad ?? docs[0]?.medico_especialidad ?? "";

              return (
                <div key={consultaId}>
                  {/* Header de consulta */}
                  <p className="text-xs font-medium tracking-wide text-gray-400">
                    {dia} — {hora} hs · {especialidad}
                  </p>

                  {/* Documentos de esta consulta */}
                  <div className="mt-3 space-y-2">
                    {docs.map((doc) => (
                      <div
                        key={doc.id}
                        className="rounded-xl bg-white p-5"
                        style={{ border: "0.5px solid #e5e7eb" }}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <span>{tipoIcon[doc.tipo] ?? "📄"}</span>
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {tipoLabel[doc.tipo] ?? doc.tipo} — {doc.diagnostico}
                              </p>
                              <p className="mt-0.5 text-xs text-gray-500">
                                Dr. {doc.medico_nombre}
                              </p>
                            </div>
                          </div>
                          <DescargarPDF documento={doc} />
                        </div>

                        <div className="mt-3">
                          <p className="text-xs text-gray-400">{tipoLabel[doc.tipo] ?? "Contenido"}</p>
                          <p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-700">{doc.contenido}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
