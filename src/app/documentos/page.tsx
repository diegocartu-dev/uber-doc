import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppNavbar from "@/components/AppNavbar";
import DescargarPDF from "./DescargarPDF";
import BannerConsultaActiva from "./BannerConsultaActiva";
import { Pill, FileText, Award } from "lucide-react";
import OrigenBadge from "@/components/OrigenBadge";
import type { LucideIcon } from "lucide-react";

const tipoLabel: Record<string, string> = {
  receta: "Receta",
  indicaciones: "Indicaciones",
  certificado: "Certificado",
};

const tipoIconMap: Record<string, LucideIcon> = {
  receta: Pill,
  indicaciones: FileText,
  certificado: Award,
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
    .select("id, nombre_completo, dni, cuil")
    .eq("user_id", user.id)
    .single();

  if (!paciente) redirect("/dashboard");

  // Datos medicos del paciente para el PDF (query separado, no tocar el SELECT principal)
  const { data: perfilMedico } = await supabase
    .from("pacientes")
    .select("sexo_dni, fecha_nacimiento, tiene_cobertura, obra_social, nro_afiliado")
    .eq("id", paciente.id)
    .single();

  // Verificar si hay consulta activa
  const { data: consultaActiva } = await supabase
    .from("consultas")
    .select("id")
    .eq("paciente_id", user.id)
    .in("estado", ["en_curso", "aceptada"])
    .limit(1)
    .single();

  const tieneConsultaActiva = !!consultaActiva;

  // Traer documentos con consulta_id y turno_id
  const { data: documentos } = await supabase
    .from("documentos")
    .select("id, tipo, diagnostico, contenido, created_at, medico_id, consulta_id, turno_id")
    .eq("paciente_id", paciente.id)
    .order("created_at", { ascending: false });

  // Traer consultas para fecha/hora y especialidad
  const consultaIds = [...new Set((documentos ?? []).map((d) => d.consulta_id).filter(Boolean))];
  const { data: consultas } = consultaIds.length > 0
    ? await supabase.from("consultas").select("id, especialidad, created_at, canal_origen").in("id", consultaIds)
    : { data: [] };

  const consultasMap = new Map(
    (consultas ?? []).map((c) => [c.id, c])
  );

  // Traer turnos para fecha/hora
  const turnoIds = [...new Set((documentos ?? []).map((d) => d.turno_id).filter(Boolean))];
  const { data: turnos } = turnoIds.length > 0
    ? await supabase.from("turnos").select("id, fecha, hora_inicio, medico_id, canal_origen").in("id", turnoIds)
    : { data: [] };

  const turnosMap = new Map(
    (turnos ?? []).map((t) => [t.id, t])
  );

  // Traer médicos
  const medicoIds = [...new Set((documentos ?? []).map((d) => d.medico_id))];
  const { data: medicos } = medicoIds.length > 0
    ? await supabase.from("medicos").select("id, nombre_completo, especialidad, numero_matricula, tipo_matricula, domicilio").in("id", medicoIds)
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
      medico_domicilio: med?.domicilio ?? "",
      paciente_nombre: paciente.nombre_completo,
      paciente_dni: paciente.dni ?? "",
      paciente_cuil: paciente.cuil ?? "",
      paciente_sexo_dni: perfilMedico?.sexo_dni ?? null,
      paciente_fecha_nacimiento: perfilMedico?.fecha_nacimiento ?? null,
      paciente_tiene_cobertura: perfilMedico?.tiene_cobertura ?? null,
      paciente_obra_social: perfilMedico?.obra_social ?? null,
      paciente_nro_afiliado: perfilMedico?.nro_afiliado ?? null,
    };
  });

  // Agrupar por consulta_id o turno_id
  const porOrigen = new Map<string, typeof docsCompletos>();
  for (const doc of docsCompletos) {
    const key = doc.consulta_id ?? (doc.turno_id ? `turno:${doc.turno_id}` : "sin-origen");
    if (!porOrigen.has(key)) porOrigen.set(key, []);
    porOrigen.get(key)!.push(doc);
  }

  // Ordenar por fecha desc
  const origenesOrdenados = [...porOrigen.entries()].sort((a, b) => {
    function getFecha(key: string) {
      if (key.startsWith("turno:")) {
        const t = turnosMap.get(key.replace("turno:", ""));
        return t ? new Date(t.fecha + "T" + t.hora_inicio).getTime() : 0;
      }
      const c = consultasMap.get(key);
      return c ? new Date(c.created_at).getTime() : 0;
    }
    return getFecha(b[0]) - getFecha(a[0]);
  });

  const totalDocs = docsCompletos.length;

  return (
    <div className="min-h-full bg-[#f8f9fa]">
      <AppNavbar userName={paciente.nombre_completo} userRole="paciente" />

      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-xl font-medium text-gray-900">Mis documentos</h1>
        <p className="mt-1 text-sm text-gray-500">
          {totalDocs} documento{totalDocs !== 1 ? "s" : ""} · {origenesOrdenados.length} consulta{origenesOrdenados.length !== 1 ? "s" : ""}
        </p>

        {tieneConsultaActiva && (
          <BannerConsultaActiva consultaId={consultaActiva!.id} />
        )}

        {totalDocs === 0 ? (
          <div className="mt-12 text-center">
            <FileText size={48} strokeWidth={1.5} style={{ color: "var(--color-text-tertiary)", margin: "0 auto" }} />
            <p className="mt-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
              No tenes documentos todavia. Se generan al finalizar una consulta.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {origenesOrdenados.map(([origenKey, docs]) => {
              let dia = "—";
              let hora = "--:--";
              let especialidad = docs[0]?.medico_especialidad ?? "";
              let canalOrigen: string | null = null;

              if (origenKey.startsWith("turno:")) {
                const turno = turnosMap.get(origenKey.replace("turno:", ""));
                if (turno) {
                  const fd = new Date(turno.fecha + "T12:00:00");
                  dia = fd.toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" }).toUpperCase();
                  hora = turno.hora_inicio.slice(0, 5);
                  canalOrigen = (turno as { canal_origen?: string }).canal_origen ?? null;
                }
              } else {
                const consulta = consultasMap.get(origenKey);
                if (consulta) {
                  const f = formatFechaConsulta(consulta.created_at);
                  dia = f.dia;
                  hora = f.hora;
                  especialidad = consulta.especialidad ?? especialidad;
                  canalOrigen = (consulta as { canal_origen?: string }).canal_origen ?? null;
                }
              }

              return (
                <div key={origenKey}>
                  {/* Header */}
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium tracking-wide text-gray-400">
                      {dia} — {hora} hs · {especialidad} {origenKey.startsWith("turno:") ? "· Turno" : ""}
                    </p>
                    <OrigenBadge canalOrigen={canalOrigen} />
                  </div>

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
                            {(() => { const Icon = tipoIconMap[doc.tipo] ?? FileText; return <Icon size={16} strokeWidth={1.75} style={{ color: "var(--color-text-secondary)" }} />; })()}
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
