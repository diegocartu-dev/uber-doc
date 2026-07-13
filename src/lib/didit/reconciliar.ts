import type { SupabaseClient } from "@supabase/supabase-js";
import { obtenerDecisionDidit } from "./client";
import { validarMedicoREFEPS } from "@/lib/refeps/validar";

// ─── Reconciliación de identidad biométrica (Didit) ──────────────────────────
// ÚNICA fuente de verdad del control anti-suplantación. La usan DOS caminos:
//   1) el webhook (`/api/didit/webhook`) — reacción en tiempo real, y
//   2) el cron de reconciliación (`/api/cron/reconciliar-identidad`) — backstop
//      que consulta a Didit por si el webhook nunca llegó (ej: URL mal apuntada).
// Mantener la lógica acá y NO duplicarla: dos copias de un control de identidad
// divergen con el tiempo y esa divergencia es la vulnerabilidad.
//
// Regla (idéntica en ambos caminos): solo marcamos `identidad_validada` si Didit
// APROBÓ **y** el DNI que Didit verificó biométricamente coincide con el DNI
// registrado **y** la matrícula declarada pertenece a ese DNI según REFEPS.
// Nunca confiamos en el payload del webhook: re-consultamos la decisión autoritativa.

type ResultadoREFEPS = Awaited<ReturnType<typeof validarMedicoREFEPS>>;

// Errores de REFEPS que son TRANSITORIOS (el Bus no respondió), NO un "no figura"
// real. Ante estos NO decidimos el cruce — dejamos al médico retriable. Doctrina
// del repo: "REFEPS timeout ≠ 'no figura'".
const ERRORES_TRANSITORIOS_REFEPS = new Set([
  "REFEPS_TIMEOUT",
  "REFEPS_AUTH_ERROR",
  "REFEPS_ERROR_INTERNO",
]);

export interface MedicoIdentidad {
  id: string;
  dni: string | null;
  numero_matricula: string | null;
  identidad_validada: boolean;
}

export type ResultadoReconciliacion =
  // No se pudo obtener la decisión de Didit (404/timeout/500). El webhook lo
  // traduce a 502 para que Didit reintente; el cron lo cuenta y reintenta luego.
  | { outcome: "error_decision"; error: string }
  // Ya estaba validado — solo sincronizamos didit_status.
  | { outcome: "ya_validado"; diditStatus: string }
  // Aprobado + cruce cerrado → identidad_validada = true.
  | { outcome: "validado"; diditStatus: string }
  // Aprobado, DNI coincide, pero el Bus REFEPS no respondió (transitorio) → NO
  // decidimos ni tocamos didit_status; se reintenta en la próxima corrida.
  | { outcome: "refeps_transitorio"; diditStatus: string }
  // Aprobado por Didit pero el cruce (respondido por REFEPS) NO cierra → In Review.
  | { outcome: "en_revision"; diditStatus: string; motivo: string }
  // Cualquier otro estado (In Progress, Declined, Expired…) → solo registramos.
  | { outcome: "no_aprobado"; diditStatus: string };

// Normaliza un número (DNI/matrícula) a solo dígitos para comparar.
function soloDigitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

/**
 * Re-consulta la decisión autoritativa de Didit para `sessionId`, corre el cruce
 * anti-suplantación contra el `medico` y PERSISTE el resultado en `medicos`.
 * Devuelve un discriminated union con lo que pasó (para logging / HTTP mapping).
 *
 * `admin` debe ser el cliente service-role (bypass RLS + grants de columna PII):
 * `medico.dni` no tiene GRANT para `authenticated`.
 */
export async function reconciliarIdentidad(
  admin: SupabaseClient,
  medico: MedicoIdentidad,
  sessionId: string
): Promise<ResultadoReconciliacion> {
  // 1. Decisión autoritativa (nunca el payload del webhook).
  let decisionStatus: string;
  let dniDidit = "";
  try {
    const decision = await obtenerDecisionDidit(sessionId);
    decisionStatus = decision.status;
    // Solo extraemos lo mínimo. NO persistimos ni logueamos liveness/face_match.
    dniDidit = soloDigitos(decision.id_verifications?.[0]?.document_number);
  } catch (e) {
    return {
      outcome: "error_decision",
      error: e instanceof Error ? e.message : "error",
    };
  }

  // 2. Ya validado → solo sincronizamos el estado, no rehacemos el cruce.
  if (medico.identidad_validada) {
    await admin
      .from("medicos")
      .update({ didit_status: decisionStatus })
      .eq("id", medico.id);
    return { outcome: "ya_validado", diditStatus: decisionStatus };
  }

  const updates: Record<string, unknown> = { didit_status: decisionStatus };

  // 3. Si Didit aprobó, cruce anti-suplantación.
  if (decisionStatus === "Approved") {
    const dniDocto = soloDigitos(medico.dni);
    const matriculaDocto = soloDigitos(medico.numero_matricula);

    // (a) El DNI que verificó Didit debe coincidir con el DNI registrado.
    const dniCoincide = !!dniDidit && !!dniDocto && dniDidit === dniDocto;

    // (b) La matrícula declarada debe pertenecer al DNI verificado (REFEPS).
    //     Distinguimos un fallo TRANSITORIO del Bus (timeout/auth/interno) de un
    //     "no figura" real: ante fallo transitorio NO decidimos ni tocamos
    //     didit_status — dejamos al médico retriable para la próxima corrida.
    //     Marcar "In Review" por un hipo del Bus trabaría en falso a un médico
    //     legítimo (doctrina del repo: "REFEPS timeout ≠ no figura").
    let refeps: ResultadoREFEPS = { encontrado: false };
    if (dniCoincide) {
      try {
        refeps = await validarMedicoREFEPS(dniDidit);
      } catch {
        refeps = { encontrado: false, error: "REFEPS_ERROR_INTERNO" };
      }
      if (
        !refeps.encontrado &&
        refeps.error &&
        ERRORES_TRANSITORIOS_REFEPS.has(refeps.error)
      ) {
        // El Bus no respondió (no es un "no figura" real). No persistimos nada;
        // el médico queda igual y la próxima corrida (o el webhook) reintenta.
        return { outcome: "refeps_transitorio", diditStatus: decisionStatus };
      }
    }

    const matriculaPertenece =
      !!refeps.encontrado &&
      !!refeps.matriculas?.length &&
      !!matriculaDocto &&
      refeps.matriculas.some((m) => soloDigitos(m.numero) === matriculaDocto);

    if (dniCoincide && matriculaPertenece) {
      updates.identidad_validada = true;
      updates.identidad_validada_at = new Date().toISOString();
      await admin.from("medicos").update(updates).eq("id", medico.id);
      return { outcome: "validado", diditStatus: decisionStatus };
    }

    // Didit aprobó pero el cruce (respondido por REFEPS) no cierra → revisión
    // manual, NO validar. Acá REFEPS SÍ respondió (un fallo transitorio ya
    // retornó arriba): o el DNI no coincide, o la matrícula no pertenece / no figura.
    updates.didit_status = "In Review";
    await admin.from("medicos").update(updates).eq("id", medico.id);
    return {
      outcome: "en_revision",
      diditStatus: "In Review",
      motivo: `dniCoincide=${dniCoincide} matriculaPertenece=${matriculaPertenece}`,
    };
  }

  // 4. Estado no-aprobado (In Progress, Declined, Expired…) → solo registramos.
  await admin.from("medicos").update(updates).eq("id", medico.id);
  return { outcome: "no_aprobado", diditStatus: decisionStatus };
}
