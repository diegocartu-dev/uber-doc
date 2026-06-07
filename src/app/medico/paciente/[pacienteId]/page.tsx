export const dynamic = "force-dynamic";
// Ficha del paciente — datos + Evoluciones (timeline) + historial (F3)
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DescargarPDF from "@/app/documentos/DescargarPDF";
import OrigenBadge from "@/components/OrigenBadge";
import AppNavbar from "@/components/AppNavbar";
import PatologiaCronica from "./PatologiaCronica";
import EvolucionesTimeline, { type EntradaEvolucion } from "./EvolucionesTimeline";

// Color del borde por canal — coherente con OrigenBadge
function canalInfo(canalOrigen: string | null): { label: string; color: string } {
  switch (canalOrigen) {
    case "clinica_virtual":
      return { label: "Clínica Virtual", color: "#378ADD" };
    case "consultorio_privado":
      return { label: "Consultorio privado", color: "#D85A30" };
    default:
      return { label: "Consulta Inmediata", color: "#1D9E75" };
  }
}

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
  // Turnos
  confirmado: "Confirmado",
  en_espera: "En espera",
  completado: "Completado",
  cancelado_paciente: "Cancelado por paciente",
  cancelado_medico: "Cancelado por médico",
  ausente_paciente: "Ausente",
};

const estadoColor: Record<string, string> = {
  esperando: "bg-[#BA7517]/10 text-[#BA7517]",
  aceptada: "bg-[#378ADD]/10 text-[#378ADD]",
  en_curso: "bg-[#1D9E75]/10 text-[#1D9E75]",
  completada: "bg-gray-100 text-gray-600",
  cancelada: "bg-[#E24B4A]/10 text-[#E24B4A]",
  // Turnos
  confirmado: "bg-[#888780]/10 text-[#888780]",
  en_espera: "bg-[#1D9E75]/10 text-[#1D9E75]",
  completado: "bg-gray-100 text-gray-600",
  cancelado_paciente: "bg-[#E24B4A]/10 text-[#E24B4A]",
  cancelado_medico: "bg-[#E24B4A]/10 text-[#E24B4A]",
  ausente_paciente: "bg-[#D85A30]/10 text-[#D85A30]",
};

const tipoLabel: Record<string, string> = {
  receta: "Receta",
  indicaciones: "Indicaciones",
  certificado: "Certificado",
  orden: "Orden médica",
};

const tipoIcon: Record<string, string> = {
  receta: "Rx",
  indicaciones: "Ind",
  certificado: "Cert",
  orden: "Ord",
};

export default async function FichaPacientePage({
  params,
  searchParams,
}: {
  params: Promise<{ pacienteId: string }>;
  searchParams: Promise<{ desde?: string }>;
}) {
  const { pacienteId } = await params;
  const { desde } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  // Verificar que es médico
  const { data: medico } = await supabase
    .from("medicos")
    .select("id, nombre_completo, especialidad, numero_matricula, tipo_matricula, domicilio")
    .eq("user_id", user.id)
    .single();

  if (!medico) redirect("/dashboard");

  // Traer datos del paciente
  const { data: paciente } = await supabase
    .from("pacientes")
    .select("id, nombre_completo, fecha_nacimiento, dni, cuil, obra_social, nro_afiliado, telefono, email")
    .eq("id", pacienteId)
    .single();

  if (!paciente) redirect("/dashboard");

  // Datos médicos extendidos (sexo, cobertura) — query separado para no romper SELECT principal
  const { data: perfilMedico } = await supabase
    .from("pacientes")
    .select("sexo_dni, tiene_cobertura")
    .eq("id", pacienteId)
    .single();

  // Patología crónica (vínculo médico-paciente)
  const { data: perfilVinculo } = await supabase
    .from("medico_paciente_perfil")
    .select("id, patologia_cronica")
    .eq("medico_user_id", user.id)
    .eq("paciente_id", pacienteId)
    .maybeSingle();

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
        .select("id, especialidad, estado, created_at, motivo_consulta, sintomas, canal_origen, evolucion")
        .eq("medico_id", medico.id)
        .eq("paciente_id", pacConUserId.user_id)
        .order("created_at", { ascending: false })
    : { data: [] };

  const consultasFinal = consultasData ?? [];

  // Consultas completadas para Historia Clínica
  const consultasCompletadas = consultasFinal.filter((c) => c.estado === "completada");

  // Traer turnos del médico con este paciente (paciente_id = pacientes.id directo)
  const { data: turnosData } = await supabase
    .from("turnos")
    .select("id, fecha, hora_inicio, estado, medico_id, canal_origen, evolucion, iniciado_en")
    .eq("medico_id", medico.id)
    .eq("paciente_id", pacienteId)
    .order("fecha", { ascending: false })
    .order("hora_inicio", { ascending: false });

  const turnosFinal = turnosData ?? [];

  // Traer documentos de turnos
  const turnoIds = turnosFinal.map((t) => t.id);
  const { data: docsTurnos } = turnoIds.length > 0
    ? await supabase
        .from("documentos")
        .select("id, tipo, diagnostico, contenido, created_at, turno_id, medico_id")
        .eq("paciente_id", pacienteId)
        .eq("medico_id", medico.id)
        .in("turno_id", turnoIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  const docsTurnosCompletos = (docsTurnos ?? []).map((d) => ({
    ...d,
    medico_nombre: medico.nombre_completo,
    medico_especialidad: medico.especialidad,
    medico_matricula: `${medico.tipo_matricula} ${medico.numero_matricula}`.trim(),
    medico_domicilio: medico.domicilio ?? "",
    paciente_nombre: paciente.nombre_completo,
    paciente_dni: paciente.dni ?? "",
    paciente_cuil: paciente.cuil ?? "",
    paciente_sexo_dni: perfilMedico?.sexo_dni ?? null,
    paciente_fecha_nacimiento: paciente.fecha_nacimiento ?? null,
    paciente_tiene_cobertura: perfilMedico?.tiene_cobertura ?? null,
    paciente_obra_social: paciente.obra_social ?? null,
    paciente_nro_afiliado: paciente.nro_afiliado ?? null,
  }));

  const docsPorTurno = new Map<string, typeof docsTurnosCompletos>();
  for (const doc of docsTurnosCompletos) {
    if (!doc.turno_id) continue;
    if (!docsPorTurno.has(doc.turno_id)) docsPorTurno.set(doc.turno_id, []);
    docsPorTurno.get(doc.turno_id)!.push(doc);
  }

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
    medico_domicilio: medico.domicilio ?? "",
    paciente_nombre: paciente.nombre_completo,
    paciente_dni: paciente.dni ?? "",
    paciente_cuil: paciente.cuil ?? "",
    paciente_sexo_dni: perfilMedico?.sexo_dni ?? null,
    paciente_fecha_nacimiento: paciente.fecha_nacimiento ?? null,
    paciente_tiene_cobertura: perfilMedico?.tiene_cobertura ?? null,
    paciente_obra_social: paciente.obra_social ?? null,
    paciente_nro_afiliado: paciente.nro_afiliado ?? null,
  }));

  for (const doc of documentosCompletos) {
    if (!docsPorConsulta.has(doc.consulta_id)) docsPorConsulta.set(doc.consulta_id, []);
    docsPorConsulta.get(doc.consulta_id)!.push(doc);
  }

  /* ── Evoluciones (timeline unificado) — CI + turnos, ordenados por fecha ──
     La HC es una sola línea de tiempo: consultas inmediatas y turnos completados
     (Clínica Virtual / Consultorio) conviven mergeados por fecha real, sin importar el canal. */
  const hayEvolucion = (v: string | null | undefined): boolean => !!v && v.trim() !== "";

  // `sortTs` es interno (epoch ms) sólo para ordenar; no forma parte de la shape pública.
  type EntradaConOrden = EntradaEvolucion & { sortTs: number };

  const entradasCI: EntradaConOrden[] = consultasCompletadas.map((c) => {
    const docs = docsPorConsulta.get(c.id) ?? [];
    const recetaTexto = docs.filter((d) => d.tipo === "receta").map((d) => d.contenido).join("\n") || null;
    const indicacionesTexto = docs.filter((d) => d.tipo === "indicaciones").map((d) => d.contenido).join("\n") || null;
    const canal = canalInfo((c as { canal_origen?: string | null }).canal_origen ?? null);
    return {
      id: c.id,
      sortTs: new Date(c.created_at).getTime(),
      fechaLabel: `${formatFecha(c.created_at)} — ${formatHora(c.created_at)}hs`,
      especialidad: c.especialidad,
      canalLabel: canal.label,
      canalColor: canal.color,
      evolucion: c.evolucion ?? null,
      diagnostico: docs[0]?.diagnostico || null,
      medicacion: recetaTexto,
      indicaciones: indicacionesTexto,
    };
  });

  // Turnos completados CON evolución registrada → entran al mismo timeline.
  const turnosConEvolucion = turnosFinal.filter(
    (t) => t.estado === "completado" && hayEvolucion((t as { evolucion?: string | null }).evolucion),
  );

  const entradasTurnos: EntradaConOrden[] = turnosConEvolucion.map((t) => {
    const docs = docsPorTurno.get(t.id) ?? [];
    const recetaTexto = docs.filter((d) => d.tipo === "receta").map((d) => d.contenido).join("\n") || null;
    const indicacionesTexto = docs.filter((d) => d.tipo === "indicaciones").map((d) => d.contenido).join("\n") || null;
    const canal = canalInfo((t as { canal_origen?: string | null }).canal_origen ?? null);
    // `iniciado_en` (timestamptz) es el momento real de atención; si falta, caemos a fecha+hora del turno.
    const iniciadoEn = (t as { iniciado_en?: string | null }).iniciado_en ?? null;
    const fechaRef = iniciadoEn ?? `${t.fecha}T${t.hora_inicio}`;
    return {
      id: t.id,
      sortTs: new Date(fechaRef).getTime(),
      fechaLabel: `${formatFecha(fechaRef)} — ${formatHora(fechaRef)}hs`,
      especialidad: medico.especialidad,
      canalLabel: canal.label,
      canalColor: canal.color,
      evolucion: (t as { evolucion?: string | null }).evolucion ?? null,
      diagnostico: docs[0]?.diagnostico || null,
      medicacion: recetaTexto,
      indicaciones: indicacionesTexto,
    };
  });

  const entradasEvolucion: EntradaEvolucion[] = [...entradasCI, ...entradasTurnos]
    .sort((a, b) => b.sortTs - a.sortTs)
    .map(({ sortTs: _sortTs, ...entrada }) => entrada);

  /* ── Sección de consultas ── */
  const seccionConsultas = (
    <div key="consultas" className="mt-6">
      <div className="flex items-center gap-2.5 rounded-t-xl px-5 py-3" style={{ background: "rgba(29,158,117,0.06)", borderLeft: "4px solid #1D9E75" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/></svg>
        <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: "#1D9E75" }}>
          Historial de consultas · {consultasFinal.length}
        </p>
      </div>

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
                style={{ border: "0.5px solid #e5e7eb", borderLeft: "4px solid #1D9E75" }}
              >
                {/* Consulta header */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">{c.especialidad}</p>
                      <OrigenBadge canalOrigen={(c as { canal_origen?: string }).canal_origen ?? null} />
                    </div>
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
                            <span className="text-sm">{tipoIcon[doc.tipo] ?? "Doc"}</span>
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
  );

  /* ── Sección de turnos ──
     Los turnos completados CON evolución ya se muestran en el timeline unificado de Evoluciones.
     Acá listamos sólo el resto (futuros, confirmados, en espera, cancelados, o completados sin
     evolución) para no duplicar el mismo turno en dos lugares. */
  const turnosFueraDeTimeline = turnosFinal.filter(
    (t) => !(t.estado === "completado" && hayEvolucion((t as { evolucion?: string | null }).evolucion)),
  );

  const seccionTurnos = turnosFueraDeTimeline.length === 0 ? null : (
    <div key="turnos" className="mt-8">
      <div className="flex items-center gap-2.5 rounded-t-xl px-5 py-3" style={{ background: "rgba(55,138,221,0.06)", borderLeft: "4px solid #378ADD" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
        <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: "#378ADD" }}>
          Historial de turnos · {turnosFueraDeTimeline.length}
        </p>
      </div>

      <div className="mt-3 space-y-4">
          {turnosFueraDeTimeline.map((t) => {
            const docs = docsPorTurno.get(t.id) ?? [];
            return (
              <div
                key={t.id}
                className="rounded-xl bg-white p-5"
                style={{ border: "0.5px solid #e5e7eb", borderLeft: "4px solid #378ADD" }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">{medico.especialidad}</p>
                      <OrigenBadge canalOrigen={(t as { canal_origen?: string }).canal_origen ?? null} />
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {formatFecha(t.fecha + "T12:00:00")} — {t.hora_inicio.slice(0, 5)} hs
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${estadoColor[t.estado] ?? "bg-gray-100 text-gray-600"}`}>
                    {estadoLabel[t.estado] ?? t.estado}
                  </span>
                </div>

                {docs.length > 0 && (
                  <div className="mt-4 border-t pt-3" style={{ borderColor: "#e5e7eb" }}>
                    <p className="text-xs text-gray-400">Documentos</p>
                    <div className="mt-2 space-y-2">
                      {docs.map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{tipoIcon[doc.tipo] ?? "Doc"}</span>
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
    </div>
  );

  return (
    <div className="min-h-full bg-[#f8f9fa]">
      <AppNavbar userName={medico.nombre_completo} userRole="medico" />

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
            {paciente.cuil && (
              <div>
                <p className="text-xs text-gray-400">CUIL</p>
                <p className="mt-0.5 text-gray-700">{paciente.cuil}</p>
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

        {/* Patología crónica */}
        <PatologiaCronica
          medicoUserId={user.id}
          pacienteId={pacienteId}
          perfilId={perfilVinculo?.id ?? null}
          initialPatologias={perfilVinculo?.patologia_cronica ?? []}
        />

        {/* Evoluciones — timeline unificado (CI + turnos completados con evolución) */}
        <EvolucionesTimeline entradas={entradasEvolucion} />

        {/* Secciones de historial — orden según origen */}
        {desde === "turno" ? (
          <>{seccionTurnos}{seccionConsultas}</>
        ) : (
          <>{seccionConsultas}{seccionTurnos}</>
        )}
      </main>
    </div>
  );
}
