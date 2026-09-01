"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { getFlag } from "@/lib/feature-flags";
import { identidadHabilitada } from "@/lib/perfil-medico";
import { avisarMedicoAceptarWhatsApp } from "@/lib/whatsapp";
import { MOTIVO } from "@/lib/consultas/clasificar";
import { JURISDICCIONES } from "@/lib/jurisdicciones";
import { buscarEncuentroActivo } from "@/lib/consultas/encuentro-activo";
import { avisarCancelacionDelPaciente } from "@/lib/consultas/aviso-cancelacion";
import { logInfo } from "@/lib/logger";
import { esInstitucional } from "@/lib/instancia";
import { estadoCuentaMp } from "@/lib/mp-cuenta";

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
  // Capa B (modo institucional): un server action se invoca por POST con header
  // Next-Action a CUALQUIER ruta del deploy — el 404 de Capa A sobre /clinica
  // NO lo neutraliza. En la instancia la CI la crea el otorgador, nunca este
  // flujo B2C. En B2C el guard es un boolean false y sigue de largo.
  if (esInstitucional()) {
    return { error: "No disponible." };
  }
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
    .select("id, nombre_completo, dni, fecha_nacimiento, sexo_dni, telefono, tiene_cobertura, nro_afiliado, es_cuenta_test")
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

  // ¿Puede COBRAR? Hasta acá nadie lo preguntaba, y la clínica tampoco: su
  // listado filtra por oculto/verificado/aprobado y NUNCA por la cuenta de
  // cobros. El único control era el candado del toggle "disponible", que mira
  // la cuenta solo en el instante de encenderlo — después nada la revisa.
  //
  // O sea que "un profesional visible puede cobrar" era una suposición, no una
  // garantía. El costo lo pagaba el paciente al final: elegía, esperaba que se
  // la aceptaran, y recién al apretar Pagar se encontraba con un 422.
  //
  // Se bloquea SOLO al que no tiene cuenta. Un permiso vencido NO se bloquea a
  // propósito: desde `lib/mp-token` el checkout lo renueva solo, así que sacarlo
  // de la oferta acá le quitaría al sistema la chance de auto-repararse.
  // Service role: `medicos_mp_accounts` no es legible por un paciente con RLS.
  const { data: cuentaMp } = await createAdminClient()
    .from("medicos_mp_accounts")
    .select("estado, expires_at")
    .eq("medico_id", medicoId)
    .maybeSingle();

  if (estadoCuentaMp(cuentaMp) === "no_conectado") {
    // Mismo texto que "no disponible": al paciente no le sirve —ni le
    // corresponde— enterarse de la plomería de cobros del profesional.
    logInfo("[crearConsulta]", "Bloqueada: el profesional no puede cobrar", { medicoId });
    return { error: "El médico no está disponible en este momento. Por favor, elegí otro profesional." };
  }

  // ¿Ya está adentro de una atención? Tres salidas distintas, ninguna con un
  // cartel sin salida (ver `@/lib/consultas/encuentro-activo`):
  //
  //   1. YA PAGÓ            → no puede abrir otra. Se le dice cuál tiene y se le
  //                           da el botón para ir. "Como usar un Uber y querer
  //                           pedir otro" (Diego, 09/08).
  //   2. NO PAGÓ, mismo pro → no es una atención nueva, es volver: redirect a su
  //                           sala de espera. Sin carteles.
  //   3. NO PAGÓ, otro pro  → puede abandonar y cambiar, pero se le pregunta
  //                           primero. La cancelación la ejecuta
  //                           `cambiarDeProfesional`, no esta función.
  //
  // Acá vivía un guard que miraba `["esperando","aceptada","en_curso"]` y se
  // olvidaba de `pagada` — dejaba pasar justo el caso donde hay plata, y trababa
  // los impagos con un texto que el paciente ni siquiera llegaba a ver (aparecía
  // arriba de un formulario largo, después de cerrar el modal de confirmación).
  const encuentro = await buscarEncuentroActivo(supabase, user.id, perfil?.id ?? null);

  if (encuentro?.pagado) {
    return { encuentroPagado: encuentro };
  }

  if (encuentro && !encuentro.pagado) {
    if (encuentro.medicoId === medicoId) {
      redirect(encuentro.href);
    }
    return { cambioDeProfesional: encuentro };
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
  void avisarMedicoAceptarWhatsApp(medicoId, perfil?.nombre_completo ?? "", {
    consultaId: data.id,
    disparador: "solicitud_ci",
  }).catch(() => {});

  redirect(`/sala-espera/${data.id}`);
}

/**
 * El paciente decidió dejar al profesional que había elegido —todavía sin
 * pagar— y consultar con otro. Cancela la solicitud vieja, le avisa a ese
 * profesional, y recién entonces crea la nueva.
 *
 * "Como un chofer de Uber al que el pasajero le cancela antes de que llegue"
 * (Diego, 09/08/2026). El pasajero puede hacerlo; el chofer tiene que
 * enterarse. Sin ese aviso, un profesional que ya aceptó la consulta se queda
 * esperando a alguien que se fue — el mismo problema de las reservas
 * abandonadas que ya documentamos para turnos.
 *
 * Solo cancela solicitudes SIN pago. Si entre la pantalla y este click el pago
 * entró, el guard de abajo lo detecta y no se toca nada: la consulta pagada
 * sigue siendo la del paciente y `crearConsulta` lo va a mandar ahí.
 */
export async function cambiarDeProfesional(
  consultaAAbandonar: string,
  medicoId: string,
  especialidad: string,
  motivoConsulta: string,
  sintomas: string[],
  tiempoSintomas: string,
  canalOrigen: "clinica_virtual" | "consultorio_privado" = "clinica_virtual"
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "No autenticado." };
  if (!UUID_RE.test(consultaAAbandonar)) return { error: "Consulta inválida." };

  const admin = createAdminClient();

  const { data: vieja } = await admin
    .from("consultas")
    .select("id, paciente_id, medico_id, estado, mp_status")
    .eq("id", consultaAAbandonar)
    .maybeSingle();

  // Que sea del paciente de la sesión. Sin esto, un id ajeno cancelaría la
  // consulta de otra persona.
  if (!vieja || vieja.paciente_id !== user.id) {
    return { error: "No encontramos esa consulta." };
  }

  if (vieja.mp_status === "approved") {
    return {
      error:
        "Esa consulta ya tiene un pago hecho, así que no se puede abandonar. Si necesitás ayuda, escribinos a soporte@docto.com.ar.",
    };
  }

  // Guard de carrera, mismo criterio que /api/consultas/cancelar-solicitud: el
  // UPDATE exige que el estado siga siendo cancelable y que no haya aparecido un
  // pago en el medio. OJO PostgREST: `not.eq` excluye los NULL y `mp_status` es
  // NULL en las impagas — por eso el filtro es explícito.
  const { data: cancelada } = await admin
    .from("consultas")
    .update({
      estado: "cancelada",
      // Se retiró, pero por un motivo distinto al de cancelar y ya: se fue con
      // otro profesional. En el tablero los dos son "retirado" (no es una falla
      // nuestra), y el motivo permite separarlos cuando haga falta.
      resuelta_por: "paciente",
      resuelta_at: new Date().toISOString(),
      resolucion_motivo: MOTIVO.CAMBIO_PROFESIONAL,
    })
    .eq("id", consultaAAbandonar)
    .in("estado", ["esperando", "aceptada"])
    .or("mp_status.is.null,mp_status.neq.approved")
    .select("id")
    .maybeSingle();

  if (!cancelada) {
    // Perdió la carrera. Hay dos carreras MUY distintas:
    //
    // 1) El SISTEMA la cerró un segundo antes (el cron de 10 min la venció, o
    //    ya la había cancelado él mismo). El paciente quería exactamente eso:
    //    dejar esa consulta atrás. Rebotar con "volvé a intentar" era castigar
    //    el mismo desenlace que pedía — y con el menú de rescate apareciendo
    //    justo alrededor del minuto 10, este borde pasa de teórico a frecuente.
    //    Se sigue de largo: no hay nada que cancelar, la creación continúa.
    //
    // 2) Apareció PLATA o la aceptaron y pagó en el medio. Acá sí se frena y
    //    se deja que `crearConsulta` encuentre el encuentro y lo mande ahí.
    const { data: estadoActual } = await admin
      .from("consultas")
      .select("estado, mp_status")
      .eq("id", consultaAAbandonar)
      .maybeSingle();
    const yaCerradaSinPlata =
      estadoActual &&
      ["cancelada", "rechazada"].includes(estadoActual.estado) &&
      estadoActual.mp_status !== "approved";
    if (!yaCerradaSinPlata) {
      return { error: "Esa consulta cambió de estado. Volvé a intentar." };
    }
    logInfo("[cambiar-profesional]", "La solicitud ya estaba cerrada (cron ganó la carrera): se sigue de largo", {
      consultaId: consultaAAbandonar,
    });
  }

  if (cancelada) {
    logInfo("[cambiar-profesional]", "El paciente abandonó una solicitud sin pagar", {
      consultaId: consultaAAbandonar,
    });
  }

  // El profesional se entera — SOLO si la cancelación fue de este camino. Si el
  // cron ganó la carrera, ya recibió su propio aviso ("liberamos al paciente y
  // te desactivamos"), y un "el paciente canceló" encima lo contradiría.
  // Best-effort a propósito: que falle el aviso no puede dejar al paciente sin
  // poder consultar con otro.
  const { data: pacienteFila } = await admin
    .from("pacientes")
    .select("nombre_completo")
    .eq("user_id", user.id)
    .maybeSingle();

  if (cancelada) {
    await avisarCancelacionDelPaciente(
      vieja.medico_id,
      pacienteFila?.nombre_completo ?? "Un paciente"
    ).catch(() => {});
  }

  // Ya no hay encuentro activo: el camino normal se encarga del resto (gates de
  // médico, insert, WhatsApp y redirect a la sala de espera).
  return crearConsulta(medicoId, especialidad, motivoConsulta, sintomas, tiempoSintomas, canalOrigen);
}
