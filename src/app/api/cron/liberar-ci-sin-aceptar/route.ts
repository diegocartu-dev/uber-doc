import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushAlMedico } from "@/lib/push";
import { avisarMedicoEsperandoWhatsApp } from "@/lib/whatsapp";
import { cerrarEntradaSala } from "@/lib/sala-espera";
import { medicosOcupados } from "@/lib/consultas/resolver-vencidas";
import { withCron } from "@/lib/cron-guard";
import {
  decidir,
  MOTIVO_SALIDA,
  PLAZO_SIN_ACEPTAR_MIN,
  RECORDATORIO_MIN,
  RESOLUCION_MOTIVO,
} from "@/lib/consultas/liberar-sin-aceptar";

/**
 * Cron cada 2 min — dueño del reloj de la CI que nadie aceptó (decisión Diego
 * 21/08/2026, ver `@/lib/consultas/liberar-sin-aceptar` para el caso que lo
 * motivó). Es el espejo, del lado sin plata, de `resolver-consultas-vencidas`:
 * ese resuelve las PAGADAS a los 30 min; éste, las que nunca llegaron a pago.
 *
 * Corre cada 2 minutos y no cada 10 a propósito: con el intervalo de 10 min un
 * plazo de 10 se convierte en cualquier cosa entre 10 y 20, y el recordatorio
 * del minuto 5 podía salir después del cierre.
 *
 * Por cada solicitud viva:
 *   · minuto 5   → un ÚNICO recordatorio (push + WhatsApp);
 *   · minuto 10  → se cancela, se cierra la sala, se le apaga la CI al
 *                  profesional y se le explica por qué.
 *
 * El paciente no necesita aviso propio: está parado en `/sala-espera/[id]`, que
 * pollea el estado y al ver `cancelada` muestra "Esta consulta no pudo
 * concretarse · Buscar otro médico".
 */

export const maxDuration = 60;

// Techo por corrida. Lo que no entre lo levanta la corrida de 2 minutos después.
const MAX_POR_CORRIDA = 25;

async function handler() {
  const admin = createAdminClient();

  // CANDIDATAS: pedidos que el profesional todavía no tomó y por los que no
  // entró un peso. `estado='esperando'` es, por definición, "sin aceptar"; el
  // filtro de pago es cinturón y tirantes por si un webhook adelantado dejara
  // una consulta pagada en ese estado — esa es plata y no se toca acá.
  const { data: solicitudes, error } = await admin
    .from("consultas")
    .select("id, medico_id, created_at")
    .eq("estado", "esperando")
    .is("pago_id", null)
    .is("mp_status", null)
    .lt("created_at", new Date(Date.now() - RECORDATORIO_MIN * 60 * 1000).toISOString())
    .order("created_at", { ascending: true })
    .limit(MAX_POR_CORRIDA);

  if (error) {
    console.error("[cron/liberar-ci-sin-aceptar] Error leyendo solicitudes:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
  if (!solicitudes || solicitudes.length === 0) {
    return NextResponse.json({ ok: true, liberadas: 0, recordatorios: 0 });
  }

  // Contador de recordatorios: vive en la fila de la sala de espera, que es la
  // que representa "este paciente está esperando a este profesional".
  const ids = solicitudes.map((c) => c.id);
  const { data: entradas } = await admin
    .from("sala_espera_entradas")
    .select("consulta_id, recordatorios_enviados")
    .in("consulta_id", ids)
    .is("salida_en", null);

  const recordatoriosPorConsulta = new Map(
    (entradas ?? []).map((e) => [e.consulta_id as string, e.recordatorios_enviados ?? 0])
  );

  const ahora = Date.now();
  const aLiberar: { id: string; medicoId: string }[] = [];
  const aRecordar: { id: string; medicoId: string }[] = [];

  for (const c of solicitudes) {
    const minutos = (ahora - new Date(c.created_at).getTime()) / 60000;
    const decision = decidir({
      minutos,
      recordatoriosEnviados: recordatoriosPorConsulta.get(c.id) ?? 0,
    });
    if (decision === "liberar") aLiberar.push({ id: c.id, medicoId: c.medico_id });
    else if (decision === "recordar") aRecordar.push({ id: c.id, medicoId: c.medico_id });
  }

  // ── Recordatorio del minuto 5 ────────────────────────────────────────────
  let recordatorios = 0;
  for (const s of aRecordar) {
    // El contador sube ANTES de avisar y condicionado al valor que leímos: si
    // dos corridas se solapan, sólo una gana el UPDATE y el otro aviso no sale.
    // Un recordatorio perdido es mejor que uno duplicado — el problema que este
    // sprint viene a arreglar es exactamente el ruido de más.
    const { data: marcada } = await admin
      .from("sala_espera_entradas")
      .update({ recordatorios_enviados: (recordatoriosPorConsulta.get(s.id) ?? 0) + 1 })
      .eq("consulta_id", s.id)
      .is("salida_en", null)
      .eq("recordatorios_enviados", recordatoriosPorConsulta.get(s.id) ?? 0)
      .select("id");

    if (!marcada || marcada.length === 0) continue;

    void pushAlMedico(s.medicoId, {
      title: "🔴 Docto — te están esperando",
      body: `Un paciente pidió una consulta hace ${RECORDATORIO_MIN} min. Si no la tomás, en ${PLAZO_SIN_ACEPTAR_MIN - RECORDATORIO_MIN} min se libera.`,
      url: "/dashboard",
      tag: `espera-recordatorio-${s.medicoId}`,
    }).catch(() => {});

    void avisarMedicoEsperandoWhatsApp(s.medicoId, "un paciente").catch(() => {});
    recordatorios++;
  }

  // ── Vencimiento del minuto 10 ────────────────────────────────────────────
  // Un profesional que está adentro de OTRA atención no está ausente: está
  // trabajando. El pedido se cae igual (el paciente no tiene por qué esperarlo),
  // pero no se le apaga la CI — apagársela lo sacaría de la cartilla justo
  // cuando se desocupa.
  const ocupados = await medicosOcupados([...new Set(aLiberar.map((s) => s.medicoId))]);

  let liberadas = 0;
  let apagados = 0;
  for (const s of aLiberar) {
    // Candado de idempotencia: el UPDATE exige el estado exacto que leímos, así
    // que si el profesional aceptó entre el SELECT y esta línea, no lo pisamos.
    const { data: cancelada, error: errUpd } = await admin
      .from("consultas")
      .update({ estado: "cancelada", resolucion_motivo: RESOLUCION_MOTIVO })
      .eq("id", s.id)
      .eq("estado", "esperando")
      .select("id");

    if (errUpd) {
      console.error(`[cron/liberar-ci-sin-aceptar] Error cancelando ${s.id}:`, errUpd.message);
      continue;
    }
    if (!cancelada || cancelada.length === 0) continue; // la tomaron justo: no era nuestra

    await cerrarEntradaSala({ consultaId: s.id, motivo: MOTIVO_SALIDA });
    liberadas++;

    if (ocupados.has(s.medicoId)) continue;
    if (await apagarCI(s.medicoId)) apagados++;
  }

  return NextResponse.json({ ok: true, liberadas, recordatorios, apagados });
}

/**
 * Apaga la disponibilidad de CI y le explica al profesional qué pasó. Mismo
 * procedimiento que el auto-apagado de 4 h: limpiar flag + ancla, registrar la
 * transición en `disponibilidad_log` y avisar por mensaje interno (persistente,
 * lo ve aunque no tenga push) + push best-effort.
 */
async function apagarCI(medicoId: string): Promise<boolean> {
  const admin = createAdminClient();

  const { data: apagado, error } = await admin
    .from("medicos")
    .update({ disponible: false, disponible_desde_at: null })
    .eq("id", medicoId)
    .eq("disponible", true)
    .select("id, nombre_completo");

  if (error) {
    console.error(`[cron/liberar-ci-sin-aceptar] Error apagando ${medicoId}:`, error.message);
    return false;
  }
  if (!apagado || apagado.length === 0) return false; // ya estaba apagado

  await admin.from("disponibilidad_log").insert({ medico_id: medicoId, online: false });

  const primerNombre = (apagado[0].nombre_completo ?? "").split(" ")[0] || "Doctor/a";
  await admin.from("mensajes_internos_medicos").insert({
    medico_id: medicoId,
    titulo: "Se liberó un paciente que te estaba esperando",
    cuerpo: `Hola ${primerNombre}. Un paciente pidió una consulta inmediata y, al no recibir respuesta en ${PLAZO_SIN_ACEPTAR_MIN} minutos, lo liberamos para que pueda elegir otro profesional. También te desactivamos de Consulta Inmediata, para que no te sigan eligiendo mientras no estás frente a la pantalla. Cuando vuelvas a estar disponible, activate de nuevo desde tu panel.`,
    severidad: "media",
  });

  void pushAlMedico(medicoId, {
    title: "Docto — te desactivamos de Consulta Inmediata",
    body: "Un paciente te esperó 10 min y lo liberamos. Reactivate cuando estés frente a la pantalla.",
    url: "/dashboard",
    tag: `ci-sin-aceptar-${medicoId}`,
  }).catch(() => {});

  return true;
}

export const GET = withCron("liberar-ci-sin-aceptar", handler);
