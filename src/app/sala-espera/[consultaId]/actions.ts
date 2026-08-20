"use server";

import { createClient } from "@/lib/supabase/server";

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

  return { success: true };
}
