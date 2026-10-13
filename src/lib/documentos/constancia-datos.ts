// Arma la constancia de atención de un TURNO con los datos del servidor
// (13/10/2026). Service role: la matrícula, su provincia y el DNI del paciente
// no se leen con el cliente RLS. Devuelve `null` si el profesional no es
// psicólogo o si falta algún dato (sin datos completos, no se emite una
// constancia a medias: el profesional la reemite desde "completar documentación").

import type { SupabaseClient } from "@supabase/supabase-js";
import { profesionDe } from "@/lib/refeps/profesion";
import { textoConstancia } from "./constancia";

export async function textoConstanciaDelTurno(admin: SupabaseClient, turnoId: string): Promise<string | null> {
  const { data: turno } = await admin
    .from("turnos")
    .select("fecha, hora_inicio, medico_id, paciente_id")
    .eq("id", turnoId)
    .maybeSingle();
  if (!turno?.medico_id || !turno.paciente_id || !turno.fecha || !turno.hora_inicio) return null;

  const [{ data: medico }, { data: paciente }] = await Promise.all([
    admin
      .from("medicos")
      .select("profesion, nombre_completo, tipo_matricula, numero_matricula, provincia_matricula, domicilio_consultorio, domicilio")
      .eq("id", turno.medico_id)
      .maybeSingle(),
    // turnos.paciente_id es pacientes.id (asimetría de esquema por canal).
    admin.from("pacientes").select("nombre_completo, dni").eq("id", turno.paciente_id).maybeSingle(),
  ]);
  if (!medico || profesionDe(medico.profesion) !== "psicologo") return null;
  const domicilio = (medico.domicilio_consultorio || medico.domicilio || "").trim();
  if (!paciente?.nombre_completo || !paciente.dni || !medico.nombre_completo || !medico.tipo_matricula || !medico.numero_matricula || !domicilio) {
    return null;
  }
  return textoConstancia({
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
}
