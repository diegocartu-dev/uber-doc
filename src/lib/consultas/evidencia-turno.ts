// La caja negra de un turno que no se atendió (06/10/2026). A diferencia de la
// consulta inmediata, no se escribe en cada cierre: el revisor de caídas la arma
// en el momento con lo que queda en la base —los avisos al profesional, la sala
// de espera y la presencia en el video— y la guarda en `turnos.cierre_evidencia`
// junto con su marca de revisada. Sin datos personales: banderas y estados.

import { createAdminClient } from "@/lib/supabase/admin";

export type EvidenciaTurno = {
  at: string;
  /** El mejor resultado entre los avisos por WhatsApp al profesional para este turno. */
  aviso_medico: string | null;
  /** Entrega real de ese aviso según Twilio (read > delivered > el resto). */
  aviso_medico_entrega: string | null;
  /** ¿El paciente abrió la sala de espera del turno? */
  paciente_en_sala: boolean;
  /** ¿El paciente llegó a entrar al video? */
  paciente_en_video: boolean;
  /** ¿El profesional llegó a entrar al video? */
  medico_en_video: boolean;
  /** Marca del revisor de caídas. */
  revisada_at?: string;
};

/** Plantillas con las que se le avisa al profesional de un turno. */
const AVISOS_TURNO = ["turno_reservado", "turno_15min", "paciente_esperando"];
const PRIORIDAD_ENTREGA = ["read", "delivered", "undelivered", "failed"];

/** Elige el aviso que mejor prueba que le llegó (pura, para testear la regla). */
export function mejorAviso(avisos: { resultado: string | null; twilio_status: string | null }[]): {
  aviso: string | null;
  entrega: string | null;
} {
  for (const estado of PRIORIDAD_ENTREGA) {
    const a = avisos.find((x) => x.twilio_status === estado);
    if (a) return { aviso: a.resultado, entrega: estado };
  }
  const enviado = avisos.find((x) => x.resultado === "enviado");
  if (enviado) return { aviso: "enviado", entrega: enviado.twilio_status };
  return { aviso: avisos[0]?.resultado ?? null, entrega: avisos[0]?.twilio_status ?? null };
}

export async function evidenciaTurno(turnoId: string): Promise<EvidenciaTurno> {
  const admin = createAdminClient();
  const [{ data: avisos }, { data: entradas }, { data: presencia }] = await Promise.all([
    admin
      .from("whatsapp_envios")
      .select("resultado, twilio_status, created_at")
      .eq("turno_id", turnoId)
      .in("plantilla", AVISOS_TURNO)
      .order("created_at", { ascending: false }),
    admin.from("sala_espera_entradas").select("id").eq("turno_id", turnoId).limit(1),
    admin.from("video_presencia").select("rol, evento").eq("recurso_id", turnoId).eq("evento", "joined"),
  ]);
  const { aviso, entrega } = mejorAviso((avisos ?? []) as { resultado: string | null; twilio_status: string | null }[]);
  const roles = new Set((presencia ?? []).map((p) => p.rol));
  return {
    at: new Date().toISOString(),
    aviso_medico: aviso,
    aviso_medico_entrega: entrega,
    paciente_en_sala: (entradas ?? []).length > 0,
    paciente_en_video: roles.has("paciente"),
    medico_en_video: roles.has("medico"),
  };
}
