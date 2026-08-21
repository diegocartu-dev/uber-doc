import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushAlMedico } from "@/lib/push";
import { avisarMedicoEsperandoWhatsApp } from "@/lib/whatsapp";
import { withCron } from "@/lib/cron-guard";

/**
 * Cron cada 10 min (decisión Diego 11/06/2026): re-notificar al médico mientras
 * tenga pacientes pendientes — el primer push puede perderse (teléfono lejos,
 * Concentración, etc.) y un paciente esperando no puede depender de un único aviso.
 *
 * Cubre los 3 casos: CI esperando aceptación, CI pagada sin iniciar video, y
 * turno con el paciente en sala de espera.
 *
 * Diseño:
 * - Solo entradas de sala de espera ABIERTAS cuya consulta/turno sigue PENDIENTE
 *   (estados esperando/aceptada/pagada · en_espera). Las terminadas no molestan.
 * - Solo entradas con >= 8 min de antigüedad: el push inmediato ya avisó al
 *   entrar; esto es un RECORDATORIO, no un duplicado.
 * - Agrupado por médico: un solo push aunque haya N pacientes ("3 pacientes te
 *   esperan"), con tag estable → la notificación se reemplaza (suena de nuevo)
 *   en vez de apilarse.
 * - TOPE DURO de recordatorios por paciente (Diego, 21/08/2026: "no podemos
 *   mandar más de 2"). Ver abajo.
 */

const PENDIENTES_CONSULTA = new Set(["esperando", "aceptada", "pagada"]);
const PENDIENTES_TURNO = new Set(["en_espera"]);
const EDAD_MINIMA_MIN = 8;

/**
 * Recordatorios máximos por entrada de sala. El aviso del momento de entrar no
 * cuenta acá (lo manda `registrarEntradaSala`), así que el techo de mensajes por
 * paciente es 1 + MAX_RECORDATORIOS.
 *
 * POR QUÉ HACE FALTA UN CONTADOR Y NO ALCANZA CON CERRAR LA ENTRADA A TIEMPO:
 * este cron reinsiste mientras la fila siga abierta, y el plazo de la solicitud
 * sin aceptar sólo acota UNO de los tres casos que cubre. Un turno con el
 * paciente en sala, o una CI pagada sin video, pueden seguir vivos horas — y ahí
 * el aviso volvía a encadenarse. El 18/08 una profesional recibió 17 mensajes
 * entre las 22:09 y las 8:30 del día siguiente, uno cada ~40 minutos, madrugada
 * incluida, por un paciente que hacía horas que no estaba. Con un tope, el peor
 * caso posible pasa a ser dos.
 *
 * El contador vive en la fila de la sala de espera: nace y muere con la espera,
 * así que no hay que limpiarlo aparte.
 */
const MAX_RECORDATORIOS = 2;

async function handler(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: entradas, error } = await admin
    .from("sala_espera_entradas")
    .select("id, medico_id, paciente_id, consulta_id, turno_id, entrada_en, recordatorios_enviados")
    .is("salida_en", null)
    .not("medico_id", "is", null);

  if (error) {
    console.error("[cron/repush-esperando] Error leyendo entradas:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
  if (!entradas || entradas.length === 0) {
    return NextResponse.json({ ok: true, recordatorios: 0 });
  }

  // Estados actuales de las consultas/turnos asociados
  const consultaIds = [...new Set(entradas.map((e) => e.consulta_id).filter(Boolean))] as string[];
  const turnoIds = [...new Set(entradas.map((e) => e.turno_id).filter(Boolean))] as string[];

  const [consultasRes, turnosRes] = await Promise.all([
    consultaIds.length > 0
      ? admin.from("consultas").select("id, estado").in("id", consultaIds)
      : Promise.resolve({ data: [] as { id: string; estado: string }[] }),
    turnoIds.length > 0
      ? admin.from("turnos").select("id, estado").in("id", turnoIds)
      : Promise.resolve({ data: [] as { id: string; estado: string }[] }),
  ]);

  const estadoConsulta = new Map((consultasRes.data ?? []).map((c) => [c.id, c.estado]));
  const estadoTurno = new Map((turnosRes.data ?? []).map((t) => [t.id, t.estado]));

  const ahora = Date.now();

  // Filtrar pendientes con edad mínima, agrupar por médico
  type Pendiente = { entradaId: string; pacienteId: string; minutos: number; recordatorios: number };
  const porMedico = new Map<string, Pendiente[]>();
  // Esperas vivas a las que ya no se les manda nada: el tope se agotó. Se cuentan
  // para que la corrida lo REPORTE — un cron que se calla sin decirlo se lee como
  // "no había nada que avisar".
  let silenciadasPorTope = 0;

  for (const e of entradas) {
    const minutos = Math.floor((ahora - new Date(e.entrada_en).getTime()) / 60000);
    if (minutos < EDAD_MINIMA_MIN) continue;

    const ec = e.consulta_id ? estadoConsulta.get(e.consulta_id) : null;
    const et = e.turno_id ? estadoTurno.get(e.turno_id) : null;
    const pendiente = (!!ec && PENDIENTES_CONSULTA.has(ec)) || (!!et && PENDIENTES_TURNO.has(et));
    if (!pendiente) continue;

    const recordatorios = e.recordatorios_enviados ?? 0;
    if (recordatorios >= MAX_RECORDATORIOS) {
      silenciadasPorTope++;
      continue;
    }

    const arr = porMedico.get(e.medico_id) ?? [];
    arr.push({ entradaId: e.id, pacienteId: e.paciente_id, minutos, recordatorios });
    porMedico.set(e.medico_id, arr);
  }

  let recordatorios = 0;
  for (const [medicoId, pendientes] of porMedico) {
    const masAntiguo = Math.max(...pendientes.map((p) => p.minutos));

    let body: string;
    if (pendientes.length === 1) {
      const { data: pac } = await admin
        .from("pacientes")
        .select("nombre_completo")
        .eq("id", pendientes[0].pacienteId)
        .maybeSingle();
      body = `${pac?.nombre_completo ?? "Un paciente"} sigue esperando hace ${masAntiguo} min`;
    } else {
      body = `${pendientes.length} pacientes te están esperando (el primero hace ${masAntiguo} min)`;
    }

    const ok = await pushAlMedico(medicoId, {
      title: "🔴 Docto — paciente en espera",
      body,
      url: "/dashboard",
      // Tag estable por médico: reemplaza el recordatorio anterior (renotify
      // hace sonar de nuevo) en vez de apilar notificaciones.
      tag: `espera-recordatorio-${medicoId}`,
    }).catch(() => false);

    if (ok) recordatorios++;

    // Respaldo por WhatsApp del recordatorio (throttle interno por médico evita
    // mandar cada 10 min). Inerte sin flag/credenciales. Fire-and-forget.
    void avisarMedicoEsperandoWhatsApp(
      medicoId,
      pendientes.length === 1 ? "un paciente" : `${pendientes.length} pacientes`,
      // Agregado de N pacientes: no hay UNA consulta a la que atribuirlo.
      { disparador: "cron_repush" }
    ).catch(() => {});

    // Descontar el aviso en TODAS las filas que lo motivaron (el push es uno
    // agregado por médico, pero molesta por cada paciente que lo disparó).
    //
    // Se descuenta aunque el push falle: el WhatsApp sale igual, y lo que este
    // contador mide es "veces que le tocamos el teléfono", no entregas
    // confirmadas. El UPDATE va condicionado al valor leído, así que dos
    // corridas solapadas no gastan dos créditos por un solo mensaje.
    for (const p of pendientes) {
      await admin
        .from("sala_espera_entradas")
        .update({ recordatorios_enviados: p.recordatorios + 1 })
        .eq("id", p.entradaId)
        .eq("recordatorios_enviados", p.recordatorios);
    }
  }

  return NextResponse.json({
    ok: true,
    recordatorios,
    medicosConPendientes: porMedico.size,
    silenciadasPorTope,
  });
}

export const GET = withCron("repush-esperando", handler);
