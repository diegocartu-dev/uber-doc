// El revisor de caídas (Diego, 06/10/2026): cada consulta inmediata y cada turno
// pago que se cierra sin atenderse recibe su etiqueta sola, y SOLO suena cuando
// falló un proceso o falta la evidencia para saberlo. Lo que decidió una persona
// queda descripto y no suena: "no queremos alarmas de sucesos, queremos alarmas
// de procesos que fallan".
//
// · Una vez por atención: la marca `cierre_evidencia.revisada_at` dice "ya vista".
//   No depende de que el cron corra puntual (los crons de Vercel tienen huecos).
// · Consultas: si el cierre no dejó evidencia, se escribe acá antes de etiquetar.
//   Turnos: la evidencia se arma acá (avisos, sala, video) y se guarda con la marca.
// · Los turnos se buscan por su fecha (el cierre de un turno no escribe
//   resuelta_at): así entra también la cancelación hecha días antes.
// · Un solo mail por corrida con todo lo que suena, con nombres: el mail es
//   privado. Nada de esto va al repo (es público).
// · Las cuentas de prueba no suenan, salvo pedido explícito de una prueba.

import { createAdminClient } from "@/lib/supabase/admin";
import { sendDoctoAlert } from "@/lib/alertas";
import { registrarEvidenciaCierre, type EvidenciaCierre } from "./evidencia-cierre";
import { evidenciaTurno, type EvidenciaTurno } from "./evidencia-turno";
import { diagnosticarConsulta, diagnosticarTurno, suena, type Diagnostico } from "./diagnostico";
import { setsDeTest, esTest } from "@/lib/insights/filtro-test";

type Admin = ReturnType<typeof createAdminClient>;

/** Estados en los que la consulta sigue viva o terminó atendida: no hay caída que revisar. */
const NO_SON_CAIDAS = "(esperando,aceptada,pagada,en_curso,completada)";
const TURNO_CAIDO = ["ausente_medico", "ausente_paciente", "cancelado_medico", "cancelado_paciente"];
const TURNO_PAGO = ["approved", "refunded", "charged_back"];
const VENTANA_HORAS = 6;
const DIAS_ATRAS_TURNOS = 2;
/** Margen para que el cierre termine de escribir lo suyo antes de mirarlo. */
const MARGEN_MS = 2 * 60_000;

const COLUMNAS_CI =
  "id, estado, medico_id, paciente_id, aceptada_at, resuelta_por, resuelta_at, resolucion_motivo, pago_id, mp_status, sala_video_url, en_curso_at, cierre_evidencia";
const COLUMNAS_TURNO = "id, estado, fecha, hora_inicio, medico_id, paciente_id, mp_status, cierre_evidencia";

type FilaCI = {
  id: string;
  estado: string;
  medico_id: string | null;
  paciente_id: string | null;
  aceptada_at: string | null;
  resuelta_por: string | null;
  resuelta_at: string | null;
  resolucion_motivo: string | null;
  pago_id: string | null;
  mp_status: string | null;
  sala_video_url: string | null;
  en_curso_at: string | null;
  cierre_evidencia: (Partial<EvidenciaCierre> & Record<string, unknown>) | null;
};
type FilaTurno = {
  id: string;
  estado: string;
  fecha: string;
  hora_inicio: string | null;
  medico_id: string | null;
  paciente_id: string | null;
  mp_status: string | null;
  cierre_evidencia: (Partial<EvidenciaTurno> & Record<string, unknown>) | null;
};
/** Lo que va al mail. `pacienteUser` para CI (user_id), `pacienteId` para turnos (pacientes.id). */
type Sonando = {
  tipo: "Consulta inmediata" | "Turno";
  id: string;
  cuando: string;
  medicoId: string | null;
  pacienteUser?: string | null;
  pacienteId?: string | null;
  d: Diagnostico;
};

export type ResultadoCaidas = { revisadas: number; sonaron: number; sucesos: number; test: number };

const horaAR = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "?";

/**
 * `prueba`: id de UNA consulta o turno para probar la alarma de punta a punta.
 * Incluye cuentas de prueba, el mail dice [PRUEBA] y no deja la marca de revisada.
 */
export async function revisarCaidas(opciones: { prueba?: string } = {}): Promise<ResultadoCaidas> {
  const admin = createAdminClient();
  const res: ResultadoCaidas = { revisadas: 0, sonaron: 0, sucesos: 0, test: 0 };
  const sets = await setsDeTest(admin);
  const sonando: Sonando[] = [];
  const prueba = opciones.prueba;

  await revisarConsultas(admin, sets, res, sonando, prueba);
  await revisarTurnos(admin, sets, res, sonando, prueba);

  if (sonando.length) {
    await mandarAlarma(admin, sonando, Boolean(prueba));
    res.sonaron = sonando.length;
  }
  return res;
}

async function revisarConsultas(
  admin: Admin,
  sets: Awaited<ReturnType<typeof setsDeTest>>,
  res: ResultadoCaidas,
  sonando: Sonando[],
  prueba?: string
): Promise<void> {
  const ahora = Date.now();
  let query = admin.from("consultas").select(COLUMNAS_CI);
  query = prueba
    ? query.eq("id", prueba)
    : query
        .gte("resuelta_at", new Date(ahora - VENTANA_HORAS * 3_600_000).toISOString())
        .lte("resuelta_at", new Date(ahora - MARGEN_MS).toISOString())
        .not("estado", "in", NO_SON_CAIDAS)
        .order("resuelta_at", { ascending: true })
        .limit(200);
  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron leer las consultas: ${error.message}`);

  for (const fila of ((data ?? []) as FilaCI[]).filter((f) => prueba || !f.cierre_evidencia?.revisada_at)) {
    if (!prueba && esTest(sets, fila.medico_id, fila.paciente_id)) {
      res.test++;
      await marcar(admin, "consultas", fila.id, fila.cierre_evidencia ?? { at: new Date().toISOString() });
      continue;
    }
    if (!fila.cierre_evidencia) {
      await registrarEvidenciaCierre(fila.id);
      const { data: ev } = await admin.from("consultas").select("cierre_evidencia").eq("id", fila.id).maybeSingle();
      fila.cierre_evidencia = (ev?.cierre_evidencia as FilaCI["cierre_evidencia"]) ?? null;
    }
    const d = diagnosticarConsulta(fila);
    res.revisadas++;
    if (suena(d)) {
      sonando.push({ tipo: "Consulta inmediata", id: fila.id, cuando: horaAR(fila.resuelta_at), medicoId: fila.medico_id, pacienteUser: fila.paciente_id, d });
    } else res.sucesos++;
    if (!prueba) await marcar(admin, "consultas", fila.id, fila.cierre_evidencia ?? { at: new Date().toISOString() });
  }
}

async function revisarTurnos(
  admin: Admin,
  sets: Awaited<ReturnType<typeof setsDeTest>>,
  res: ResultadoCaidas,
  sonando: Sonando[],
  prueba?: string
): Promise<void> {
  let query = admin.from("turnos").select(COLUMNAS_TURNO);
  if (prueba) {
    query = query.eq("id", prueba);
  } else {
    const desde = new Date(Date.now() - DIAS_ATRAS_TURNOS * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
    query = query.in("estado", TURNO_CAIDO).in("mp_status", TURNO_PAGO).gte("fecha", desde).limit(200);
  }
  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron leer los turnos: ${error.message}`);

  for (const t of ((data ?? []) as FilaTurno[]).filter((f) => prueba || !f.cierre_evidencia?.revisada_at)) {
    if (!prueba && esTest(sets, t.medico_id, t.paciente_id)) {
      res.test++;
      await marcar(admin, "turnos", t.id, { at: new Date().toISOString() });
      continue;
    }
    const ev = await evidenciaTurno(t.id);
    const d = diagnosticarTurno(t, ev);
    res.revisadas++;
    if (suena(d)) {
      const cuando = `${t.fecha.split("-").reverse().slice(0, 2).join("/")} ${String(t.hora_inicio ?? "").slice(0, 5)}`;
      sonando.push({ tipo: "Turno", id: t.id, cuando, medicoId: t.medico_id, pacienteId: t.paciente_id, d });
    } else res.sucesos++;
    if (!prueba) await marcar(admin, "turnos", t.id, ev);
  }
}

async function marcar(admin: Admin, tabla: "consultas" | "turnos", id: string, ev: Record<string, unknown>): Promise<void> {
  await admin.from(tabla).update({ cierre_evidencia: { ...ev, revisada_at: new Date().toISOString() } }).eq("id", id);
}

async function mandarAlarma(admin: Admin, sonando: Sonando[], prueba: boolean): Promise<void> {
  const medIds = [...new Set(sonando.map((s) => s.medicoId).filter(Boolean))] as string[];
  const users = [...new Set(sonando.map((s) => s.pacienteUser).filter(Boolean))] as string[];
  const pacIds = [...new Set(sonando.map((s) => s.pacienteId).filter(Boolean))] as string[];
  const vacio = Promise.resolve({ data: [] as never[] });
  const [{ data: meds }, { data: porUser }, { data: porId }] = await Promise.all([
    medIds.length ? admin.from("medicos").select("id, nombre_completo").in("id", medIds) : vacio,
    users.length ? admin.from("pacientes").select("user_id, nombre_completo").in("user_id", users) : vacio,
    pacIds.length ? admin.from("pacientes").select("id, nombre_completo").in("id", pacIds) : vacio,
  ]);
  const med = new Map(((meds ?? []) as { id: string; nombre_completo: string | null }[]).map((m) => [m.id, m.nombre_completo ?? "?"]));
  const pacU = new Map(((porUser ?? []) as { user_id: string; nombre_completo: string | null }[]).map((p) => [p.user_id, p.nombre_completo ?? "?"]));
  const pacI = new Map(((porId ?? []) as { id: string; nombre_completo: string | null }[]).map((p) => [p.id, p.nombre_completo ?? "?"]));

  const lineas = sonando.map((s) => {
    const paciente = s.pacienteUser ? pacU.get(s.pacienteUser) : s.pacienteId ? pacI.get(s.pacienteId) : undefined;
    const link = s.tipo === "Turno" ? "https://www.docto.com.ar/admin/consultas" : `https://www.docto.com.ar/admin/consultas/${s.id}`;
    return [
      `• ${s.d.clase === "falla" ? "FALLA" : "SIN DATOS"} — ${s.d.texto}`,
      `  ${s.tipo} · ${s.cuando} · Profesional: ${med.get(s.medicoId ?? "") ?? "?"} · Paciente: ${paciente ?? "?"}`,
      `  ${link}`,
    ].join("\n");
  });
  const n = sonando.length;
  await sendDoctoAlert(
    `${prueba ? "[PRUEBA] " : ""}${n === 1 ? "Una atención se cayó por una falla" : `${n} atenciones se cayeron por fallas`}`,
    [
      n === 1
        ? "Esta atención no se hizo y la causa es un proceso que falló (o falta el dato para saberlo):"
        : "Estas atenciones no se hicieron y la causa es un proceso que falló (o falta el dato para saberlo):",
      "",
      ...lineas,
      "",
      "Las que decidió una persona (no pagó, se retiró, canceló el paciente) no suenan: quedan descriptas en el panel.",
    ].join("\n")
  );
}
