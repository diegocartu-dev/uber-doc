import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendDoctoAlert } from "@/lib/alertas";
import { withCron } from "@/lib/cron-guard";
import { TIPOS_FIRMABLES } from "@/lib/firma/documento";

/**
 * Contador de documentos que quedaron SIN SELLO, cada hora.
 *
 * Por qué existe: la firma se dispara desde el cierre de consulta con un
 * `fetch(...).catch(() => {})` fire-and-forget. Si el request no sale (pestaña
 * cerrada antes del keepalive, red caída, migración sin aplicar, una columna
 * renombrada que tira el snapshot), el documento queda sin sello PARA SIEMPRE y
 * el único rastro es un console.error del lado del servidor — y solo si el
 * endpoint llegó a ejecutarse. Una regresión sistémica (100% sin firmar) sería
 * invisible hasta que alguien abra un PDF y vea la leyenda ámbar.
 *
 * Regla del repo contra fallas silenciosas (auditoría 13/07/2026): todo camino
 * crítico que puede fallar sin ruido necesita quién lo cuente.
 *
 * NO firma nada: solo mira y avisa. Sellar hoy un documento de ayer sería
 * antedatar (dictamen 07/08/2026).
 */

// Gracia: la firma sale segundos después del insert, pero un keepalive lento o
// un reintento no deberían disparar la alerta.
const GRACIA_MS = 15 * 60 * 1000;
const VENTANA_MS = 24 * 60 * 60 * 1000;

// La firma recién existe en producción desde este deploy (PR #357, 07/08/2026
// 19:09 UTC). Todo lo emitido antes salió sin sello POR DISEÑO — son los 114
// documentos históricos que, por dictamen legal, no se firman retroactivamente
// (sería antedatar). Sin este corte el vigilante los cuenta como falla y manda
// un mail rojo por hora durante las primeras 24 horas: pasó apenas se desplegó,
// y una alerta que grita por algo que nadie va a arreglar deja de leerse.
const DESDE_QUE_SE_FIRMA = Date.parse("2026-08-07T19:09:00Z");
const ANTI_SPAM_MS = 6 * 60 * 60 * 1000;

// Fila propia en `cron_runs` para el throttle: NO se usa la del cron
// ("documentos-sin-sello"), porque withCron limpia su `last_alerted_at` en cada
// corrida OK y mandaría un mail verde de "tarea recuperada" que no corresponde.
const CLAVE_ALERTA = "documentos-sin-sello-alerta";

export const GET = withCron("documentos-sin-sello", async () => {
  const admin = createAdminClient();
  const ahora = Date.now();
  // Nunca mirar más atrás del momento en que la firma empezó a existir.
  const desde = new Date(Math.max(ahora - VENTANA_MS, DESDE_QUE_SE_FIRMA)).toISOString();
  const hasta = new Date(ahora - GRACIA_MS).toISOString();
  const tipos = [...TIPOS_FIRMABLES];

  const { data: sinSello, error } = await admin
    .from("documentos")
    .select("id, tipo, created_at")
    .in("tipo", tipos)
    .is("firma_digital", null)
    .gte("created_at", desde)
    .lte("created_at", hasta)
    .order("created_at", { ascending: false })
    .limit(200);

  // 500 → withCron alerta solo (la tarea que vigila fallas no puede fallar callada).
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { count: total } = await admin
    .from("documentos")
    .select("id", { count: "exact", head: true })
    .in("tipo", tipos)
    .gte("created_at", desde)
    .lte("created_at", hasta);

  const faltantes = sinSello?.length ?? 0;
  const emitidos = total ?? 0;

  if (faltantes === 0) {
    return NextResponse.json({ ok: true, emitidos_24h: emitidos, sin_sello: 0 });
  }

  const { data: fila } = await admin
    .from("cron_runs")
    .select("last_alerted_at")
    .eq("cron_key", CLAVE_ALERTA)
    .maybeSingle();

  const yaAlertado =
    fila?.last_alerted_at && ahora - Date.parse(fila.last_alerted_at) < ANTI_SPAM_MS;

  if (yaAlertado) {
    return NextResponse.json({ ok: true, emitidos_24h: emitidos, sin_sello: faltantes, alertado: false });
  }

  const todos = emitidos > 0 && faltantes === emitidos;
  const porTipo = sinSello!.reduce<Record<string, number>>((acc, d) => {
    acc[d.tipo] = (acc[d.tipo] ?? 0) + 1;
    return acc;
  }, {});
  const detallePorTipo = Object.entries(porTipo)
    .map(([tipo, n]) => `${n} ${tipo}`)
    .join(", ");

  await sendDoctoAlert(
    todos
      ? "🔴 Ningún documento se está firmando"
      : `🟠 ${faltantes} documento${faltantes === 1 ? "" : "s"} sin sello electrónico`,
    [
      todos
        ? `De los ${emitidos} documentos emitidos desde la última revisión, NINGUNO quedó firmado electrónicamente.`
        : `${faltantes} de ${emitidos} documentos emitidos desde la última revisión quedaron sin sello electrónico (${detallePorTipo}).`,
      ``,
      `Qué significa: esos documentos se entregaron igual y el paciente los tiene, pero el PDF dice "Documento sin sello electrónico de verificación" y el QR lleva a una página que no puede confirmar el contenido. Una farmacia o un empleador pueden preguntar por eso.`,
      ``,
      todos
        ? `¿Tenés que hacer algo? Sí, ahora: que fallen TODOS es una falla del sistema, no un caso suelto. La causa más probable es que la migración de firma no esté aplicada en la base. Abrí Claude Code y decime: "ningún documento se está firmando, revisá /api/documentos/firmar y la migración 20260807_firma_por_sesion.sql".`
        : `¿Tenés que hacer algo? Probablemente no si son uno o dos: suele ser el médico que cerró la pestaña justo antes de que saliera el pedido de firma. Si el número crece día a día, abrí Claude Code y decime: "revisá por qué quedan documentos sin sello".`,
      ``,
      `———`,
      `Detalle técnico (para Claude): ${faltantes}/${emitidos} filas de documentos (tipos ${tipos.join("/")}) con firma_digital NULL, creadas entre ${desde} y ${hasta}. Últimos ids: ${sinSello!.slice(0, 5).map((d) => d.id).join(", ")}. Revisar logs de [firmar-docs] y [firma-doc] en Vercel.`,
    ].join("\n")
  );

  const nowIso = new Date().toISOString();
  await admin.from("cron_runs").upsert({
    cron_key: CLAVE_ALERTA,
    last_alerted_at: nowIso,
    last_status: "alerta",
    updated_at: nowIso,
  });

  return NextResponse.json({
    ok: true,
    emitidos_24h: emitidos,
    sin_sello: faltantes,
    alertado: true,
  });
});
