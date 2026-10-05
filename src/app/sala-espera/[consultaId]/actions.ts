"use server";

import { createClient } from "@/lib/supabase/server";
import { enviarEmailConsultaAceptada } from "@/lib/email";
import { pushAlPaciente } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError, logInfo } from "@/lib/logger";
import { waitUntil } from "@vercel/functions";
import { avisarPacienteAceptadaWhatsApp } from "@/lib/whatsapp";
import { LATIDO_FRESCO_SEG } from "@/lib/consultas/aceptada-sin-pago";

export async function aceptarConsulta(consultaId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logError("[aceptar]", "Sin sesión al aceptar", { consultaId });
    return { error: "Tu sesión venció. Recargá la página e ingresá de nuevo." };
  }

  // Verificar que el médico es dueño de esta consulta
  const { data: medico } = await supabase
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!medico) {
    logError("[aceptar]", "El usuario no tiene ficha de médico", { consultaId, userId: user.id });
    return { error: "No encontramos tu ficha de profesional. Recargá la página." };
  }

  // --- Bloqueo durante ventana de rejoin (Fase 1, §13.3 / §6.4 del diseño) ---
  // Si el médico tiene una consulta en_curso con un corte pendiente
  // (desconectado_at != null), está dentro de la ventana de 2 min de reconexión:
  // no puede tomar otra hasta que se retome o expire.
  const { data: corteEnCurso } = await supabase
    .from("consultas")
    .select("id")
    .eq("medico_id", medico.id)
    .eq("estado", "en_curso")
    .not("desconectado_at", "is", null)
    .limit(1)
    .maybeSingle();

  if (corteEnCurso) {
    logError("[aceptar]", "Bloqueado por una consulta con corte pendiente", { consultaId, medicoId: medico.id, corte: corteEnCurso.id });
    return { error: "Tenés una consulta esperando reconexión. Retomala o esperá a que se cierre antes de tomar otra." };
  }

  // `aceptada_at` es el hito que separa un INTENTO de una CONSULTA (decisión de
  // Diego, 19/08/2026). Hasta hoy solo se escribía el estado, y como `aceptada`
  // es un estado de paso, al terminar la consulta no quedaba ni rastro de que
  // un profesional se hubiera hecho cargo: la columna estaba vacía siempre.
  // Sin esta línea es imposible distinguir "no la aceptó nadie" de "la aceptó y
  // el paciente no pagó" — que es la diferencia entre una falla nuestra y ruido.
  //
  // Con `.select()`: un update que no toca ninguna fila NO es un error para
  // PostgREST, y hasta el 05/10/2026 se devolvía como éxito. La tarjeta
  // desaparecía, el profesional creía que había aceptado, y el pedido seguía
  // 'esperando' hasta vencer (plan: docs/sprints/2026-10-05-plan-consultas-efectivas.md).
  const { data: filas, error } = await supabase
    .from("consultas")
    .update({ estado: "aceptada", aceptada_at: new Date().toISOString() })
    .eq("id", consultaId)
    .eq("medico_id", medico.id)
    .eq("estado", "esperando")
    .select("id");

  if (error) {
    logError("[aceptar]", "El update falló", { consultaId, medicoId: medico.id, code: error.code, error: error.message });
    return { error: "No se pudo aceptar. Reintentá en unos segundos." };
  }
  if (!filas?.length) {
    logError("[aceptar]", "El update no tocó ninguna fila", { consultaId, medicoId: medico.id });
    return { error: "Esta consulta ya no está esperando: el paciente la canceló o venció el plazo." };
  }
  logInfo("[aceptar]", "Consulta aceptada", { consultaId, medicoId: medico.id });

  // AVISARLE AL PACIENTE. Hasta el 08/09 esto no existía: aceptar solo cambiaba
  // el estado, y el paciente se enteraba únicamente si tenía la pestaña abierta
  // (la sala pregunta cada 5 s). Caso real: aceptada a los 25 segundos, el
  // paciente reapareció 32 minutos después y la profesional ya la había
  // cancelado. Best-effort a propósito: que falle un aviso no puede desarmar
  // una aceptación que ya está escrita.
  //
  // Mail SIEMPRE (es el canal que no depende de nada: de 388 pacientes reales,
  // UNO tenía permiso de notificaciones) y push si lo tiene.
  void enviarEmailConsultaAceptada(consultaId).catch(() => {});
  // El WhatsApp al paciente NO sale de acá (Diego, 10/09/2026, segunda vuelta).
  // Si el paciente está mirando la pantalla, el aviso es ruido; y si ya tocó
  // Pagar, es peor: le suena el teléfono adentro del checkout de Mercado Pago.
  // Lo manda el cron `ci-aceptada-sin-pago` a los 90 segundos, y solo si el
  // paciente dejó de dar señales de estar mirando. El mail, en cambio, sigue
  // saliendo ya: no interrumpe, y es el respaldo del que cierra todo a los
  // diez segundos.
  //
  // EXCEPTO cuando ya se sabe que no está mirando (05/10/2026): si el último
  // latido de la sala es viejo al momento de aceptar, el WhatsApp sale acá, en
  // el acto. El cron lo ve como "ya avisado" y no lo repite. waitUntil: un
  // server action en Vercel no garantiza el trabajo que queda después de
  // responder.
  waitUntil(
    (async () => {
      const admin = createAdminClient();
      const { data: entradas } = await admin
        .from("sala_espera_entradas")
        .select("ultimo_latido_at")
        .eq("consulta_id", consultaId)
        .order("entrada_en", { ascending: false })
        .limit(1);
      const latido = entradas?.[0]?.ultimo_latido_at ? Date.parse(entradas[0].ultimo_latido_at) : NaN;
      if (Number.isNaN(latido)) return; // sin dato: lo decide el cron
      const segundos = (Date.now() - latido) / 1000;
      if (segundos < LATIDO_FRESCO_SEG) return; // está mirando: no interrumpir
      await avisarPacienteAceptadaWhatsApp(consultaId, { disparador: "aceptada_sin_pago" });
    })().catch((e) => logError("[aceptar]", "No se pudo mandar el WhatsApp al paciente en el acto", { consultaId, error: String(e) }))
  );
  void (async () => {
    const admin = createAdminClient();
    const { data: c } = await admin
      .from("consultas")
      .select("paciente_id")
      .eq("id", consultaId)
      .maybeSingle();
    if (!c?.paciente_id) return;
    const { data: fila } = await admin
      .from("pacientes")
      .select("id")
      .eq("user_id", c.paciente_id)
      .maybeSingle();
    if (!fila) return;
    await pushAlPaciente(fila.id, {
      title: "Aceptaron tu consulta",
      body: "Falta el pago para que empiece. Entrá ahora.",
      url: `/sala-espera/${consultaId}`,
      tag: `aceptada-${consultaId}`,
    });
  })().catch(() => {});

  return { success: true };
}
