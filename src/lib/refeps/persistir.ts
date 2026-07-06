import { createAdminClient } from "@/lib/supabase/admin";
import { validarMedicoREFEPS } from "./validar";
import { derivarJurisdicciones } from "@/lib/jurisdicciones";

// Validación REFEPS automática + persistencia, compartida por el registro del médico
// (waitUntil post-alta) y el cron de reintento. El admin debe encontrarse al médico YA
// resuelto (✓ figura / ✗ no figura), sin apretar nada; el botón manual queda solo como
// red para cuando esto no pudo correr (Bus caído).
//
// Semántica de persistencia (misma que el gate de aprobar, #246):
// - encontrado+activo  → refeps_validado=true + jurisdicciones derivadas. DEFINITIVO.
// - no figura/inactiva → refeps_validado=false. DEFINITIVO (no se reintenta solo).
// - error de SISTEMA (timeout/auth/interno) → NO tocar refeps_validado; solo guardar
//   diagnóstico + contador de intentos para la cadencia del cron. Se reintenta.

const ERRORES_SISTEMA = new Set([
  "REFEPS_TIMEOUT",
  "REFEPS_AUTH_ERROR",
  "REFEPS_ERROR_INTERNO",
]);

export type ResultadoAuto = "validado" | "no_figura" | "error_sistema" | "sin_dni";

export async function validarYPersistirRefeps(medicoId: string): Promise<ResultadoAuto> {
  const admin = createAdminClient();

  const { data: medico } = await admin
    .from("medicos")
    .select("id, dni, refeps_validado, refeps_data, es_cuenta_test")
    .eq("id", medicoId)
    .single();
  if (!medico?.dni) return "sin_dni";
  if (medico.es_cuenta_test === true) return "sin_dni"; // cuentas test: nunca pegar al Bus real
  if (medico.refeps_validado === true) return "validado"; // ya resuelto, no re-pegar al Bus

  const resultado = await validarMedicoREFEPS(medico.dni);
  // Strippear `raw` (FHIR completo con datos personales) antes de persistir.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { raw: _raw, ...resultadoSinRaw } = resultado;
  const ahora = new Date().toISOString();

  // Contador de intentos automáticos (vive dentro de refeps_data — sin migración).
  const dataPrevia = (medico.refeps_data ?? {}) as Record<string, unknown>;
  const intentosPrevios = typeof dataPrevia.auto_intentos === "number" ? dataPrevia.auto_intentos : 0;
  const tracking = { auto_intentos: intentosPrevios + 1, ultimo_intento_at: ahora };

  if (!resultado.encontrado && resultado.error && ERRORES_SISTEMA.has(resultado.error)) {
    // Bus caído/lento: diagnóstico + tracking, sin falso negativo pegado.
    await admin
      .from("medicos")
      .update({ refeps_data: { ...resultadoSinRaw, ...tracking } })
      .eq("id", medicoId);
    return "error_sistema";
  }

  if (resultado.encontrado && resultado.activo) {
    const { jurisdicciones } = derivarJurisdicciones(resultado.matriculas);
    await admin
      .from("medicos")
      .update({
        refeps_validado: true,
        refeps_data: { ...resultadoSinRaw, ...tracking },
        refeps_validado_at: ahora,
        ...(jurisdicciones.length ? { jurisdicciones } : {}),
      })
      .eq("id", medicoId);
    return "validado";
  }

  // "No" real: no encontrado, matrícula inactiva o sin matrícula registrada.
  await admin
    .from("medicos")
    .update({
      refeps_validado: false,
      refeps_data: { ...resultadoSinRaw, ...tracking },
      refeps_validado_at: ahora,
    })
    .eq("id", medicoId);
  return "no_figura";
}
