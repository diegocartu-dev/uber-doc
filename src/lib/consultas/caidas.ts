// El revisor de caídas (Diego, 06/10/2026): cada consulta inmediata que se cierra
// sin atenderse recibe su etiqueta sola (`diagnosticarConsulta`), y SOLO suena
// cuando falló un proceso o falta la evidencia para saberlo. Lo que decidió una
// persona queda descripto y no suena: "no queremos alarmas de sucesos, queremos
// alarmas de procesos que fallan".
//
// · Una vez por consulta: la marca `cierre_evidencia.revisada_at` dice "ya vista".
//   No depende de que el cron corra puntual (los crons de Vercel tienen huecos).
// · Si el cierre no dejó evidencia (hay caminos que no la escriben), se escribe
//   acá antes de etiquetar: lo que se sabe sigue en la base unos minutos después.
// · Un solo mail por corrida con todas las caídas que suenan, con nombres: el
//   mail es privado. Nada de esto va al repo (es público).
// · Las cuentas de prueba no suenan, salvo pedido explícito de una prueba.

import { createAdminClient } from "@/lib/supabase/admin";
import { sendDoctoAlert } from "@/lib/alertas";
import { registrarEvidenciaCierre, type EvidenciaCierre } from "./evidencia-cierre";
import { diagnosticarConsulta, suena, type Diagnostico } from "./diagnostico";
import { setsDeTest, esTest } from "@/lib/insights/filtro-test";

/** Estados en los que la consulta sigue viva o terminó atendida: no hay caída que revisar. */
const NO_SON_CAIDAS = "(esperando,aceptada,pagada,en_curso,completada)";
const VENTANA_HORAS = 6;
/** Margen para que el cierre termine de escribir lo suyo antes de mirarlo. */
const MARGEN_MS = 2 * 60_000;

const COLUMNAS =
  "id, estado, medico_id, paciente_id, aceptada_at, resuelta_por, resuelta_at, resolucion_motivo, pago_id, mp_status, sala_video_url, en_curso_at, cierre_evidencia";

type Fila = {
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

export type ResultadoCaidas = { revisadas: number; sonaron: number; sucesos: number; test: number };

/**
 * `prueba`: id de UNA consulta para probar la alarma de punta a punta. Incluye
 * cuentas de prueba, el mail dice [PRUEBA] y no deja la marca de revisada.
 */
export async function revisarCaidas(opciones: { prueba?: string } = {}): Promise<ResultadoCaidas> {
  const admin = createAdminClient();
  const res: ResultadoCaidas = { revisadas: 0, sonaron: 0, sucesos: 0, test: 0 };
  const ahora = Date.now();

  let query = admin.from("consultas").select(COLUMNAS);
  query = opciones.prueba
    ? query.eq("id", opciones.prueba)
    : query
        .gte("resuelta_at", new Date(ahora - VENTANA_HORAS * 3_600_000).toISOString())
        .lte("resuelta_at", new Date(ahora - MARGEN_MS).toISOString())
        .not("estado", "in", NO_SON_CAIDAS)
        .order("resuelta_at", { ascending: true })
        .limit(200);
  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron leer las consultas: ${error.message}`);

  const sets = await setsDeTest(admin);
  const pendientes = ((data ?? []) as Fila[]).filter((f) => opciones.prueba || !f.cierre_evidencia?.revisada_at);
  const sonando: { fila: Fila; d: Diagnostico }[] = [];

  for (const fila of pendientes) {
    if (!opciones.prueba && esTest(sets, fila.medico_id, fila.paciente_id)) {
      res.test++;
      await marcarRevisada(fila);
      continue;
    }
    if (!fila.cierre_evidencia) {
      await registrarEvidenciaCierre(fila.id);
      const { data: ev } = await admin.from("consultas").select("cierre_evidencia").eq("id", fila.id).maybeSingle();
      fila.cierre_evidencia = (ev?.cierre_evidencia as Fila["cierre_evidencia"]) ?? null;
    }
    const d = diagnosticarConsulta(fila);
    res.revisadas++;
    if (suena(d)) sonando.push({ fila, d });
    else res.sucesos++;
    if (!opciones.prueba) await marcarRevisada(fila);
  }

  if (sonando.length) {
    await mandarAlarma(admin, sonando, Boolean(opciones.prueba));
    res.sonaron = sonando.length;
  }
  return res;
}

async function marcarRevisada(fila: Fila): Promise<void> {
  const admin = createAdminClient();
  const ev = fila.cierre_evidencia ?? { at: new Date().toISOString() };
  await admin
    .from("consultas")
    .update({ cierre_evidencia: { ...ev, revisada_at: new Date().toISOString() } })
    .eq("id", fila.id);
}

async function mandarAlarma(
  admin: ReturnType<typeof createAdminClient>,
  sonando: { fila: Fila; d: Diagnostico }[],
  prueba: boolean
): Promise<void> {
  const medIds = [...new Set(sonando.map((s) => s.fila.medico_id).filter(Boolean))] as string[];
  const pacIds = [...new Set(sonando.map((s) => s.fila.paciente_id).filter(Boolean))] as string[];
  const [{ data: meds }, { data: pacs }] = await Promise.all([
    medIds.length ? admin.from("medicos").select("id, nombre_completo").in("id", medIds) : Promise.resolve({ data: [] }),
    pacIds.length ? admin.from("pacientes").select("user_id, nombre_completo").in("user_id", pacIds) : Promise.resolve({ data: [] }),
  ]);
  const med = new Map(((meds ?? []) as { id: string; nombre_completo: string | null }[]).map((m) => [m.id, m.nombre_completo ?? "?"]));
  const pac = new Map(((pacs ?? []) as { user_id: string; nombre_completo: string | null }[]).map((p) => [p.user_id, p.nombre_completo ?? "?"]));
  const hora = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "?";

  const lineas = sonando.map(({ fila, d }) =>
    [
      `• ${d.clase === "falla" ? "FALLA" : "SIN DATOS"} — ${d.texto}`,
      `  Consulta inmediata · ${hora(fila.resuelta_at)} · Profesional: ${med.get(fila.medico_id ?? "") ?? "?"} · Paciente: ${pac.get(fila.paciente_id ?? "") ?? "?"}`,
      `  https://www.docto.com.ar/admin/consultas/${fila.id}`,
    ].join("\n")
  );
  const n = sonando.length;
  await sendDoctoAlert(
    `${prueba ? "[PRUEBA] " : ""}${n === 1 ? "Una consulta se cayó por una falla" : `${n} consultas se cayeron por fallas`}`,
    [
      n === 1 ? "Esta consulta no se atendió y la causa es un proceso que falló (o falta el dato para saberlo):" : "Estas consultas no se atendieron y la causa es un proceso que falló (o falta el dato para saberlo):",
      "",
      ...lineas,
      "",
      "Las que decidió una persona (no pagó, se retiró) no suenan: quedan descriptas en el panel.",
    ].join("\n")
  );
}
