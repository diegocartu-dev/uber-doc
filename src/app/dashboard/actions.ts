"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { perfilMedicoCompleto, camposFaltantesMedico } from "@/lib/perfil-medico";
import { logDisponibilidad } from "@/lib/disponibilidad-log";

export async function actualizarDisponibilidad(data: {
  disponible: boolean;
  disponible_desde: string;
  disponible_hasta: string;
  duracion_consulta?: number;
  precio_consulta?: number;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "No autenticado." };
  }

  const updateData: Record<string, unknown> = {
    disponible: data.disponible,
  };
  // Solo pisar el horario si viene con valor — un payload vacío no debe borrar
  // la franja guardada (la pantalla nueva de config manda solo lo elegido).
  if (data.disponible_desde) updateData.disponible_desde = data.disponible_desde;
  if (data.disponible_hasta) updateData.disponible_hasta = data.disponible_hasta;
  if (data.duracion_consulta) updateData.duracion_consulta = data.duracion_consulta;
  if (data.precio_consulta) updateData.precio_consulta = data.precio_consulta;

  // Desempate FIFO de la grilla de Clínica Virtual (§11.2/§11.4): `disponible_desde_at`
  // marca el instante en que el médico se habilita de forma CONTINUA. Solo se toca en la
  // transición real (false→true setea now(), true→false limpia a null). Si el médico ya
  // estaba disponible y solo guarda horario/precio/duración (handleGuardar manda
  // disponible: true sin cambio de estado), NO se pisa el timestamp: mantiene su lugar
  // en la cola. Para distinguir transición de re-guardado leemos el estado previo.
  // Fila propia vía service role: el SELECT incluye celular_personal (sin GRANT
  // para authenticated). Con el cliente RLS, PostgREST falla la query ENTERA →
  // previo=null → el gate duro de abajo NO corre (se podría activar disponible sin
  // MP/firma) y se rompe el FIFO/log. Es el dato propio del médico, por user_id.
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const adminDb = createAdminClient();
  const { data: previo } = await adminDb
    .from("medicos")
    .select("id, disponible, nombre_completo, especialidad, tipo_matricula, numero_matricula, telefono, celular_personal, domicilio_consultorio, foto_url, firma_manuscrita_url, es_cuenta_test, precio_consulta, duracion_consulta, disponible_desde, disponible_hasta")
    .eq("user_id", user.id)
    .maybeSingle();

  // Gate duro: no se puede activar la disponibilidad (atender) sin el onboarding
  // completo. Defensa en profundidad — el cliente ya lo bloquea, pero el server
  // es la fuente de verdad. Incluye Mercado Pago conectado y firma electrónica
  // (sin eso no cobra ni firma recetas). MP/firma no viven en `medicos`: se leen
  // de `medicos_mp_accounts` (activo) y `medico_claves`. Solo al ACTIVAR.
  if (data.disponible && previo) {
    const [mpRes, firmaRes] = await Promise.all([
      adminDb
        .from("medicos_mp_accounts")
        .select("estado")
        .eq("medico_id", previo.id)
        .eq("estado", "activo")
        .maybeSingle(),
      adminDb.from("medico_claves").select("id").eq("medico_id", previo.id).maybeSingle(),
    ]);
    const onb = { mpConectado: !!mpRes.data, firmaConfigurada: !!firmaRes.data };
    if (!perfilMedicoCompleto(previo, onb)) {
      const faltan = camposFaltantesMedico(previo, onb).map((c) => c.label);
      return {
        error: `Completá tu perfil para poder atender. Falta: ${faltan.join(", ")}.`,
      };
    }
    // Invariante modelo nuevo (Roberto #269): tras sacar la config del registro,
    // precio_consulta puede ser NULL. Sin precio no puede ofrecer CI — si no, la
    // clínica lo mostraría reservable a "$0" y el paciente choca 422 al pagar.
    // Test exento (igual que perfilMedicoCompleto).
    if (!previo.es_cuenta_test && !previo.precio_consulta) {
      return {
        error: "Configurá el valor de tu consulta inmediata antes de activarte.",
      };
    }
    // Spec "cómo atendés" (15/07): activar exige también duración y horario —
    // sin duración la capacidad es incalculable, sin franja el "disponible" es
    // ambiguo. Se acepta del payload O de la fila (los 17 médicos existentes
    // tienen duración; el horario lo manda siempre el panel del dashboard).
    if (!previo.es_cuenta_test && !(data.duracion_consulta || previo.duracion_consulta)) {
      return { error: "Elegí la duración de tu consulta inmediata antes de activarte." };
    }
    const desdeOk = data.disponible_desde || previo.disponible_desde;
    const hastaOk = data.disponible_hasta || previo.disponible_hasta;
    if (!previo.es_cuenta_test && (!desdeOk || !hastaOk)) {
      return { error: "Configurá el horario en que aceptás consultas antes de activarte." };
    }
  }

  if (data.disponible && !previo?.disponible) {
    updateData.disponible_desde_at = new Date().toISOString();
  } else if (!data.disponible) {
    updateData.disponible_desde_at = null;
  }

  const { error } = await supabase
    .from("medicos")
    .update(updateData)
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  // Log de la transición real de disponibilidad CI (para el panel de oferta).
  // Solo transiciones reales (no re-guardados) y médicos no-test. Non-blocking.
  if (previo?.id && !previo.es_cuenta_test) {
    if (data.disponible && !previo.disponible) {
      await logDisponibilidad(previo.id, true);
    } else if (!data.disponible && previo.disponible) {
      await logDisponibilidad(previo.id, false);
    }
  }

  return { success: true };
}

export async function fetchMetricasMedico(
  medicoId: string,
  periodo: "hoy" | "semana" | "mes"
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { turnos: 0, enEspera: 0, completadas: 0, ingresos: 0, neto: 0 };

  const { data: med } = await supabase
    .from("medicos").select("id, precio_consulta").eq("id", medicoId).eq("user_id", user.id).maybeSingle();
  if (!med) return { turnos: 0, enEspera: 0, completadas: 0, ingresos: 0, neto: 0 };

  const ahora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const pad = (n: number) => n.toString().padStart(2, "0");
  const hoy = `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}`;

  let fechaDesde = hoy;
  let fechaHasta = hoy;

  if (periodo === "semana") {
    const d = new Date(ahora);
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    fechaDesde = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    d.setDate(d.getDate() + 6);
    fechaHasta = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  } else if (periodo === "mes") {
    fechaDesde = `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-01`;
    const lastDay = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate();
    fechaHasta = `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(lastDay)}`;
  }

  const { count: turnosCount } = await supabase
    .from("turnos").select("id", { count: "exact", head: true })
    .eq("medico_id", medicoId)
    .gte("fecha", hoy).lte("fecha", fechaHasta)
    .in("estado", ["confirmado", "en_espera"]);

  const { count: turnosEspera } = await supabase
    .from("turnos").select("id", { count: "exact", head: true })
    .eq("medico_id", medicoId).eq("estado", "en_espera").gte("fecha", hoy);
  const { count: consultasEspera } = await supabase
    .from("consultas").select("id", { count: "exact", head: true })
    .eq("medico_id", medicoId).eq("estado", "esperando");

  const { data: turnosCompData } = await supabase
    .from("turnos").select("monto, comision_docto_pct")
    .eq("medico_id", medicoId).eq("estado", "completado")
    .gte("fecha", fechaDesde).lte("fecha", hoy);
  const { data: consultasCompData } = await supabase
    .from("consultas").select("monto, comision_docto_pct")
    .eq("medico_id", medicoId).eq("estado", "completada")
    .gte("created_at", `${fechaDesde}T00:00:00`);

  const turnosComp = turnosCompData?.length ?? 0;
  const consultasComp = consultasCompData?.length ?? 0;
  const completadas = turnosComp + consultasComp;

  // Ingresos = suma de los montos REALES facturados (respeta el valor de cada
  // consulta/turno, que pueden ser distintos). Neto = ingresos menos la comisión
  // de Docto por consulta (comision_docto_pct, default 5%). MISMA fórmula que el
  // cálculo inicial del dashboard (page.tsx) para que "Hoy" no difiera entre la
  // carga de la página y el botón.
  const completadasData = [...(turnosCompData ?? []), ...(consultasCompData ?? [])];
  const ingresos = completadasData.reduce((sum, x) => sum + (x.monto ?? 0), 0);
  const neto = Math.round(
    completadasData.reduce(
      (sum, x) => sum + (x.monto ?? 0) * (1 - (Number(x.comision_docto_pct) || 5) / 100),
      0
    )
  );

  return {
    turnos: turnosCount ?? 0,
    enEspera: (turnosEspera ?? 0) + (consultasEspera ?? 0),
    completadas,
    ingresos,
    neto,
  };
}

export async function actualizarOcultoClinica(oculto: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { error } = await supabase
    .from("medicos")
    .update({ oculto_clinica: oculto })
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { success: true };
}

export async function actualizarVisibleConsultorio(visible: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { error } = await supabase
    .from("medicos")
    .update({ visible_consultorio_particular: visible })
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { success: true };
}

export async function rechazarConsulta(consultaId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { data: medico } = await supabase
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!medico) return { error: "No sos médico." };

  const { error } = await supabase
    .from("consultas")
    .update({ estado: "rechazada" })
    .eq("id", consultaId)
    .eq("medico_id", medico.id)
    .eq("estado", "esperando");

  if (error) return { error: error.message };
  return { success: true };
}

export async function cancelarTurnosMedico(
  turnoIds: string[],
  motivo?: string
): Promise<{ success?: boolean; cancelados: number; errores: string[] }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { cancelados: 0, errores: ["No autenticado."] };

  const { data: medico } = await supabase
    .from("medicos").select("id").eq("user_id", user.id).maybeSingle();
  if (!medico) return { cancelados: 0, errores: ["Perfil médico no encontrado."] };
  if (turnoIds.length === 0 || turnoIds.length > 50) return { cancelados: 0, errores: ["Seleccioná entre 1 y 50 turnos."] };

  const { cancelarTurnoPorMedico } = await import("@/lib/cancelaciones");

  let cancelados = 0;
  const errores: string[] = [];

  for (const turnoId of turnoIds) {
    const resultado = await cancelarTurnoPorMedico(turnoId, medico.id, motivo);
    if (resultado.ok) {
      cancelados++;
    } else {
      errores.push(`${turnoId}: ${resultado.error}`);
    }
  }

  revalidatePath("/medico/agenda");
  return { success: cancelados > 0, cancelados, errores };
}

export async function cancelarTurnoPaciente(
  turnoId: string,
  motivo?: string
): Promise<{ success?: boolean; reembolso?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const { data: paciente } = await supabase
    .from("pacientes").select("id").eq("user_id", user.id).maybeSingle();
  if (!paciente) return { error: "Paciente no encontrado." };

  const { cancelarTurnoPorPaciente } = await import("@/lib/cancelaciones");
  const resultado = await cancelarTurnoPorPaciente(turnoId, paciente.id, motivo);

  if (!resultado.ok) return { error: resultado.error };
  return { success: true, reembolso: resultado.reembolso };
}
