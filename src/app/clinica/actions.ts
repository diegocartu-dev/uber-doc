"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { getFlag } from "@/lib/feature-flags";
import { identidadHabilitada } from "@/lib/perfil-medico";
import { avisarMedicoAceptarWhatsApp } from "@/lib/whatsapp";
import { JURISDICCIONES } from "@/lib/jurisdicciones";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Guarda la provincia declarada por el paciente (ruteo por jurisdicción). Se escribe con
// service role filtrando por el user_id de la sesión: la columna `provincia` es nueva y
// podría no tener GRANT UPDATE para `authenticated` — el service role evita esa trampa.
export async function guardarProvincia(
  provincia: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado." };
  if (!(JURISDICCIONES as readonly string[]).includes(provincia)) {
    return { ok: false, error: "Provincia inválida." };
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("pacientes")
    .update({ provincia })
    .eq("user_id", user.id);
  if (error) {
    console.error("[guardarProvincia]", error.message);
    return { ok: false, error: "No se pudo guardar tu provincia." };
  }
  return { ok: true };
}

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
    .select("nombre_completo, dni, fecha_nacimiento, sexo_dni, telefono, tiene_cobertura, nro_afiliado, es_cuenta_test")
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
    .select("id, especialidad, disponible, verificado, estado_registro, es_cuenta_test, identidad_validada, biometria_exenta, visible_consultorio_particular, ci_en_consultorio")
    .eq("id", medicoId)
    .single();

  if (medicoError || !medico) {
    return { error: "El médico seleccionado no está disponible." };
  }

  // Enforcement del toggle del consultorio (Roberto, gate 15/07): CI por el
  // canal privado con el consultorio apagado tampoco pasa por deep-link.
  if (canalOrigen === "consultorio_privado" && medico.visible_consultorio_particular === false) {
    return { error: "El médico seleccionado no está disponible." };
  }

  // CI en el consultorio particular = opt-in explícito del médico (tilde,
  // decisión Diego 15/07). Autoridad server: sin tilde, tampoco por deep-link.
  if (canalOrigen === "consultorio_privado" && medico.ci_en_consultorio !== true) {
    return { error: "El médico seleccionado no está disponible." };
  }

  // Carril de prueba (universos paralelos): test↔test y real↔real permitidos; los
  // cruces (paciente test ↔ médico real, o viceversa) se bloquean. Un paciente no
  // puede auto-marcarse como test (lo setea un admin en DB), así que no abre agujero.
  const pacienteEsTest = perfil?.es_cuenta_test === true;
  if (medico.es_cuenta_test !== pacienteEsTest || !medico.verificado || medico.estado_registro !== "aprobado") {
    return { error: "El médico seleccionado no está disponible." };
  }

  // C2 (Roberto): gate server-side de identidad biométrica. Con el flag activo,
  // un médico sin identidad validada no puede recibir consultas (sin consulta no
  // hay emisión de recetas). Cierra el bypass por deep-link / endpoint directo.
  {
    const { getFlag } = await import("@/lib/feature-flags");
    if ((await getFlag("identidad_gate_activa")) && !identidadHabilitada(medico)) {
      return { error: "El médico seleccionado no está disponible." };
    }
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

  // TRIGGER A — avisar al médico por WhatsApp que un paciente solicitó una CI y debe
  // aceptarla (recién ahí el paciente puede pagar e ingresar). Solo CI. Fire-and-forget
  // ANTES del redirect (redirect lanza una excepción de control). Inerte sin flag/creds.
  void avisarMedicoAceptarWhatsApp(medicoId, perfil?.nombre_completo ?? "").catch(() => {});

  redirect(`/sala-espera/${data.id}`);
}
