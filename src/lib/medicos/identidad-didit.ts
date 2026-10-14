// Fecha de nacimiento, sexo, nombre y apellido del profesional, tal como los
// trae la verificación de identidad (Didit, del DNI), 13/10/2026. Farmalink los
// exige para registrar cada receta (docs/farmalink-integracion.md) y Docto no
// los guardaba.
//
// Vive aparte (`medicos_identidad`, solo service role) y NO toca el flujo de
// verificación: se completa a demanda leyendo la decisión que Didit ya tiene
// (`asegurarIdentidadMedico`), y para los profesionales ya verificados con
// `/api/admin/identidad-medicos` (corre en producción: la clave de Didit no sale
// de ahí). Lo que Didit no trae queda vacío: no se adivina (ni el sexo por el
// "Dr."/"Dra.").

import type { SupabaseClient } from "@supabase/supabase-js";
import { obtenerDecisionDidit } from "@/lib/didit/client";
import type { DiditDecision } from "@/lib/didit/types";

export type IdentidadMedico = {
  fecha_nacimiento: string | null;
  sexo: "M" | "F" | "X" | null;
  nombre: string | null;
  apellido: string | null;
};

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** AAAA-MM-DD y una fecha que existe (no "1970-02-30"). */
function esFechaReal(v: unknown): boolean {
  if (typeof v !== "string" || !FECHA_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Lo que sirve de una decisión de Didit. Pura: se testea sin red. */
export function identidadDeDecision(decision: DiditDecision | null | undefined): IdentidadMedico {
  const id = decision?.id_verifications?.[0];
  const fecha = esFechaReal(id?.date_of_birth) ? (id!.date_of_birth as string) : null;
  const g = (id?.gender ?? "").trim().toUpperCase();
  const sexo = g === "M" || g === "F" || g === "X" ? (g as "M" | "F" | "X") : null;
  const limpio = (s: unknown) => (typeof s === "string" && s.trim() ? s.trim().slice(0, 120) : null);
  return { fecha_nacimiento: fecha, sexo, nombre: limpio(id?.first_name), apellido: limpio(id?.last_name) };
}

/**
 * La identidad guardada del profesional; si no está, la pide a Didit (con la
 * sesión de verificación que ya tiene la ficha) y la guarda. Nunca lanza.
 */
export async function asegurarIdentidadMedico(
  admin: SupabaseClient,
  medicoId: string,
  opciones: { obtenerDecision?: (sessionId: string) => Promise<DiditDecision> } = {},
): Promise<{ ok: true; identidad: IdentidadMedico; origen: "guardada" | "didit" } | { ok: false; motivo: string }> {
  const { data: ficha, error: errorFicha } = await admin
    .from("medicos")
    .select("didit_session_id, identidad_validada")
    .eq("id", medicoId)
    .maybeSingle();
  if (errorFicha) return { ok: false, motivo: `ficha: ${errorFicha.message}` };
  if (!ficha?.didit_session_id || ficha.identidad_validada !== true) return { ok: false, motivo: "sin verificación de identidad" };

  // Lo guardado vale si salió de la verificación vigente: si se volvió a
  // verificar, se lee la nueva.
  const { data: guardada, error } = await admin
    .from("medicos_identidad")
    .select("fecha_nacimiento, sexo, nombre, apellido, didit_session_id")
    .eq("medico_id", medicoId)
    .maybeSingle();
  if (error) return { ok: false, motivo: `lectura: ${error.message}` };
  if (guardada?.fecha_nacimiento && guardada?.sexo && guardada.didit_session_id === ficha.didit_session_id) {
    const { didit_session_id: _sesion, ...identidad } = guardada;
    void _sesion;
    return { ok: true, identidad: identidad as IdentidadMedico, origen: "guardada" };
  }

  let decision: DiditDecision;
  try {
    decision = await (opciones.obtenerDecision ?? obtenerDecisionDidit)(ficha.didit_session_id);
  } catch (err) {
    return { ok: false, motivo: `didit: ${err instanceof Error ? err.message : String(err)}` };
  }
  const identidad = identidadDeDecision(decision);
  if (!identidad.fecha_nacimiento && !identidad.sexo) return { ok: false, motivo: "Didit no trae fecha ni sexo" };

  const { error: errorGuardar } = await admin.from("medicos_identidad").upsert({
    medico_id: medicoId,
    ...identidad,
    fuente: "didit",
    didit_session_id: ficha.didit_session_id,
    actualizado_at: new Date().toISOString(),
  });
  if (errorGuardar) return { ok: false, motivo: `guardado: ${errorGuardar.message}` };
  return { ok: true, identidad, origen: "didit" };
}
