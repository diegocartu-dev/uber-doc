// Emite la constancia de atención de un turno de psicología (13/10/2026), del
// lado del servidor: el texto, el paciente y el turno salen de la misma fila, y
// el cliente no manda nada más que "emitila".
//
// LA CONSTANCIA DICE QUE EL PACIENTE ASISTIÓ, así que solo sale si la sala
// registró que el paciente entró (`video_presencia`, lib/video/presencia.ts).
// Si nunca entró, no se emite. Si no hay registro de presencia ("no sé"), por
// ahora tampoco: certificar una asistencia sin evidencia es peor que no
// emitirla (decisión pendiente de Diego, docs/sprints/2026-10-13-psicologos.md).
//
// No firma ni avisa: eso lo hace quien llama, por el mismo camino que el resto
// de los documentos.

import type { SupabaseClient } from "@supabase/supabase-js";
import { profesionDeLaFicha } from "@/lib/medicos/profesion-ficha";
import { presenciaDelPaciente } from "@/lib/video/presencia";
import { armarTextoConstanciaDelTurno } from "./constancia-datos";

export type MotivoSinConstancia =
  | "no_es_psicologia"
  | "turno_ajeno"
  | "turno_no_cerrado"
  | "reembolsado"
  | "no_habilitado"
  | "ya_emitida"
  | "paciente_no_entro"
  | "sin_datos_de_presencia"
  | "faltan_datos"
  | "error";

export type ResultadoConstancia = { ok: true; documentoId: string } | { ok: false; motivo: MotivoSinConstancia };

/** Para el profesional, en una línea. */
export function textoMotivoSinConstancia(m: MotivoSinConstancia): string {
  switch (m) {
    case "paciente_no_entro":
      return "La constancia no se emitió: el paciente no entró a la sesión.";
    case "sin_datos_de_presencia":
      return "La constancia no se emitió: no pudimos confirmar que el paciente haya entrado a la sesión.";
    case "faltan_datos":
      return "La constancia no se emitió: falta tu domicilio profesional o tu matrícula, o el DNI del paciente.";
    case "ya_emitida":
      return "La constancia ya se había emitido.";
    case "reembolsado":
      return "La constancia no se emitió: la sesión se reembolsó.";
    case "no_habilitado":
      return "La constancia no se emitió: tu cuenta no está habilitada para emitir documentación.";
    default:
      return "La constancia no se pudo emitir. Probá de nuevo en un momento.";
  }
}

export async function emitirConstanciaDelTurno(
  admin: SupabaseClient,
  args: { turnoId: string; medicoId: string; postCierre?: boolean }
): Promise<ResultadoConstancia> {
  if ((await profesionDeLaFicha(admin, { medicoId: args.medicoId })) !== "psicologo") {
    return { ok: false, motivo: "no_es_psicologia" };
  }

  const { data: turno, error: errTurno } = await admin
    .from("turnos")
    .select("medico_id, paciente_id, iniciado_en, estado, reintegro_estado")
    .eq("id", args.turnoId)
    .maybeSingle();
  if (errTurno) return { ok: false, motivo: "error" };
  if (!turno || turno.medico_id !== args.medicoId || !turno.paciente_id) return { ok: false, motivo: "turno_ajeno" };
  // Mismas guardas que "completar documentación": la sesión terminó, no se
  // devolvió la plata, y el profesional está habilitado (aprobado y con REFEPS).
  if (turno.estado !== "completado") return { ok: false, motivo: "turno_no_cerrado" };
  if (turno.reintegro_estado === "reembolsado") return { ok: false, motivo: "reembolsado" };
  const { data: habil, error: errHabil } = await admin
    .from("medicos")
    .select("estado_registro, refeps_validado, es_cuenta_test")
    .eq("id", args.medicoId)
    .maybeSingle();
  if (errHabil) return { ok: false, motivo: "error" };
  if (!habil || habil.estado_registro !== "aprobado" || !(habil.refeps_validado === true || habil.es_cuenta_test === true)) {
    return { ok: false, motivo: "no_habilitado" };
  }

  const { data: previa, error: errPrevia } = await admin
    .from("documentos")
    .select("id")
    .eq("turno_id", args.turnoId)
    .eq("tipo", "constancia")
    .limit(1);
  if (errPrevia) return { ok: false, motivo: "error" };
  if ((previa ?? []).length > 0) return { ok: false, motivo: "ya_emitida" };

  const presencia = await presenciaDelPaciente("turno", args.turnoId, turno.iniciado_en ?? null);
  if (presencia === "no_entro") return { ok: false, motivo: "paciente_no_entro" };
  if (presencia === "sin_datos") return { ok: false, motivo: "sin_datos_de_presencia" };

  const armado = await armarTextoConstanciaDelTurno(admin, args.turnoId);
  if (!armado.ok) return { ok: false, motivo: armado.motivo === "error" ? "error" : "faltan_datos" };
  const texto = armado.texto;

  const ahora = new Date().toISOString();
  const { data: fila, error } = await admin
    .from("documentos")
    .insert({
      turno_id: args.turnoId,
      consulta_id: null,
      paciente_id: turno.paciente_id,
      medico_id: args.medicoId,
      tipo: "constancia",
      // Nada clínico (secreto profesional).
      diagnostico: "",
      contenido: texto,
      ...(args.postCierre ? { emitido_post_cierre: true, emitido_post_cierre_at: ahora } : {}),
    })
    .select("id")
    .single();
  if (error) {
    // El índice único (una constancia por turno) frena la segunda pestaña.
    if (error.code === "23505") return { ok: false, motivo: "ya_emitida" };
    console.error("[constancia] no se pudo guardar:", error.message);
    return { ok: false, motivo: "error" };
  }
  return { ok: true, documentoId: fila.id as string };
}
