"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getFlag } from "@/lib/feature-flags";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function crearConsulta(
  medicoId: string,
  especialidad: string,
  motivoConsulta: string,
  sintomas: string[],
  tiempoSintomas: string,
  canalOrigen: "clinica_virtual" | "consultorio_privado" = "clinica_virtual"
) {
  if (!(await getFlag("consulta_inmediata_global"))) {
    return { error: "La Consulta Inmediata esta en pausa por unos minutos. Proba de nuevo enseguida." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "No autenticado." };
  }

  // Gate de perfil completo (consistente con el flujo de turnos): el paciente no
  // puede iniciar una Consulta Inmediata sin sus datos mínimos. Esto frena ANTES
  // del pago, no después (evita pay-then-block). Mismo criterio que info-medica.
  const { data: perfil } = await supabase
    .from("pacientes")
    .select("nombre_completo, dni, fecha_nacimiento, sexo_dni, telefono, tiene_cobertura, nro_afiliado")
    .eq("user_id", user.id)
    .maybeSingle();

  const perfilCompleto =
    perfil?.nombre_completo?.trim() &&
    perfil?.dni?.trim() &&
    perfil?.fecha_nacimiento &&
    perfil?.sexo_dni &&
    perfil?.telefono?.trim() &&
    (!perfil?.tiene_cobertura || perfil?.nro_afiliado?.trim());

  if (!perfilCompleto) {
    const destino = `/triage?medicoId=${medicoId}&especialidad=${encodeURIComponent(especialidad)}&canal=${canalOrigen}`;
    redirect(`/onboarding?redirectTo=${encodeURIComponent(destino)}`);
  }

  if (!motivoConsulta.trim()) {
    return { error: "El motivo de consulta es obligatorio." };
  }

  if (!UUID_RE.test(medicoId)) {
    return { error: "El médico seleccionado no está disponible." };
  }

  const { data: medico, error: medicoError } = await supabase
    .from("medicos")
    .select("id, especialidad, disponible, verificado, estado_registro, es_cuenta_test")
    .eq("id", medicoId)
    .single();

  if (medicoError || !medico) {
    return { error: "El médico seleccionado no está disponible." };
  }

  if (medico.es_cuenta_test || !medico.verificado || medico.estado_registro !== "aprobado") {
    return { error: "El médico seleccionado no está disponible." };
  }

  if (!medico.disponible) {
    return { error: "El médico no está disponible en este momento. Por favor, elegí otro profesional." };
  }

  const { count } = await supabase
    .from("consultas")
    .select("id", { count: "exact", head: true })
    .eq("paciente_id", user.id)
    .eq("medico_id", medicoId)
    .in("estado", ["esperando", "aceptada", "en_curso"]);

  if (count && count > 0) {
    return { error: "Ya tenés una consulta activa con este profesional." };
  }

  const { data, error } = await supabase
    .from("consultas")
    .insert({
      paciente_id: user.id,
      medico_id: medicoId,
      especialidad: medico.especialidad,
      estado: "esperando",
      motivo_consulta: motivoConsulta.trim(),
      sintomas,
      tiempo_sintomas: tiempoSintomas,
      canal_origen: canalOrigen,
    })
    .select("id")
    .single();

  if (error) {
    console.error("crearConsulta insert failed:", error.code);
    return { error: "No se pudo crear la consulta. Por favor, intentá de nuevo." };
  }

  redirect(`/sala-espera/${data.id}`);
}
