import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin } from "@/lib/admin-auth";
import { setsDeTest, esTest, leerSoloReales } from "@/lib/insights/filtro-test";

// Panel "Funnel": recorrido del paciente en Consulta Inmediata
//   Entró (sala de espera) → Pagó → Entró al video → Completó, + los que cancelaron,
// y la demanda por médico (cuántos pacientes eligieron a cada uno).
//
// Notas de datos (ver memoria project_esquema_atenciones_insights):
//  - "Aceptado" no tiene timestamp confiable (aceptada_at casi nunca se guarda) →
//    se usa "entró al video" como proxy (si entró al video, el médico lo aceptó).
//  - Las etapas se miden por SEÑAL combinada (estado + timestamps + pago) para
//    sortear los huecos de los timestamps.
//  - Toggle test: por defecto excluye consultas de médicos de prueba.

function fechaAR(offset = 0) {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  d.setDate(d.getDate() - offset);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type C = { medico_id: string; paciente_id: string; estado: string; en_curso_at: string | null; mp_status: string | null; pago_id: string | null };
const pago = (c: C) => !!(c.pago_id || c.mp_status === "approved" || ["pagada", "aceptada", "en_curso", "completada"].includes(c.estado));
const video = (c: C) => !!(c.en_curso_at || ["en_curso", "completada"].includes(c.estado));

export async function GET(req: NextRequest) {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const dias = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("dias") ?? "30", 10) || 30, 1), 365);
  const soloReales = leerSoloReales(req.nextUrl.searchParams);
  const desde = fechaAR(dias);
  const admin = createAdminClient();

  const [{ data: consultas }, { data: medicos }, { data: pacientes }, { data: eventos }, sets] = await Promise.all([
    admin.from("consultas").select("id, medico_id, paciente_id, estado, en_curso_at, mp_status, pago_id, created_at").gte("created_at", desde),
    admin.from("medicos").select("id, nombre_completo, es_cuenta_test"),
    admin.from("pacientes").select("user_id, dni, fecha_nacimiento, sexo_dni, es_cuenta_test, created_at").gte("created_at", desde),
    admin.from("eventos_funnel").select("evento, paciente_id, created_at").in("evento", ["clinica_vista", "medico_elegido", "pago_creado"]).gte("created_at", desde),
    setsDeTest(admin),
  ]);

  const medMap = new Map((medicos ?? []).map((m) => [m.id, { nombre: m.nombre_completo as string, test: !!m.es_cuenta_test }]));
  let cs = (consultas ?? []) as C[];
  // Solo reales (default): excluye si el médico O el paciente son cuenta test.
  if (soloReales) cs = cs.filter((c) => !esTest(sets, c.medico_id, c.paciente_id));

  // Funnel TARDÍO (Consulta Inmediata, por consulta) — el que ya existía.
  const funnel = {
    entraron: cs.length,
    pagaron: cs.filter(pago).length,
    video: cs.filter(video).length,
    completaron: cs.filter((c) => c.estado === "completada").length,
    cancelaron: cs.filter((c) => c.estado === "cancelada").length,
  };

  // RECORRIDO COMPLETO del paciente: pacientes DISTINTOS por etapa en el período.
  //   registró → completó perfil → entró a la clínica → eligió médico → inició pago → pagó → se atendió
  // Las dos etapas del medio (clínica/médico) se instrumentaron el 22/06 → para
  // períodos viejos dan 0 aunque haya habido visitas (antes no se medían). Se marcan
  // `nuevo:true` para que la UI lo aclare y no se lea como bug.
  let pac = (pacientes ?? []) as { user_id: string | null; dni: string | null; fecha_nacimiento: string | null; sexo_dni: string | null; es_cuenta_test: boolean | null }[];
  if (soloReales) pac = pac.filter((p) => !p.es_cuenta_test);
  const registro = pac.length;
  const perfil = pac.filter((p) => p.dni && p.fecha_nacimiento && p.sexo_dni).length;

  const distinctPac = (evt: string) => {
    const s = new Set<string>();
    for (const e of (eventos ?? []) as { evento: string; paciente_id: string | null }[]) {
      if (e.evento !== evt || !e.paciente_id) continue;
      if (soloReales && sets.testPac.has(e.paciente_id)) continue;
      s.add(e.paciente_id);
    }
    return s.size;
  };
  const pagoSet = new Set<string>();
  const atendioSet = new Set<string>();
  for (const c of cs) {
    if (pago(c)) pagoSet.add(c.paciente_id);
    if (c.estado === "completada") atendioSet.add(c.paciente_id);
  }

  const etapas = [
    { etapa: "Se registró", n: registro, nuevo: false },
    { etapa: "Completó su perfil", n: perfil, nuevo: false },
    { etapa: "Entró a la clínica", n: distinctPac("clinica_vista"), nuevo: true },
    { etapa: "Eligió un médico", n: distinctPac("medico_elegido"), nuevo: true },
    { etapa: "Inició el pago", n: distinctPac("pago_creado"), nuevo: false },
    { etapa: "Pagó", n: pagoSet.size, nuevo: false },
    { etapa: "Se atendió", n: atendioSet.size, nuevo: false },
  ];
  const base = registro || 1;
  const recorrido = etapas.map((e, i) => {
    const prev = i > 0 ? etapas[i - 1].n : null;
    // Sin "% del paso anterior" si no hay paso anterior o ese paso está en 0 (caso de
    // las etapas recién instrumentadas sin historia → un % sería engañoso, no >100%).
    const pctPaso = prev && prev > 0 ? Math.round((e.n / prev) * 100) : null;
    return { ...e, pct: Math.round((e.n / base) * 100), pctPaso };
  });

  const porMed = new Map<string, { medico: string; test: boolean; pacientes: Set<string>; consultas: number; video: number }>();
  for (const c of cs) {
    const info = medMap.get(c.medico_id);
    if (!porMed.has(c.medico_id)) porMed.set(c.medico_id, { medico: info?.nombre ?? "—", test: !!info?.test, pacientes: new Set(), consultas: 0, video: 0 });
    const e = porMed.get(c.medico_id)!;
    e.pacientes.add(c.paciente_id);
    e.consultas++;
    if (video(c)) e.video++;
  }
  const demandaPorMedico = [...porMed.values()]
    .map((e) => ({ medico: e.medico, test: e.test, pacientes: e.pacientes.size, consultas: e.consultas, video: e.video }))
    .sort((a, b) => b.pacientes - a.pacientes || b.consultas - a.consultas);

  return NextResponse.json({ dias, soloReales, recorrido, funnel, demandaPorMedico });
}
