"use server";

import { createClient } from "@/lib/supabase/server";
import { enviarEmailConsultaAceptada } from "@/lib/email";
import { pushAlPaciente } from "@/lib/push";
import { avisarPacienteAceptadaWhatsApp } from "@/lib/whatsapp";
import { createAdminClient } from "@/lib/supabase/admin";

export async function aceptarConsulta(consultaId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "No autenticado." };
  }

  // Verificar que el médico es dueño de esta consulta
  const { data: medico } = await supabase
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!medico) {
    return { error: "No sos médico." };
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
    return { error: "Tenés una consulta esperando reconexión. Retomala o esperá a que se cierre antes de tomar otra." };
  }

  // `aceptada_at` es el hito que separa un INTENTO de una CONSULTA (decisión de
  // Diego, 19/08/2026). Hasta hoy solo se escribía el estado, y como `aceptada`
  // es un estado de paso, al terminar la consulta no quedaba ni rastro de que
  // un profesional se hubiera hecho cargo: la columna estaba vacía siempre.
  // Sin esta línea es imposible distinguir "no la aceptó nadie" de "la aceptó y
  // el paciente no pagó" — que es la diferencia entre una falla nuestra y ruido.
  const { error } = await supabase
    .from("consultas")
    .update({ estado: "aceptada", aceptada_at: new Date().toISOString() })
    .eq("id", consultaId)
    .eq("medico_id", medico.id)
    .eq("estado", "esperando");

  if (error) {
    return { error: error.message };
  }

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
  // WhatsApp al paciente (decisión Diego 10/09): el mail del 08/09 llegó en el
  // mismo segundo de la aceptación y el paciente no volvió; el WhatsApp es el
  // canal que sí se lee en segundos. Inerte hasta que la plantilla esté aprobada
  // y su ContentSid cargado (TWILIO_CONTENT_SID_PACIENTE_ACEPTADA).
  void avisarPacienteAceptadaWhatsApp(consultaId).catch(() => {});
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
