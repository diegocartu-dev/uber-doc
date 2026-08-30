import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin } from "@/lib/admin-auth";
import { setsDeTest, esTest, leerSoloReales } from "@/lib/insights/filtro-test";
import { fechaAR, medianocheARenUTC } from "@/lib/insights/fechas";
import { clasificarAtencion } from "@/lib/consultas/clasificar";

// ── Página "Demanda" (ex Funnel) — directiva Diego 28/07 ─────────────────────
// "Deberíamos ver esto pero desagregado: qué buscaban, cuándo, y si estaba o no
//  disponible. Un paciente de La Pampa no encontró nada porque no hay médicos de
//  La Pampa. Un paciente buscó CI en CABA y no había nadie disponible. ¿Los
//  match estaban o no?"
//
// Cada BÚSQUEDA = una sesión de vistas de la clínica (mismo paciente, huecos de
// más de 30 min separan sesiones). Para cada una respondemos:
//  - quién y de qué provincia
//  - cuánta oferta había PARA ÉL en ese momento:
//      · snapshot exacto si el evento lo trae (se graba desde el 28/07)
//      · si no, reconstrucción: médicos cuya jurisdicción cubre su provincia
//        (estado ACTUAL, aproximación) + CI en línea EXACTA a esa hora vía
//        disponibilidad_log
//  - qué pasó después (eligió → pagó → se atendió), ventana de 2 h.

const SESION_GAP_MS = 30 * 60_000;
const VENTANA_RESULTADO_MS = 2 * 3600_000;

type Snapshot = { provincia?: string; medicosVisibles?: number; ciOnline?: number; conAgendaTurnos?: number };

export async function GET(req: NextRequest) {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const dias = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("dias") ?? "30", 10) || 30, 1), 365);
  const soloReales = leerSoloReales(req.nextUrl.searchParams);
  const desde = fechaAR(dias);
  const desdeUTC = medianocheARenUTC(desde);
  const admin = createAdminClient();

  const [{ data: eventosRaw }, { data: pacientesRaw }, { data: medicosRaw }, { data: logRaw }, { data: consultasRaw }, sets] =
    await Promise.all([
      admin.from("eventos_funnel").select("evento, paciente_id, metadata, created_at").in("evento", ["clinica_vista", "medico_elegido", "pago_creado", "pago_aprobado"]).gte("created_at", desdeUTC).order("created_at", { ascending: true }),
      admin.from("pacientes").select("id, user_id, nombre_completo, provincia, es_cuenta_test"),
      admin.from("medicos").select("id, nombre_completo, jurisdicciones, es_cuenta_test, verificado"),
      admin.from("disponibilidad_log").select("medico_id, online, at").gte("at", desdeUTC).order("at", { ascending: true }),
      admin
        .from("consultas")
        .select(
          "paciente_id, medico_id, estado, created_at, aceptada_at, mp_status, resuelta_por, resolucion_motivo, pago_id, sala_video_url, en_curso_at"
        )
        .gte("created_at", desdeUTC),
      setsDeTest(admin),
    ]);

  // Pacientes: eventos y consultas usan user_id, turnos usan id → doble mapa.
  type Pac = { nombre: string; provincia: string | null; test: boolean };
  const pacPorUser = new Map<string, Pac>();
  const pacPorId = new Map<string, Pac>();
  for (const p of pacientesRaw ?? []) {
    const pac: Pac = { nombre: p.nombre_completo, provincia: p.provincia, test: !!p.es_cuenta_test };
    if (p.user_id) pacPorUser.set(p.user_id, pac);
    pacPorId.set(p.id, pac);
  }
  const pacDe = (pid: string) => pacPorUser.get(pid) ?? pacPorId.get(pid);

  // Los NOMBRES se necesitan de todos (incluso de un profesional hoy no
  // verificado: la búsqueda vieja igual tiene que decir a quién eligió).
  // El cálculo de OFERTA, en cambio, sigue contando solo a los verificados.
  const nombreDeMedico = new Map((medicosRaw ?? []).map((m) => [m.id, m.nombre_completo ?? "—"]));
  const medicos = (medicosRaw ?? []).filter((m) => m.verificado && (!soloReales || !m.es_cuenta_test));
  const medicosDeProvincia = (prov: string | null): number =>
    prov ? medicos.filter((m) => ((m.jurisdicciones as string[] | null) ?? []).includes(prov)).length : 0;

  // Log de disponibilidad por médico (ordenado asc) para reconstruir CI online a un instante.
  const logPorMedico = new Map<string, { atMs: number; online: boolean }[]>();
  for (const l of logRaw ?? []) {
    const arr = logPorMedico.get(l.medico_id) ?? [];
    arr.push({ atMs: Date.parse(l.at), online: !!l.online });
    logPorMedico.set(l.medico_id, arr);
  }
  const ciOnlineEn = (tMs: number, prov: string | null): number => {
    let n = 0;
    for (const m of medicos) {
      if (prov && !(((m.jurisdicciones as string[] | null) ?? []).includes(prov))) continue;
      const arr = logPorMedico.get(m.id);
      if (!arr) continue;
      let estado = false;
      for (const e of arr) {
        if (e.atMs > tMs) break;
        estado = e.online;
      }
      if (estado) n++;
    }
    return n;
  };

  const eventos = (eventosRaw ?? []).filter((e) => {
    if (!e.paciente_id) return false;
    if (!soloReales) return true;
    const pac = pacDe(e.paciente_id);
    return !esTest(sets, null, e.paciente_id) && !pac?.test;
  });

  // ── Sesiones de búsqueda (clinica_vista agrupadas) ──
  type Sesion = { pacienteId: string; t0: number; tFin: number; vistas: number; snapshot: Snapshot | null };
  const sesiones: Sesion[] = [];
  const ultimaSesionPorPac = new Map<string, Sesion>();
  for (const e of eventos) {
    if (e.evento !== "clinica_vista") continue;
    const t = Date.parse(e.created_at);
    const meta = (e.metadata ?? {}) as Snapshot;
    const conSnapshot = meta.provincia != null || meta.medicosVisibles != null;
    const prev = ultimaSesionPorPac.get(e.paciente_id);
    if (prev && t - prev.tFin <= SESION_GAP_MS) {
      prev.tFin = t;
      prev.vistas++;
      if (conSnapshot && !prev.snapshot) prev.snapshot = meta;
    } else {
      const s: Sesion = { pacienteId: e.paciente_id, t0: t, tFin: t, vistas: 1, snapshot: conSnapshot ? meta : null };
      sesiones.push(s);
      ultimaSesionPorPac.set(e.paciente_id, s);
    }
  }

  // Eventos de avance por paciente (para el resultado de cada búsqueda).
  const avancesPorPac = new Map<string, { evento: string; tMs: number }[]>();
  for (const e of eventos) {
    if (e.evento === "clinica_vista") continue;
    const arr = avancesPorPac.get(e.paciente_id) ?? [];
    arr.push({ evento: e.evento, tMs: Date.parse(e.created_at) });
    avancesPorPac.set(e.paciente_id, arr);
  }
  // Cada pedido se clasifica con `clasificarAtencion` — la fuente de verdad de
  // la escalera intento/consulta. Antes acá se leía `aceptada_at` a secas, y ese
  // hito recién se registra desde el 20/08 (#430): de 77 consultas, 6 lo tienen
  // y 51 más SÍ fueron aceptadas pero solo se sabe por el pago o la sala. Con el
  // dato crudo, una consulta aceptada figuraba como "nadie la aceptó".
  const consultasPorPac = new Map<
    string,
    { tMs: number; medicoId: string | null; mpStatus: string | null; clas: ReturnType<typeof clasificarAtencion> }[]
  >();
  for (const c of consultasRaw ?? []) {
    const arr = consultasPorPac.get(c.paciente_id) ?? [];
    arr.push({
      tMs: Date.parse(c.created_at),
      medicoId: (c.medico_id as string | null) ?? null,
      mpStatus: (c.mp_status as string | null) ?? null,
      clas: clasificarAtencion({
        estado: c.estado,
        aceptada_at: c.aceptada_at,
        resuelta_por: c.resuelta_por,
        resolucion_motivo: c.resolucion_motivo,
        pago_id: c.pago_id,
        mp_status: c.mp_status,
        sala_video_url: c.sala_video_url,
        en_curso_at: c.en_curso_at,
      }),
    });
    consultasPorPac.set(c.paciente_id, arr);
  }

  const busquedas = sesiones.map((s) => {
    const pac = pacDe(s.pacienteId);
    const provincia = s.snapshot?.provincia ?? pac?.provincia ?? null;
    const medicosProv = s.snapshot?.medicosVisibles ?? medicosDeProvincia(provincia);
    const ciOnline = s.snapshot?.ciOnline ?? ciOnlineEn(s.t0, provincia);

    const en = (tMs: number) => tMs >= s.t0 && tMs <= s.tFin + VENTANA_RESULTADO_MS;
    const avances = avancesPorPac.get(s.pacienteId) ?? [];
    const eligio = avances.some((a) => a.evento === "medico_elegido" && en(a.tMs));
    const pago = avances.some((a) => (a.evento === "pago_creado" || a.evento === "pago_aprobado") && en(a.tMs));
    const cons = (consultasPorPac.get(s.pacienteId) ?? []).filter((c) => en(c.tMs));
    const seAtendio = cons.some((c) => c.clas.desenlace === "atendida");
    // ACÁ HABÍA UNA LISTA DE ESTADOS A MANO QUE INCLUÍA `esperando` — o sea, el
    // pedido que NADIE aceptó y que nadie pagó se contaba como "pagó". Un fallo
    // de oferta entraba al tablero como plata cobrada. Se usa el helper que ya
    // es la fuente de verdad del pago (mira `mp_status`, no solo el estado).
    const pagoConsulta = pago || cons.some((c) => c.clas.fuePagada);
    // ¿Algún profesional se hizo cargo? Sin esto, "eligió y nadie lo atendió" y
    // "eligió y no pagó" son la misma fila, y son problemas opuestos.
    const alguienAcepto = cons.some((c) => c.clas.fueAceptada);
    // A QUIÉN eligió y qué hizo cada uno. Es el dato accionable: sin el nombre,
    // "nadie lo aceptó" no sirve ni para reavisarle a alguien (pedido Diego).
    const pedidos = cons.map((c) => ({
      medico: c.medicoId ? nombreDeMedico.get(c.medicoId) ?? "—" : "—",
      desenlace: c.clas.desenlace,
      acepto: c.clas.fueAceptada,
      // "hito" = el sistema registró la aceptación. "inferido" = se dedujo del
      // pago o la sala. "no" = no hay rastro de que nadie la tomara — y en una
      // fila anterior al 20/08 eso NO prueba que el profesional la haya ignorado.
      certeza: c.clas.origenAceptacion,
    }));
    // Un pedido que el PACIENTE retiró no es una falla del profesional. Antes
    // los dos casos caían en "nadie lo aceptó": con el nombre a la vista, eso
    // sería acusar a alguien que no hizo nada.
    const hayFallaDeOferta = pedidos.some((p) => p.desenlace === "sin_respuesta");
    const soloRetiros =
      pedidos.length > 0 && !hayFallaDeOferta && pedidos.every((p) => p.desenlace !== "en_progreso");

    let resultado: string;
    let matchHabia: boolean;
    if (!provincia) {
      resultado = "sin provincia cargada";
      matchHabia = medicos.length > 0;
    } else if (medicosProv === 0) {
      resultado = "sin médicos para su provincia";
      matchHabia = false;
    } else if (seAtendio) {
      resultado = "se atendió";
      matchHabia = true;
    } else if (pagoConsulta) {
      resultado = "pagó";
      matchHabia = true;
    } else if (eligio && !alguienAcepto && soloRetiros) {
      // El paciente se fue por su cuenta antes de que nadie lo tomara. Ruido
      // normal, no falla de oferta: hubo match, lo dejó él.
      resultado = "eligió, el paciente se retiró";
      matchHabia = true;
    } else if (eligio && !alguienAcepto) {
      // El paciente eligió y del otro lado no hubo nadie: a los 10 minutos el
      // pedido se cancela solo (`PLAZO_SIN_ACEPTAR_MIN`). Antes esto caía en
      // "eligió médico, no pagó", que se lee como un problema de cobros y manda
      // a revisar Mercado Pago — cuando nunca se llegó a intentar un pago.
      resultado = "eligió, nadie lo aceptó";
      matchHabia = false;
    } else if (eligio) {
      resultado = "eligió médico, no pagó";
      matchHabia = true;
    } else if (ciOnline === 0) {
      resultado = "había médicos pero ninguno en línea";
      matchHabia = false;
    } else {
      resultado = "había oferta, no eligió";
      matchHabia = true;
    }

    return {
      cuando: s.t0,
      paciente: pac?.nombre ?? "—",
      provincia,
      vistas: s.vistas,
      medicosProvincia: medicosProv,
      ciOnline,
      exacto: !!s.snapshot,
      pedidos,
      resultado,
      matchHabia,
    };
  }).sort((a, b) => b.cuando - a.cuando);

  // ── Resúmenes ──
  const etapas = {
    busquedas: busquedas.length,
    eligieron: busquedas.filter((b) => ["se atendió", "pagó", "eligió médico, no pagó", "eligió, nadie lo aceptó"].includes(b.resultado)).length,
    pagaron: busquedas.filter((b) => ["se atendió", "pagó"].includes(b.resultado)).length,
    seAtendieron: busquedas.filter((b) => b.resultado === "se atendió").length,
    sinMatch: busquedas.filter((b) => !b.matchHabia).length,
  };

  const porProvincia = new Map<string, { busquedas: number; sinMatch: number; medicosHoy: number }>();
  for (const b of busquedas) {
    const key = b.provincia ?? "Sin provincia";
    const e = porProvincia.get(key) ?? { busquedas: 0, sinMatch: 0, medicosHoy: medicosDeProvincia(b.provincia) };
    e.busquedas++;
    if (!b.matchHabia) e.sinMatch++;
    porProvincia.set(key, e);
  }

  return NextResponse.json({
    dias,
    etapas,
    porProvincia: [...porProvincia.entries()]
      .map(([provincia, d]) => ({ provincia, ...d }))
      .sort((a, b) => b.busquedas - a.busquedas),
    busquedas: busquedas.slice(0, 100),
  });
}
