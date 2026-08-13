// src/lib/otorgador/reprogramar-masivo.ts
// LA PROPUESTA de la reprogramación masiva (spec institucional §4.6, fase 1).
// SOLO instancia institucional.
//
// ── LA REGLA DE ESTE MÓDULO, EN UNA FRASE ────────────────────────────────────
// ACÁ NO SE TOCA NADA. Se lee la agenda, se arma un plan y se devuelve. La
// única función de este archivo que escribe en la base no existe: la ejecución
// es `reprogramarTurnoInstitucional` (reprogramar.ts), turno por turno, y la
// dispara el operador después de mirar el plan.
//
// Eso no es una decisión de arquitectura, es la promesa que Nova le hace al
// operador en el mock: *"Revisala antes de confirmar — todavía no cambié
// nada"*. Si esta función escribiera aunque sea una fila, esa frase sería
// mentira.
//
// ── DE DÓNDE SALEN LOS CANDIDATOS ────────────────────────────────────────────
// De `armarOferta()` — la MISMA priorización server-side que ve el turnero
// (§4.4: categoría → asignados ASC → próximo slot más cercano, dedup por
// profesional, acuerdo completo al final pero ELEGIBLE — R6 flexible, decisión
// de Diego del 13/08: el turno publicado se puede tomar aunque el profesional
// ya haya cumplido su semana). No se reimplementa el criterio de equidad: si
// mañana cambia, cambia acá también sin tocar una línea. Consecuencia heredada y buscada: los slots son los de
// la SEMANA AR CORRIENTE y hasta 5 minutos antes de su horario — por eso el
// mock dice "Sin lugar esta semana" y no "sin lugar".
//
// ── EL REPARTO ES GOLOSO, Y ESTÁ BIEN ────────────────────────────────────────
// Los turnos afectados se recorren en orden de horario y cada uno se lleva el
// primer lugar libre según la prioridad, primero probando el MISMO DÍA. No se
// busca el óptimo global: un reparto óptimo que nadie puede explicar es peor
// que uno prolijo que se lee de arriba abajo, y acá el operador tiene que poder
// mirar la tabla y entender por qué a cada paciente le tocó ese lugar.

import { createAdminClient } from "@/lib/supabase/admin";
import { esInstitucional } from "@/lib/instancia";
import { armarOferta } from "@/lib/otorgador/oferta";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Los mismos estados que `reprogramarTurnoInstitucional` acepta mover. */
const REPROGRAMABLES = ["confirmado", "en_espera"];

const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DIAS_LARGOS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/** "2026-10-20" → "Mar 20/10" (el formato de la tabla del mock). */
export function etiquetaCorta(fecha: string, hora?: string): string {
  const d = new Date(`${fecha}T12:00:00`);
  const dia = `${DIAS_CORTOS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
  return hora ? `${dia} · ${hora.slice(0, 5)}` : dia;
}

/** "2026-10-20" → "Martes 20/10" (el título de la propuesta). */
export function etiquetaLarga(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00`);
  return `${DIAS_LARGOS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

export interface CandidatoPropuesta {
  turno_id: string;
  medico_id: string;
  medico_nombre: string;
  fecha: string;
  hora: string;
  etiqueta: string;
  /** El lugar quedó en otro día: la subnota naranja "⚠ Cambia de día". */
  cambia_dia: boolean;
}

export interface ItemPlan {
  turno_id: string;
  paciente: { id: string; nombre: string };
  actual: { fecha: string; hora: string; etiqueta: string };
  /** null = no hubo lugar: fila naranja, gestión manual del call center. */
  propuesta: CandidatoPropuesta | null;
}

export interface PlanReprogramacion {
  medico: { id: string; nombre: string; especialidad: string };
  fecha: string;
  fecha_label: string;
  items: ItemPlan[];
  resueltos: number;
  manuales: number;
  /** Para el pie: "avisamos a los N pacientes y a los M profesionales". */
  destinatarios: { pacientes: number; profesionales: number };
}

export type ErrorPlan = "validacion" | "no_encontrado" | "sin_turnos" | "interno";

export type ResultadoPlan =
  | { ok: true; plan: PlanReprogramacion }
  | { ok: false; codigo: ErrorPlan; error: string };

/** Ordena por hora, con la hora como texto "HH:MM[:SS]" (comparación lexicográfica sirve). */
const porHora = (a: { hora_inicio?: string | null }, b: { hora_inicio?: string | null }) =>
  (a.hora_inicio ?? "").localeCompare(b.hora_inicio ?? "");

/**
 * El plan de reprogramación de UN día de UN profesional.
 *
 * Nova es un caller más: la pantalla del otorgador y un operador IA por API key
 * llaman exactamente esto y reciben exactamente lo mismo.
 */
export async function planReprogramacionMasiva(params: {
  medicoId: string;
  fecha: string;
}): Promise<ResultadoPlan> {
  if (!esInstitucional()) {
    return { ok: false, codigo: "validacion", error: "No disponible." };
  }
  const { medicoId, fecha } = params;
  if (!UUID_RE.test(medicoId) || !FECHA_RE.test(fecha)) {
    return { ok: false, codigo: "validacion", error: "Profesional o fecha inválidos." };
  }

  const admin = createAdminClient();

  const { data: medico, error: errMedico } = await admin
    .from("medicos")
    .select("id, nombre_completo, titulo, especialidad, estado_registro")
    .eq("id", medicoId)
    .maybeSingle();
  if (errMedico) {
    console.error("[reprogramar-masivo] Error leyendo el profesional:", errMedico.message);
    return { ok: false, codigo: "interno", error: "No se pudo leer la agenda. Probá de nuevo." };
  }
  if (!medico) return { ok: false, codigo: "no_encontrado", error: "Ese profesional no existe." };

  const nombreMedico = `${(medico.titulo ?? "").trim()} ${(medico.nombre_completo ?? "").trim()}`.trim();
  const especialidad = (medico.especialidad as string | null) ?? "";

  // ── 1) Los turnos afectados ────────────────────────────────────────────────
  const { data: afectados, error: errTurnos } = await admin
    .from("turnos")
    .select("id, fecha, hora_inicio, estado, paciente_id")
    .eq("medico_id", medicoId)
    .eq("fecha", fecha)
    .in("estado", REPROGRAMABLES)
    .not("paciente_id", "is", null);
  if (errTurnos) {
    console.error("[reprogramar-masivo] Error leyendo los turnos:", errTurnos.message);
    return { ok: false, codigo: "interno", error: "No se pudo leer la agenda. Probá de nuevo." };
  }
  const turnos = [...(afectados ?? [])].sort(porHora);
  if (turnos.length === 0) {
    return {
      ok: false,
      codigo: "sin_turnos",
      error: `${nombreMedico} no tiene turnos asignados el ${etiquetaLarga(fecha).toLowerCase()}.`,
    };
  }

  // ── 2) Los pacientes (una query, no una por turno) ─────────────────────────
  const pacienteIds = [...new Set(turnos.map((t) => t.paciente_id as string))];
  const nombrePaciente = new Map<string, string>();
  const { data: pacientes } = await admin
    .from("pacientes")
    .select("id, nombre_completo")
    .in("id", pacienteIds);
  for (const p of pacientes ?? []) {
    nombrePaciente.set(p.id as string, ((p.nombre_completo as string | null) ?? "").trim());
  }

  // ── 3) Los candidatos: la oferta priorizada de la especialidad ─────────────
  //
  // Si la oferta no se puede leer, el plan NO sale con todo en "gestión
  // manual": eso se vería igual que "no hay lugar en toda la semana" y el call
  // center llamaría a cuatro pacientes al pedo. Un error se dice.
  const oferta = await armarOferta(especialidad);
  if (!oferta.ok) {
    return { ok: false, codigo: "interno", error: oferta.error };
  }

  interface SlotLibre {
    turno_id: string;
    medico_id: string;
    medico_nombre: string;
    fecha: string;
    hora: string;
    /** Posición del profesional en la priorización: menor es mejor. */
    prioridad: number;
  }
  const libres: SlotLibre[] = [];
  /**
   * Cuántos turnos le faltan a cada profesional para llegar a su acuerdo.
   *
   * ── ES UNA PREFERENCIA, NO UN TOPE (R6 flexible, Diego 13/08) ─────────────
   * El acuerdo es el PISO de servicio comprometido, no un techo: un horario
   * publicado y libre se puede tomar aunque su dueño ya haya cumplido. Así que
   * este número decide el ORDEN del reparto —primero se llena a quien le falta,
   * que es la equidad de R5— y NO quién queda afuera. Cuando ya nadie tiene
   * cupo, el reparto sigue de largo con los slots que queden (ver el reparto
   * más abajo): mandar a un paciente a gestión manual con horarios libres
   * enfrente sería peor que cargarle uno más a quien ya cumplió.
   *
   * Antes era un tope duro que emparejaba el guard server-side de
   * `reprogramar.ts`. Ese guard ya no existe, y este dejó de ser una foto de lo
   * que la API iba a rechazar: es la política de reparto, y nada más.
   */
  const cupoRestante = new Map<string, number>();
  oferta.oferta.profesionales.forEach((p, prioridad) => {
    // Al profesional que no puede atender no se le devuelven sus propios
    // pacientes; y el que no tiene NADA que ofrecer (sin CI activa y sin slots)
    // no entra al reparto — eso es lo que hoy significa `seleccionable`.
    if (p.medico_id === medicoId || !p.seleccionable) return;
    // `acuerdo: 0` = sin acuerdo cargado: no hay piso que llenar, así que
    // ningún criterio de cupo lo posterga.
    cupoRestante.set(
      p.medico_id,
      p.acuerdo > 0 ? Math.max(0, p.acuerdo - p.asignados) : Number.POSITIVE_INFINITY
    );
    for (const dia of p.slots_semana) {
      for (const h of dia.horas) {
        libres.push({
          turno_id: h.turno_id,
          medico_id: p.medico_id,
          medico_nombre: p.nombre,
          fecha: dia.fecha,
          hora: h.hora,
          prioridad,
        });
      }
    }
  });

  // Orden de búsqueda: primero la prioridad del profesional (que ya trae la
  // equidad adentro), después el horario más temprano.
  libres.sort((a, b) =>
    a.prioridad !== b.prioridad
      ? a.prioridad - b.prioridad
      : a.fecha === b.fecha
        ? a.hora.localeCompare(b.hora)
        : a.fecha.localeCompare(b.fecha)
  );

  // ── 4) El reparto ──────────────────────────────────────────────────────────
  const tomados = new Set<string>();
  /** El slot está libre en ESTE plan (nadie se lo llevó todavía). */
  const libre = (s: SlotLibre) => !tomados.has(s.turno_id);
  /** …y además su dueño todavía no llegó a su acuerdo: es el candidato ideal. */
  const conCupo = (s: SlotLibre) => libre(s) && (cupoRestante.get(s.medico_id) ?? 0) > 0;
  const items: ItemPlan[] = turnos.map((t) => {
    const hora = ((t.hora_inicio as string | null) ?? "").slice(0, 5);
    // Orden de preferencia: mismo día y con cupo → cualquier día con cupo →
    // mismo día sin cupo → cualquier día sin cupo. Los dos últimos escalones
    // son R6 flexible: antes de mandar al paciente a gestión manual se usa un
    // horario publicado y libre, aunque su dueño ya haya cumplido su acuerdo.
    // (`libres` viene ordenado por la prioridad de `armarOferta`, que ya pone
    // último al que completó — así que dentro de cada escalón el reparto sigue
    // prefiriendo a quien menos lleva.)
    const elegido =
      libres.find((s) => conCupo(s) && s.fecha === fecha) ??
      libres.find((s) => conCupo(s)) ??
      libres.find((s) => libre(s) && s.fecha === fecha) ??
      libres.find((s) => libre(s)) ??
      null;
    if (elegido) {
      tomados.add(elegido.turno_id);
      cupoRestante.set(elegido.medico_id, (cupoRestante.get(elegido.medico_id) ?? 1) - 1);
    }
    return {
      turno_id: t.id as string,
      paciente: {
        id: t.paciente_id as string,
        nombre: nombrePaciente.get(t.paciente_id as string) ?? "",
      },
      actual: { fecha, hora, etiqueta: etiquetaCorta(fecha, hora) },
      propuesta: elegido
        ? {
            turno_id: elegido.turno_id,
            medico_id: elegido.medico_id,
            medico_nombre: elegido.medico_nombre,
            fecha: elegido.fecha,
            hora: elegido.hora,
            etiqueta: etiquetaCorta(elegido.fecha, elegido.hora),
            cambia_dia: elegido.fecha !== fecha,
          }
        : null,
    };
  });

  const resueltos = items.filter((i) => i.propuesta).length;
  const profesionales = new Set(items.filter((i) => i.propuesta).map((i) => i.propuesta!.medico_id));

  return {
    ok: true,
    plan: {
      medico: { id: medicoId, nombre: nombreMedico, especialidad },
      fecha,
      fecha_label: etiquetaLarga(fecha),
      items,
      resueltos,
      manuales: items.length - resueltos,
      destinatarios: { pacientes: resueltos, profesionales: profesionales.size },
    },
  };
}
