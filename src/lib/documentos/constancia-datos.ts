// Arma la constancia de atención de un TURNO con los datos del servidor
// (13/10/2026). Service role: la matrícula, su provincia y el DNI del paciente
// no se leen con el cliente RLS. Sin datos completos no se arma una constancia
// a medias; una lectura que falla se informa como error, no como "faltan datos".

import type { SupabaseClient } from "@supabase/supabase-js";
import { profesionDe } from "@/lib/refeps/profesion";
import { textoConstancia } from "./constancia";

export type TextoConstancia =
  | { ok: true; texto: string }
  | { ok: false; motivo: "no_es_psicologia" | "faltan_datos" | "error" };

export async function armarTextoConstanciaDelTurno(admin: SupabaseClient, turnoId: string): Promise<TextoConstancia> {
  const { data: turno, error: errTurno } = await admin
    .from("turnos")
    .select("fecha, hora_inicio, medico_id, paciente_id")
    .eq("id", turnoId)
    .maybeSingle();
  if (errTurno) return { ok: false, motivo: "error" };
  if (!turno?.medico_id || !turno.paciente_id || !turno.fecha || !turno.hora_inicio) return { ok: false, motivo: "faltan_datos" };

  const [{ data: medico, error: errMedico }, { data: paciente, error: errPaciente }] = await Promise.all([
    admin
      .from("medicos")
      .select("profesion, nombre_completo, tipo_matricula, numero_matricula, provincia_matricula, domicilio_consultorio, domicilio")
      .eq("id", turno.medico_id)
      .maybeSingle(),
    // turnos.paciente_id es pacientes.id (asimetría de esquema por canal).
    admin.from("pacientes").select("nombre_completo, dni").eq("id", turno.paciente_id).maybeSingle(),
  ]);
  if (errMedico || errPaciente) return { ok: false, motivo: "error" };
  if (!medico || profesionDe(medico.profesion) !== "psicologo") return { ok: false, motivo: "no_es_psicologia" };
  const domicilio = (medico.domicilio_consultorio || medico.domicilio || "").trim();
  if (!paciente?.nombre_completo || !paciente.dni || !medico.nombre_completo || !medico.tipo_matricula || !medico.numero_matricula || !domicilio) {
    return { ok: false, motivo: "faltan_datos" };
  }
  // Una matrícula provincial sin su provincia no dice dónde puede ejercer.
  if (medico.tipo_matricula.toUpperCase() === "MP" && !(medico.provincia_matricula ?? "").trim()) return { ok: false, motivo: "faltan_datos" };
  const texto = textoConstancia({
    pacienteNombre: paciente.nombre_completo,
    pacienteDni: paciente.dni,
    fecha: turno.fecha,
    hora: turno.hora_inicio,
    profesionalNombre: medico.nombre_completo,
    matriculaTipo: medico.tipo_matricula,
    matriculaNumero: medico.numero_matricula,
    matriculaProvincia: medico.provincia_matricula ?? null,
    domicilio,
  });
  return { ok: true, texto };
}

/** Para mostrar el texto en pantalla antes de emitirla: `null` si no se puede armar. */
export async function textoConstanciaDelTurno(admin: SupabaseClient, turnoId: string): Promise<string | null> {
  const r = await armarTextoConstanciaDelTurno(admin, turnoId);
  return r.ok ? r.texto : null;
}
