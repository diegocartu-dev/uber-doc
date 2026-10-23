// «Qué pasó»: cada atención con su desenlace y su porqué, para leerlo de un
// vistazo (Diego, 23/10/2026: "el dashboard dice que hay una consulta pero no
// dice si está realizada o rechazada; tengo que ir hasta Consultas › Historial").
//
// Es la MISMA fila que arma el Historial (`/api/admin/consultas?tab=historial`):
// la clasificación sale de `diagnostico.ts`, las reservas abandonadas quedan
// afuera por `reservas.ts` y las cuentas de prueba no se cuentan. El Historial
// llama a `cargarAtenciones` desde acá, así Dashboard, Tablero e Historial no
// pueden decir cosas distintas sobre el mismo día.
//
// La parte pura (`agruparPorDia`, `resumirDia`) tiene tests en
// `tests/unit/que-paso.test.ts`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { sinReservasAbandonadas } from "@/lib/insights/reservas";
import { pagada } from "@/lib/insights/plata";
import { fechaARdeISO, medianocheARenUTC, sumarDiasAR } from "@/lib/insights/fechas";
import { diagnosticarConsulta, diagnosticarTurno, type Diagnostico } from "@/lib/consultas/diagnostico";
import { esInstitucional } from "@/lib/instancia";

const SLOTS = ["disponible", "bloqueado", "bloqueado_sin_cobro"];

export type AtencionQuePaso = {
  id: string;
  tipo: "CI" | "Turno";
  canal: "ci" | "clinica" | "consultorio";
  estado: string;
  medico: string;
  profesion: string | null;
  paciente: string;
  /** ISO. En la CI, cuándo se pidió; en el turno, la hora de la cita (con -03:00). */
  inicio: string;
  especialidad: string;
  porque: Diagnostico;
  /** Lo que quedó cobrado por esta atención (0 si no se pagó o se devolvió). */
  cobrado: number;
};

// Profesión de cada profesional (13/10/2026, psicólogos): para que la fila diga
// "Lic." y "Psicología". Query APARTE de la de nombres, a propósito: si la
// columna faltara en una base, PostgREST falla la query entera y el panel se
// quedaría sin nombres. Si esta falla, todos salen como médicos (lo que eran).
async function profesionPorMedico(admin: SupabaseClient, medicoIds: string[]) {
  const mapa = new Map<string, string | null>();
  if (medicoIds.length === 0) return mapa;
  const { data } = await admin.from("medicos").select("id, profesion").in("id", medicoIds);
  for (const m of data ?? []) mapa.set(m.id as string, (m.profesion as string | null) ?? null);
  return mapa;
}

type Pac = { id: string; user_id: string | null; nombre_completo: string | null; es_cuenta_test: boolean | null };

async function nombres(admin: SupabaseClient, medicoIds: string[], pacienteIds: string[]) {
  const [{ data: medicos }, { data: pacientes }, profesiones] = await Promise.all([
    medicoIds.length > 0 ? admin.from("medicos").select("id, nombre_completo, es_cuenta_test").in("id", medicoIds) : { data: [] },
    pacienteIds.length > 0
      ? admin.from("pacientes").select("id, user_id, nombre_completo, es_cuenta_test").or(`user_id.in.(${pacienteIds.join(",")}),id.in.(${pacienteIds.join(",")})`)
      : { data: [] },
    profesionPorMedico(admin, medicoIds),
  ]);
  const medTest = new Set((medicos ?? []).filter((m) => m.es_cuenta_test).map((m) => m.id as string));
  const medNombre = new Map((medicos ?? []).map((m) => [m.id as string, (m.nombre_completo as string | null) ?? "—"]));
  // `consultas.paciente_id` es el user_id; `turnos.paciente_id` es pacientes.id → doble mapa.
  const pacPorUser = new Map(((pacientes ?? []) as Pac[]).map((p) => [p.user_id, p]));
  const pacPorId = new Map(((pacientes ?? []) as Pac[]).map((p) => [p.id, p]));
  const pacDe = (pid: string | null) => (pid ? pacPorUser.get(pid) ?? pacPorId.get(pid) : undefined);
  return {
    real: (medicoId: string, pacienteId: string | null) => !medTest.has(medicoId) && !pacDe(pacienteId)?.es_cuenta_test,
    medico: (id: string) => medNombre.get(id) ?? "—",
    profesion: (id: string) => profesiones.get(id) ?? null,
    paciente: (pid: string | null) => pacDe(pid)?.nombre_completo ?? "Paciente",
  };
}

/**
 * Las atenciones reales de un rango de días argentinos (`desde`..`hasta`,
 * YYYY-MM-DD, inclusive; sin límites = las últimas 200 de cada tabla), cada una
 * con su porqué. Es la fila del Historial.
 */
export async function cargarAtenciones(
  admin: SupabaseClient,
  rango: { desde?: string | null; hasta?: string | null } = {}
): Promise<AtencionQuePaso[]> {
  const { desde, hasta } = rango;

  // `cierre_evidencia` NO va acá: la base institucional no la tiene, y una sola
  // columna inexistente hace fallar la query entera (el Historial quedaría vacío).
  // Se lee aparte, más abajo, y si falla el porqué sale sin evidencia.
  let query = admin
    .from("consultas")
    .select("id, especialidad, estado, created_at, paciente_id, medico_id, aceptada_at, resuelta_por, resolucion_motivo, pago_id, mp_status, sala_video_url, en_curso_at, monto, reintegro_estado")
    .order("created_at", { ascending: false })
    .limit(200);

  // Límites en día ARGENTINO (no UTC): el día AR arranca a las 03:00Z. Con el
  // corte anterior ("2026-08-04" = 00:00Z) se colaban consultas de la noche
  // anterior y se perdían las de 21-24hs AR (reclamo Diego 04/08).
  if (desde) query = query.gte("created_at", medianocheARenUTC(desde));
  if (hasta) query = query.lt("created_at", medianocheARenUTC(sumarDiasAR(hasta, 1)));

  // Los turnos se acotan por su columna `fecha`, que YA es una fecha
  // argentina: no lleva el corrimiento de medianoche que sí necesita
  // `created_at` (timestamptz) arriba.
  let qTurnos = admin
    .from("turnos")
    .select("id, fecha, hora_inicio, estado, paciente_id, medico_id, canal_origen, reservado_hasta, mp_status, monto, reintegro_estado")
    .not("paciente_id", "is", null)
    .not("estado", "in", `(${SLOTS.join(",")})`)
    .order("fecha", { ascending: false })
    .limit(200);
  if (desde) qTurnos = qTurnos.gte("fecha", desde);
  if (hasta) qTurnos = qTurnos.lte("fecha", hasta);

  const [{ data: consultas }, { data: turnosRaw }] = await Promise.all([query, qTurnos]);
  const turnos = sinReservasAbandonadas(turnosRaw ?? []);

  const evidencias = new Map<string, unknown>();
  if (!esInstitucional() && (consultas ?? []).length > 0) {
    const { data: evs } = await admin.from("consultas").select("id, cierre_evidencia").in("id", (consultas ?? []).map((c) => c.id));
    for (const e of evs ?? []) evidencias.set(e.id, e.cierre_evidencia);
  }
  // Lo mismo para los turnos: la columna existe solo en la base del B2C.
  const evidenciasTurno = new Map<string, unknown>();
  if (!esInstitucional() && turnos.length > 0) {
    const { data: evs } = await admin.from("turnos").select("id, cierre_evidencia").in("id", turnos.map((t) => t.id));
    for (const e of evs ?? []) evidenciasTurno.set(e.id, e.cierre_evidencia);
  }

  const medicoIds = [...new Set([...(consultas ?? []).map((c) => c.medico_id), ...turnos.map((t) => t.medico_id)])];
  const pacienteIds = [...new Set([...(consultas ?? []).map((c) => c.paciente_id), ...turnos.map((t) => t.paciente_id)])].filter(Boolean);
  const n = await nombres(admin, medicoIds, pacienteIds);

  const cobrado = (f: { monto: number | null; mp_status: string | null; reintegro_estado: string | null }) =>
    pagada(f) ? Number(f.monto) || 0 : 0;

  return [
    ...(consultas ?? []).filter((c) => n.real(c.medico_id, c.paciente_id)).map<AtencionQuePaso>((c) => ({
      id: c.id, tipo: "CI", canal: "ci", estado: c.estado,
      medico: n.medico(c.medico_id), profesion: n.profesion(c.medico_id), paciente: n.paciente(c.paciente_id),
      inicio: c.created_at, especialidad: c.especialidad ?? "",
      porque: diagnosticarConsulta({ ...c, cierre_evidencia: (evidencias.get(c.id) as never) ?? null }),
      cobrado: cobrado(c),
    })),
    ...turnos.filter((t) => n.real(t.medico_id, t.paciente_id)).map<AtencionQuePaso>((t) => ({
      id: t.id, tipo: "Turno",
      canal: (t.canal_origen as string) === "consultorio_privado" ? "consultorio" : "clinica",
      estado: t.estado,
      medico: n.medico(t.medico_id), profesion: n.profesion(t.medico_id), paciente: n.paciente(t.paciente_id),
      // El "inicio" de un turno es la hora de la cita, no cuándo se reservó.
      inicio: `${t.fecha}T${String(t.hora_inicio).slice(0, 8)}-03:00`,
      especialidad: "",
      porque: diagnosticarTurno(t, (evidenciasTurno.get(t.id) as never) ?? null),
      cobrado: cobrado(t),
    })),
  ].sort((a, b) => Date.parse(b.inicio) - Date.parse(a.inicio));
}

export type EsperandoAhora = { id: string; medico: string; paciente: string; especialidad: string; desde: string; minutos: number };
export type EnCursoAhora = { id: string; tipo: "CI" | "Turno"; medico: string; paciente: string; estado: string };
export type Ahora = { esperando: EsperandoAhora[]; enCurso: EnCursoAhora[] };

/**
 * Lo que está pasando en este instante: pedidos de consulta inmediata que nadie
 * aceptó todavía, y atenciones vivas (CI aceptada, pagada o en curso; turno en
 * curso). Mismo criterio que la solapa "En curso ahora" del admin.
 */
export async function cargarAhora(admin: SupabaseClient, ahora = Date.now()): Promise<Ahora> {
  const [{ data: esperando }, { data: vivas }, { data: turnos }] = await Promise.all([
    admin.from("consultas").select("id, especialidad, created_at, paciente_id, medico_id").eq("estado", "esperando").order("created_at", { ascending: true }),
    admin.from("consultas").select("id, estado, paciente_id, medico_id").in("estado", ["aceptada", "pagada", "en_curso"]).order("created_at", { ascending: true }),
    admin.from("turnos").select("id, estado, paciente_id, medico_id").eq("estado", "en_curso"),
  ]);
  const todas = [...(esperando ?? []), ...(vivas ?? []), ...(turnos ?? [])];
  const n = await nombres(
    admin,
    [...new Set(todas.map((x) => x.medico_id as string))],
    [...new Set(todas.map((x) => x.paciente_id as string | null))].filter((x): x is string => !!x)
  );
  return {
    esperando: (esperando ?? []).filter((c) => n.real(c.medico_id, c.paciente_id)).map((c) => ({
      id: c.id, medico: n.medico(c.medico_id), paciente: n.paciente(c.paciente_id), especialidad: c.especialidad ?? "",
      desde: c.created_at, minutos: Math.max(0, Math.round((ahora - Date.parse(c.created_at)) / 60_000)),
    })),
    enCurso: [
      ...(vivas ?? []).filter((c) => n.real(c.medico_id, c.paciente_id)).map<EnCursoAhora>((c) => ({ id: c.id, tipo: "CI", medico: n.medico(c.medico_id), paciente: n.paciente(c.paciente_id), estado: c.estado })),
      ...(turnos ?? []).filter((t) => n.real(t.medico_id, t.paciente_id)).map<EnCursoAhora>((t) => ({ id: t.id, tipo: "Turno", medico: n.medico(t.medico_id), paciente: n.paciente(t.paciente_id), estado: t.estado })),
    ],
  };
}

// ── Parte pura ──────────────────────────────────────────────────────────────

export type ResumenDia = {
  fecha: string;
  atenciones: AtencionQuePaso[];
  total: number;
  atendidas: number;
  enCurso: number;
  caidas: number;
  /** Cada porqué de caída con cuántas veces apareció, de más a menos. */
  motivos: { texto: string; n: number }[];
  cobrado: number;
};

/** Día argentino de una atención (la CI por su pedido, el turno por su cita). */
export const diaDe = (a: Pick<AtencionQuePaso, "inicio">): string => fechaARdeISO(a.inicio);

function resumir(fecha: string, delDia: AtencionQuePaso[]): ResumenDia {
  const conteo = new Map<string, number>();
  let atendidas = 0, enCurso = 0, caidas = 0, cobrado = 0;
  for (const a of delDia) {
    cobrado += a.cobrado;
    if (a.porque.clase === "atendida") atendidas++;
    else if (a.porque.clase === "en_curso") enCurso++;
    else {
      caidas++;
      conteo.set(a.porque.texto, (conteo.get(a.porque.texto) ?? 0) + 1);
    }
  }
  const motivos = [...conteo.entries()].map(([texto, n]) => ({ texto, n })).sort((x, y) => y.n - x.n || x.texto.localeCompare(y.texto, "es"));
  // Lo más nuevo arriba (mandato de listados).
  const atenciones = [...delDia].sort((a, b) => Date.parse(b.inicio) - Date.parse(a.inicio));
  return { fecha, atenciones, total: delDia.length, atendidas, enCurso, caidas, motivos, cobrado };
}

/** Un día argentino. */
export const resumirDia = (fecha: string, atenciones: AtencionQuePaso[]): ResumenDia =>
  resumir(fecha, atenciones.filter((a) => diaDe(a) === fecha));

/** Un rango de días argentinos, inclusive, con la misma forma que un día. */
export const resumirRango = (desde: string, hasta: string, atenciones: AtencionQuePaso[]): ResumenDia =>
  resumir(`${desde}..${hasta}`, atenciones.filter((a) => { const d = diaDe(a); return d >= desde && d <= hasta; }));
