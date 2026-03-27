import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DescargarPDF from "./DescargarPDF";

export default async function DocumentosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  // Traer documentos del paciente
  const { data: paciente } = await supabase
    .from("pacientes")
    .select("id, nombre_completo, dni")
    .eq("user_id", user.id)
    .single();

  if (!paciente) redirect("/dashboard");

  const { data: documentos } = await supabase
    .from("documentos")
    .select("id, tipo, diagnostico, contenido, created_at, medico_id, consulta_id")
    .eq("paciente_id", paciente.id)
    .order("created_at", { ascending: false });

  // Traer nombres de médicos
  const medicoIds = [...new Set((documentos ?? []).map((d) => d.medico_id))];
  const { data: medicos } = medicoIds.length > 0
    ? await supabase.from("medicos").select("id, nombre_completo, especialidad, numero_matricula, tipo_matricula").in("id", medicoIds)
    : { data: [] };

  const medicosMap = new Map(
    (medicos ?? []).map((m) => [m.id, m])
  );

  // Agrupar por fecha
  const porFecha = new Map<string, typeof docsCompletos>();
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

  for (const doc of docsCompletos) {
    const fecha = new Date(doc.created_at).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "America/Argentina/Buenos_Aires",
    });
    if (!porFecha.has(fecha)) porFecha.set(fecha, []);
    porFecha.get(fecha)!.push(doc);
  }

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
          {docsCompletos.length} documento{docsCompletos.length !== 1 ? "s" : ""}
        </p>

        {docsCompletos.length === 0 ? (
          <div className="mt-12 text-center">
            <p className="text-3xl">📄</p>
            <p className="mt-3 text-sm text-gray-500">
              No tenés documentos todavía. Se generan al finalizar una consulta.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-8">
            {[...porFecha.entries()].map(([fecha, docs]) => (
              <div key={fecha}>
                <p className="text-xs font-medium tracking-wide text-gray-400">{fecha.toUpperCase()}</p>
                <div className="mt-3 space-y-3">
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
                              {tipoLabel[doc.tipo] ?? doc.tipo}
                            </p>
                            <p className="mt-0.5 text-xs text-gray-500">
                              Dr. {doc.medico_nombre} · {doc.medico_especialidad}
                            </p>
                          </div>
                        </div>
                        <DescargarPDF documento={doc} />
                      </div>

                      <div className="mt-3">
                        <p className="text-xs text-gray-400">Diagnóstico</p>
                        <p className="mt-0.5 text-sm text-gray-700">{doc.diagnostico}</p>
                      </div>
                      <div className="mt-2">
                        <p className="text-xs text-gray-400">{tipoLabel[doc.tipo] ?? "Contenido"}</p>
                        <p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-700">{doc.contenido}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
