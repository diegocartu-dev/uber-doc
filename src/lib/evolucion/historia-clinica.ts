import type { createClient } from "@/lib/supabase/server";
import type { EntradaEvolucion } from "@/app/medico/paciente/[pacienteId]/EvolucionesTimeline";

// Tipo del server client de Supabase tal como lo construye createClient().
// Evita fricción de genéricos (Database no tipado) al pasar el client real.
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// ---------------------------------------------------------------------------
// Carga de evoluciones PREVIAS de un paciente para el Panel HC del workspace.
//
// Reusa exactamente la misma lógica del timeline de la ficha del paciente
// (/medico/paciente/[pacienteId]/page.tsx): une consultas inmediatas + turnos
// completados CON evolución del mismo médico-paciente, mergeados por fecha real
// (nueva→vieja). La asimetría de paciente_id está resuelta acá:
//   - consultas.paciente_id  → auth.users.id  (pacienteUserId)
//   - turnos.paciente_id     → pacientes.id   (pacienteId)
//
// El "encuentro actual" se excluye por id (excluirId) para que la HC muestre
// solo la historia PREVIA, no la consulta/turno en curso.
//
// Pura respecto de UI: devuelve EntradaEvolucion[] listo para PanelHistoriaClinica.
// ---------------------------------------------------------------------------

// Color del borde por canal — coherente con OrigenBadge / ficha del paciente.
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

function formatFecha(fecha: string): string {
  return new Date(fecha).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function formatHora(fecha: string): string {
  return new Date(fecha).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

const hayEvolucion = (v: string | null | undefined): boolean => !!v && v.trim() !== "";

// Shape mínima de un documento clínico que consume el Panel HC. Tipo explícito
// para evitar que el inferidor colapse a `never[]` cuando el query cae al
// fallback `{ data: [] }` del ternario.
type DocRow = {
  id: string;
  tipo: string;
  diagnostico: string | null;
  contenido: string;
  consulta_id?: string | null;
  turno_id?: string | null;
};

function agruparDocs(docs: DocRow[], key: "consulta_id" | "turno_id"): Map<string, DocRow[]> {
  const map = new Map<string, DocRow[]>();
  for (const d of docs) {
    const k = d[key];
    if (!k) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(d);
  }
  return map;
}

type Params = {
  // Médico dueño del workspace (medicos.id).
  medicoId: string;
  // Especialidad a mostrar (la del médico) — los turnos no guardan especialidad propia.
  especialidad: string;
  // auth.users.id del paciente → filtra consultas. Puede ser null si no se conoce.
  pacienteUserId: string | null;
  // pacientes.id del paciente → filtra turnos + documentos. Puede ser null.
  pacienteId: string | null;
  // id del encuentro actual (consultaId o turnoId) a EXCLUIR de la historia previa.
  excluirId: string;
};

export async function cargarEvolucionesPrevias(
  supabase: SupabaseServerClient,
  { medicoId, especialidad, pacienteUserId, pacienteId, excluirId }: Params,
): Promise<EntradaEvolucion[]> {
  type EntradaConOrden = EntradaEvolucion & { sortTs: number };

  // sortTs es interno (epoch ms) sólo para ordenar; no es parte de la shape pública.
  const entradas: EntradaConOrden[] = [];

  // ── Consultas inmediatas completadas (paciente_id = auth.users.id) ──
  if (pacienteUserId) {
    const { data: consultas } = await supabase
      .from("consultas")
      .select("id, especialidad, estado, created_at, canal_origen, evolucion")
      .eq("medico_id", medicoId)
      .eq("paciente_id", pacienteUserId)
      .eq("estado", "completada")
      .neq("id", excluirId)
      .order("created_at", { ascending: false });

    const consultasFinal = consultas ?? [];
    const consultaIds = consultasFinal.map((c) => c.id);

    // Documentos de esas consultas (diagnóstico / receta / indicaciones).
    // El insert de documentos siempre usa pacientes.id como paciente_id.
    const { data: docs } = consultaIds.length > 0 && pacienteId
      ? await supabase
          .from("documentos")
          .select("id, tipo, diagnostico, contenido, consulta_id")
          .eq("paciente_id", pacienteId)
          .eq("medico_id", medicoId)
          .in("consulta_id", consultaIds)
          .order("created_at", { ascending: false })
      : { data: [] };

    const docsPorConsulta = agruparDocs((docs ?? []) as DocRow[], "consulta_id");

    for (const c of consultasFinal) {
      const cd = docsPorConsulta.get(c.id) ?? [];
      const receta = cd.filter((d) => d.tipo === "receta").map((d) => d.contenido).join("\n") || null;
      const indicaciones = cd.filter((d) => d.tipo === "indicaciones").map((d) => d.contenido).join("\n") || null;
      const canal = canalInfo(c.canal_origen ?? null);
      entradas.push({
        id: c.id,
        sortTs: new Date(c.created_at).getTime(),
        fechaLabel: `${formatFecha(c.created_at)} — ${formatHora(c.created_at)}hs`,
        especialidad: c.especialidad,
        canalLabel: canal.label,
        canalColor: canal.color,
        evolucion: c.evolucion ?? null,
        diagnostico: cd[0]?.diagnostico ?? null,
        medicacion: receta,
        indicaciones,
      });
    }
  }

  // ── Turnos completados CON evolución (paciente_id = pacientes.id) ──
  if (pacienteId) {
    const { data: turnos } = await supabase
      .from("turnos")
      .select("id, fecha, hora_inicio, estado, canal_origen, evolucion, iniciado_en")
      .eq("medico_id", medicoId)
      .eq("paciente_id", pacienteId)
      .eq("estado", "completado")
      .neq("id", excluirId)
      .order("fecha", { ascending: false })
      .order("hora_inicio", { ascending: false });

    const turnosConEvolucion = (turnos ?? []).filter((t) => hayEvolucion(t.evolucion));
    const turnoIds = turnosConEvolucion.map((t) => t.id);

    const { data: docs } = turnoIds.length > 0
      ? await supabase
          .from("documentos")
          .select("id, tipo, diagnostico, contenido, turno_id")
          .eq("paciente_id", pacienteId)
          .eq("medico_id", medicoId)
          .in("turno_id", turnoIds)
          .order("created_at", { ascending: false })
      : { data: [] };

    const docsPorTurno = agruparDocs((docs ?? []) as DocRow[], "turno_id");

    for (const t of turnosConEvolucion) {
      const td = docsPorTurno.get(t.id) ?? [];
      const receta = td.filter((d) => d.tipo === "receta").map((d) => d.contenido).join("\n") || null;
      const indicaciones = td.filter((d) => d.tipo === "indicaciones").map((d) => d.contenido).join("\n") || null;
      const canal = canalInfo(t.canal_origen ?? null);
      // iniciado_en (timestamptz) es el momento real de atención; fallback a fecha+hora.
      const fechaRef = t.iniciado_en ?? `${t.fecha}T${t.hora_inicio}`;
      entradas.push({
        id: t.id,
        sortTs: new Date(fechaRef).getTime(),
        fechaLabel: `${formatFecha(fechaRef)} — ${formatHora(fechaRef)}hs`,
        especialidad,
        canalLabel: canal.label,
        canalColor: canal.color,
        evolucion: t.evolucion ?? null,
        diagnostico: td[0]?.diagnostico ?? null,
        medicacion: receta,
        indicaciones,
      });
    }
  }

  return entradas
    .sort((a, b) => b.sortTs - a.sortTs)
    .map(({ sortTs: _sortTs, ...entrada }) => entrada);
}
