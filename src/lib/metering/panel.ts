// src/lib/metering/panel.ts
// Los datos del PANEL de la institución (spec §6.7, mock 4). SOLO instancia
// institucional.
//
// Todo lo que se muestra sale de `encuentros_metering` + `acuerdo_semanas`:
// las MISMAS filas que sostienen la factura. Es a propósito — la escena 6 de
// la demo es "el panel refleja exactamente lo que pasó", y si el tablero
// calculara por su cuenta, tarde o temprano diría un número distinto al de la
// factura y esa discusión la perdemos siempre.
//
// La única cifra que NO sale del contador es la de los slots sin asignar: esa
// se cuenta contra la OFERTA de agenda (`turnos`), porque un slot que nadie
// tomó no genera fila en el contador — preguntarle a la factura qué NO pasó no
// tiene sentido.

import { createAdminClient } from "@/lib/supabase/admin";
import type { Motor } from "@/lib/metering/clasificar";
import {
  cumplimientoDeSemana,
  totalDeBolsa,
  diasDeSemana,
  domingoDeSemana,
  type CumplimientoProfesional,
} from "@/lib/metering/bolsa";

export interface DiaDelChart {
  fecha_ar: string;
  /** "Lun 19" */
  etiqueta: string;
  acordado: number;
  espontaneo: number;
  ofrecido: number;
  total: number;
}

export interface ResumenSemanal {
  semanaAr: string;
  /** true = la semana ya terminó y su cumplimiento está sellado. */
  cerrada: boolean;
  facturables: number;
  porMotor: Record<Motor, number>;
  ausenciasPaciente: number;
  ausenciasProfesional: number;
  profesionalesQueAtendieron: number;
  profesionalesDelPiloto: number;
  bolsa: { minutosCumplidos: number; minutosComprometidos: number; porcentaje: number };
  chart: DiaDelChart[];
  cumplimiento: CumplimientoProfesional[];
  /** Ausentismo de PACIENTES por especialidad, de mayor a menor. */
  ausentismo: { especialidad: string; cantidad: number }[];
  /** Slots de agenda transcurridos que nadie tomó (contra la oferta, no el contador). */
  sinAsignar: number;
}

const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** "2026-10-19" → "Lun 19" */
export function etiquetaDia(fechaAr: string): string {
  const d = new Date(`${fechaAr}T12:00:00Z`);
  return `${DIAS_CORTOS[d.getUTCDay()]} ${d.getUTCDate()}`;
}

const MOTORES_VACIOS = (): Record<Motor, number> => ({ acordado: 0, espontaneo: 0, ofrecido: 0 });

/** Estados de turno que ocupan el slot con un paciente (para el "sin asignar"). */
const ESTADOS_CON_PACIENTE = new Set([
  "confirmado",
  "en_espera",
  "en_curso",
  "completado",
  "ausente_paciente",
  "ausente_medico",
  "cancelado_paciente",
  "cancelado_medico",
  "reprogramado",
]);

export async function resumenDeSemana(params: {
  semanaAr: string;
  ahoraMs?: number;
}): Promise<ResumenSemanal> {
  const admin = createAdminClient();
  const ahoraMs = params.ahoraMs ?? Date.now();
  const lunes = params.semanaAr;
  const domingo = domingoDeSemana(lunes);

  const [{ data: filas }, cumplimiento] = await Promise.all([
    admin
      .from("encuentros_metering")
      .select("tipo, recurso_id, motor, medico_id, especialidad, fecha_ar, clasificacion")
      .eq("semana_ar", lunes),
    cumplimientoDeSemana({ semanaAr: lunes, ahoraMs }),
  ]);

  const porMotor = MOTORES_VACIOS();
  const chartPorDia = new Map<string, DiaDelChart>();
  for (const fecha of diasDeSemana(lunes)) {
    chartPorDia.set(fecha, {
      fecha_ar: fecha,
      etiqueta: etiquetaDia(fecha),
      acordado: 0,
      espontaneo: 0,
      ofrecido: 0,
      total: 0,
    });
  }

  let facturables = 0;
  let ausenciasPaciente = 0;
  let ausenciasProfesional = 0;
  const atendieron = new Set<string>();
  const ausentismoPorEspecialidad = new Map<string, number>();

  for (const f of filas ?? []) {
    const clasificacion = f.clasificacion as string;
    if (clasificacion === "facturable") {
      facturables++;
      porMotor[f.motor as Motor]++;
      atendieron.add(f.medico_id as string);
      const dia = chartPorDia.get(f.fecha_ar as string);
      if (dia) {
        dia[f.motor as Motor]++;
        dia.total++;
      }
    } else if (clasificacion === "ausente_paciente") {
      ausenciasPaciente++;
      const esp = ((f.especialidad as string | null) ?? "").trim() || "Sin especialidad";
      ausentismoPorEspecialidad.set(esp, (ausentismoPorEspecialidad.get(esp) ?? 0) + 1);
    } else if (clasificacion === "ausente_profesional") {
      ausenciasProfesional++;
    }
    // `no_facturable_corta` y `falla_tecnica` existen en la base y NO se
    // muestran acá: no son facturables ni son ausencias de nadie. Si alguna
    // vez hay que exponerlas, va a ser con su propio nombre y su propia
    // explicación, no sumadas a un total que dice otra cosa.
  }

  // Slots de agenda transcurridos que nadie tomó (KPI "sin asignar", §6.6).
  const { data: turnos } = await admin
    .from("turnos")
    .select("id, fecha, hora_fin, estado, canal_origen")
    .gte("fecha", lunes)
    .lte("fecha", domingo)
    .in("canal_origen", ["acordado", "ofrecido"]);
  let sinAsignar = 0;
  for (const t of turnos ?? []) {
    const finMs = Date.parse(`${t.fecha}T${String(t.hora_fin).slice(0, 8)}-03:00`);
    if (!Number.isFinite(finMs) || finMs > ahoraMs) continue;
    if (!ESTADOS_CON_PACIENTE.has(t.estado as string)) sinAsignar++;
  }

  return {
    semanaAr: lunes,
    cerrada: cumplimiento.some((c) => c.sellada),
    facturables,
    porMotor,
    ausenciasPaciente,
    ausenciasProfesional,
    profesionalesQueAtendieron: atendieron.size,
    profesionalesDelPiloto: cumplimiento.length,
    bolsa: totalDeBolsa(cumplimiento),
    chart: [...chartPorDia.values()],
    cumplimiento,
    ausentismo: [...ausentismoPorEspecialidad.entries()]
      .map(([especialidad, cantidad]) => ({ especialidad, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad || a.especialidad.localeCompare(b.especialidad, "es")),
    sinAsignar,
  };
}

/** "El motor Acordado concentra el 70 % de las consultas de la semana." */
export function lecturaDelChart(porMotor: Record<Motor, number>, total: number): string {
  if (total === 0) return "Todavía no hay consultas facturables en esta semana.";
  const nombres: Record<Motor, string> = {
    acordado: "Acordado",
    espontaneo: "Espontáneo",
    ofrecido: "Ofrecido",
  };
  const entradas = (Object.keys(porMotor) as Motor[]).map((m) => ({ motor: m, n: porMotor[m] }));
  entradas.sort((a, b) => b.n - a.n);
  const top = entradas[0];
  if (top.n === 0) return "Todavía no hay consultas facturables en esta semana.";
  const pct = Math.round((top.n / total) * 100);
  return `El motor ${nombres[top.motor]} concentra el ${pct}% de las consultas de la semana.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB "CONSULTAS" — el detalle de la semana, con su historia clínica
// ─────────────────────────────────────────────────────────────────────────────

export interface EncuentroDelPanel {
  tipo: "consulta" | "turno";
  recursoId: string;
  fechaAr: string;
  motor: Motor;
  especialidad: string | null;
  profesional: string;
  paciente: string;
  clasificacion: string;
  minutos: number;
  documentos: { id: string; tipo: string; fecha: string }[];
}

/** El nombre del paciente de un encuentro, con la asimetría del B2C resuelta. */
async function nombresDePacientes(
  idsDeTurno: string[],
  idsDeConsulta: string[]
): Promise<Map<string, string>> {
  const admin = createAdminClient();
  const out = new Map<string, string>();
  // `turnos.paciente_id` → pacientes.id · `consultas.paciente_id` → auth.users.id
  if (idsDeTurno.length > 0) {
    const { data } = await admin.from("pacientes").select("id, nombre_completo").in("id", idsDeTurno);
    for (const p of data ?? []) out.set(p.id as string, (p.nombre_completo as string) ?? "");
  }
  if (idsDeConsulta.length > 0) {
    const { data } = await admin
      .from("pacientes")
      .select("user_id, nombre_completo")
      .in("user_id", idsDeConsulta);
    for (const p of data ?? []) out.set(p.user_id as string, (p.nombre_completo as string) ?? "");
  }
  return out;
}

/**
 * Los encuentros de la semana con sus documentos — la base de la escena 5
 * ("la institución se lleva la historia clínica"). V1: listado + descarga por
 * documento, sin API ni FHIR (fuera de alcance explícito del guion).
 */
export async function encuentrosDeSemana(params: {
  semanaAr: string;
  limite?: number;
}): Promise<EncuentroDelPanel[]> {
  const admin = createAdminClient();
  const { data: filas } = await admin
    .from("encuentros_metering")
    .select(
      "tipo, recurso_id, motor, medico_id, paciente_id, especialidad, fecha_ar, clasificacion, segundos_ambos_en_sala"
    )
    .eq("semana_ar", params.semanaAr)
    .order("fecha_ar", { ascending: false })
    .limit(params.limite ?? 200);

  if (!filas || filas.length === 0) return [];

  const idsTurno = filas.filter((f) => f.tipo === "turno").map((f) => f.recurso_id as string);
  const idsConsulta = filas.filter((f) => f.tipo === "consulta").map((f) => f.recurso_id as string);

  const [{ data: medicos }, { data: docsTurno }, { data: docsConsulta }, pacientes] = await Promise.all([
    admin
      .from("medicos")
      .select("id, nombre_completo, titulo")
      .in("id", [...new Set(filas.map((f) => f.medico_id as string))]),
    idsTurno.length
      ? admin.from("documentos").select("id, tipo, created_at, turno_id").in("turno_id", idsTurno)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    idsConsulta.length
      ? admin.from("documentos").select("id, tipo, created_at, consulta_id").in("consulta_id", idsConsulta)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    nombresDePacientes(
      filas.filter((f) => f.tipo === "turno").map((f) => f.paciente_id as string),
      filas.filter((f) => f.tipo === "consulta").map((f) => f.paciente_id as string)
    ),
  ]);

  const nombreMedico = new Map<string, string>();
  for (const m of medicos ?? []) {
    nombreMedico.set(
      m.id as string,
      `${((m.titulo as string | null) ?? "").trim()} ${((m.nombre_completo as string | null) ?? "").trim()}`.trim()
    );
  }

  const docsPorRecurso = new Map<string, { id: string; tipo: string; fecha: string }[]>();
  const sumar = (clave: string, d: Record<string, unknown>) => {
    const lista = docsPorRecurso.get(clave) ?? [];
    lista.push({
      id: d.id as string,
      tipo: d.tipo as string,
      fecha: new Date(d.created_at as string).toLocaleDateString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
      }),
    });
    docsPorRecurso.set(clave, lista);
  };
  for (const d of docsTurno ?? []) sumar(`turno|${d.turno_id}`, d as Record<string, unknown>);
  for (const d of docsConsulta ?? []) sumar(`consulta|${d.consulta_id}`, d as Record<string, unknown>);

  return filas.map((f) => ({
    tipo: f.tipo as "consulta" | "turno",
    recursoId: f.recurso_id as string,
    fechaAr: f.fecha_ar as string,
    motor: f.motor as Motor,
    especialidad: (f.especialidad as string | null) ?? null,
    profesional: nombreMedico.get(f.medico_id as string) ?? "",
    paciente: pacientes.get(f.paciente_id as string) ?? "",
    clasificacion: f.clasificacion as string,
    minutos: Math.round(Number(f.segundos_ambos_en_sala ?? 0) / 60),
    documentos: docsPorRecurso.get(`${f.tipo}|${f.recurso_id}`) ?? [],
  }));
}
