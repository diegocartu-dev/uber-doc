// Atenciones cerradas SIN documentación entregada al paciente.
//
// Por qué existe (auditoría 08/08/2026): el borrador del médico (`doc_borrador`)
// es una libreta privada. Cuatro caminos cierran una atención sin que el médico
// toque "Finalizar" y ninguno mira ese borrador, así que hubo consultas pagadas
// donde el profesional escribió todo y el paciente no recibió nada. Nadie se
// enteró durante meses porque no había ninguna consulta que preguntara
// "¿esta atención terminó con documentos o sin documentos?".
//
// Esto es esa consulta. La respuesta alimenta el aviso del dashboard del médico y
// el badge del historial, para que el agujero se vea en horas y no en cinco días.

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Tipos que cuentan como "documentación entregada al paciente".
 * Espeja `TIPOS_FIRMABLES` de `@/lib/firma/documento`: son los documentos
 * clínicos que el médico redacta y revisa. `documento_medico` (tracking de un
 * archivo adjunto enviado aparte) NO cuenta como documentación de la atención.
 */
export const TIPOS_CLINICOS = ["receta", "indicaciones", "certificado", "orden"] as const;

/** Ventana hacia atrás. Más allá de esto la reparación deja de ser razonable. */
const DIAS_VENTANA = 180;

/** Techo de items: el aviso del dashboard es una lista para actuar, no un reporte. */
const MAX_ITEMS = 25;

export type AtencionPendiente = {
  id: string;
  canal: "consulta" | "turno";
  pacienteNombre: string;
  /** ISO real del cierre (o del inicio si el cierre no quedó registrado). */
  fechaIso: string;
  /** "12 de junio, 15:40 hs" — ya formateado en hora de Argentina. */
  fechaLabel: string;
  /** Quién cerró la atención: 'medico' | 'desconexion' | 'webhook_video' | ... */
  cierreOrigen: string | null;
  /** true si quedó texto sin entregar en el borrador (el caso grave). */
  tieneBorrador: boolean;
  /** Adónde va el médico para completarla. */
  url: string;
};

function fechaLabelAR(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-AR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function borradorConTexto(borrador: unknown): boolean {
  if (!borrador || typeof borrador !== "object") return false;
  const b = borrador as Record<string, unknown>;
  const campos = ["diagnostico", "receta", "indicaciones", "certificado", "orden", "evolucion", "receta_texto_libre"];
  return campos.some((c) => typeof b[c] === "string" && (b[c] as string).trim().length > 0);
}

/**
 * Devuelve las atenciones CERRADAS de un médico que no le entregaron ni un solo
 * documento clínico al paciente, más nuevas primero.
 *
 * Quedan fuera a propósito:
 *  - las canceladas (no hubo atención que documentar),
 *  - las reembolsadas (el paciente ya recuperó la plata; emitir ahí confundiría),
 *  - las anteriores a la ventana.
 */
export async function atencionesSinDocumentacion(medicoId: string): Promise<AtencionPendiente[]> {
  const admin = createAdminClient();
  const desde = new Date(Date.now() - DIAS_VENTANA * 24 * 60 * 60 * 1000).toISOString();
  const tipos = [...TIPOS_CLINICOS];

  const [consultasRes, turnosRes] = await Promise.all([
    admin
      .from("consultas")
      .select("id, created_at, completada_at, paciente_id, cierre_origen, doc_borrador, reintegro_estado")
      .eq("medico_id", medicoId)
      .eq("estado", "completada")
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("turnos")
      .select("id, fecha, hora_inicio, iniciado_en, completada_at, paciente_id, cierre_origen, doc_borrador, reintegro_estado")
      .eq("medico_id", medicoId)
      .eq("estado", "completado")
      .gte("fecha", desde.slice(0, 10))
      .order("fecha", { ascending: false })
      .limit(200),
  ]);

  const consultas = (consultasRes.data ?? []).filter((c) => c.reintegro_estado !== "reembolsado");
  const turnos = (turnosRes.data ?? []).filter((t) => t.reintegro_estado !== "reembolsado");

  if (consultas.length === 0 && turnos.length === 0) return [];

  // Un solo viaje por canal para saber qué atenciones SÍ entregaron documentos.
  const [docsConsultaRes, docsTurnoRes] = await Promise.all([
    consultas.length > 0
      ? admin
          .from("documentos")
          .select("consulta_id")
          .in("consulta_id", consultas.map((c) => c.id))
          .in("tipo", tipos)
      : Promise.resolve({ data: [] as { consulta_id: string | null }[] }),
    turnos.length > 0
      ? admin
          .from("documentos")
          .select("turno_id")
          .in("turno_id", turnos.map((t) => t.id))
          .in("tipo", tipos)
      : Promise.resolve({ data: [] as { turno_id: string | null }[] }),
  ]);

  const conDocsConsulta = new Set((docsConsultaRes.data ?? []).map((d) => d.consulta_id).filter(Boolean) as string[]);
  const conDocsTurno = new Set((docsTurnoRes.data ?? []).map((d) => d.turno_id).filter(Boolean) as string[]);

  const pendientesConsulta = consultas.filter((c) => !conDocsConsulta.has(c.id));
  const pendientesTurno = turnos.filter((t) => !conDocsTurno.has(t.id));

  if (pendientesConsulta.length === 0 && pendientesTurno.length === 0) return [];

  // Nombres. `consultas.paciente_id` es auth.users.id; `turnos.paciente_id` ya es
  // pacientes.id (asimetría de schema verificada en producción).
  const userIds = [...new Set(pendientesConsulta.map((c) => c.paciente_id).filter(Boolean))] as string[];
  const pacIds = [...new Set(pendientesTurno.map((t) => t.paciente_id).filter(Boolean))] as string[];

  const [porUserId, porId] = await Promise.all([
    userIds.length > 0
      ? admin.from("pacientes").select("user_id, nombre_completo").in("user_id", userIds)
      : Promise.resolve({ data: [] as { user_id: string; nombre_completo: string }[] }),
    pacIds.length > 0
      ? admin.from("pacientes").select("id, nombre_completo").in("id", pacIds)
      : Promise.resolve({ data: [] as { id: string; nombre_completo: string }[] }),
  ]);

  const nombrePorUserId = new Map((porUserId.data ?? []).map((p) => [p.user_id, p.nombre_completo]));
  const nombrePorId = new Map((porId.data ?? []).map((p) => [p.id, p.nombre_completo]));

  const items: AtencionPendiente[] = [
    ...pendientesConsulta.map((c) => {
      const iso = c.completada_at ?? c.created_at;
      return {
        id: c.id,
        canal: "consulta" as const,
        pacienteNombre: nombrePorUserId.get(c.paciente_id) ?? "Paciente",
        fechaIso: iso,
        fechaLabel: fechaLabelAR(iso),
        cierreOrigen: c.cierre_origen ?? null,
        tieneBorrador: borradorConTexto(c.doc_borrador),
        url: `/medico/consulta/${c.id}/workspace`,
      };
    }),
    ...pendientesTurno.map((t) => {
      const iso = t.completada_at ?? t.iniciado_en ?? `${t.fecha}T${t.hora_inicio ?? "12:00"}`;
      return {
        id: t.id,
        canal: "turno" as const,
        pacienteNombre: nombrePorId.get(t.paciente_id) ?? "Paciente",
        fechaIso: iso,
        fechaLabel: fechaLabelAR(iso),
        cierreOrigen: t.cierre_origen ?? null,
        tieneBorrador: borradorConTexto(t.doc_borrador),
        url: `/turno/${t.id}/video`,
      };
    }),
  ];

  // Primero las que tienen texto sin entregar (el daño concreto), después por fecha.
  items.sort((a, b) => {
    if (a.tieneBorrador !== b.tieneBorrador) return a.tieneBorrador ? -1 : 1;
    return new Date(b.fechaIso).getTime() - new Date(a.fechaIso).getTime();
  });

  return items.slice(0, MAX_ITEMS);
}

/**
 * Versión acotada para marcar filas de un historial ya cargado: dado un set de
 * ids, devuelve cuáles NO tienen ningún documento clínico entregado.
 */
export async function idsSinDocumentacion(
  ids: string[],
  canal: "consulta" | "turno"
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const admin = createAdminClient();
  const columna = canal === "turno" ? "turno_id" : "consulta_id";

  const { data, error } = await admin
    .from("documentos")
    .select(columna)
    .in(columna, ids)
    .in("tipo", [...TIPOS_CLINICOS]);

  // Fail-safe: si la consulta falla, NO marcamos nada como pendiente. Un badge
  // de más sobre una consulta bien documentada es peor que uno de menos: haría
  // que el médico desconfíe del aviso justo cuando el aviso importa.
  if (error) return new Set();

  const conDocs = new Set(
    (data ?? []).map((d) => (d as unknown as Record<string, string | null>)[columna]).filter(Boolean) as string[]
  );
  return new Set(ids.filter((id) => !conDocs.has(id)));
}
