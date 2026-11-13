// Cambiar la matrícula de un profesional con la identidad YA validada (13/11/2026).
//
// POR QUÉ EXISTE: validada la identidad, la base congela la matrícula. Los
// profesionales validados antes del cruce con REFEPS (01/10) pueden tener en la
// ficha una matrícula que REFEPS no da por habilitada y otra que sí: no había
// forma de pasarlos a la buena (ni el panel ni ellos), y cada caso terminaba en
// un mail a soporte sin salida.
//
// LA REGLA (la misma de siempre, CLAUDE.md «La matrícula la dice REFEPS»): no se
// escribe ningún número. Solo se puede ELEGIR una matrícula que REFEPS tenga hoy,
// habilitada y de su profesión, para el DNI que verificó la biometría. Las dos
// fuentes se consultan en vivo en cada cambio: lo guardado en la ficha no alcanza
// para apoyar una escritura.
//
// El profesional sigue aprobado: es la misma persona con otra de sus matrículas
// oficiales. Los documentos ya firmados no cambian (llevan su propia copia de la
// matrícula, lib/firma/identidad.ts); el link del perfil público tampoco.
//
// La escritura pasa por la función `cambiar_matricula_validada` de la base, la
// única puerta del candado (supabase/migrations/20261113_…). Solo servidor.

import type { SupabaseClient } from "@supabase/supabase-js";
import { obtenerDecisionDidit } from "@/lib/didit/client";
import { soloDigitos } from "@/lib/didit/reconciliar";
import { validarMedicoREFEPS } from "@/lib/refeps/validar";
import { nombreProfesion, profesionDe } from "@/lib/refeps/profesion";
import { elegirDeRefeps, etiquetaMatricula, type MatriculaDeRefeps, type MatriculaEnFicha } from "./matricula-refeps";

const ERRORES_SISTEMA_REFEPS = new Set(["REFEPS_TIMEOUT", "REFEPS_AUTH_ERROR", "REFEPS_ERROR_INTERNO"]);

export type CambioDeMatricula =
  | { ok: true; anterior: MatriculaEnFicha; nueva: MatriculaEnFicha }
  | { ok: false; status: number; error: string };

const no = (status: number, error: string): CambioDeMatricula => ({ ok: false, status, error });

export async function cambiarMatriculaValidada(
  admin: SupabaseClient,
  medicoId: string,
  elegida: { tipo: string; numero: string }
): Promise<CambioDeMatricula> {
  const { data: ficha, error: errFicha } = await admin
    .from("medicos")
    .select(
      "dni, tipo_matricula, numero_matricula, provincia_matricula, identidad_validada, didit_session_id, es_cuenta_test, profesion"
    )
    .eq("id", medicoId)
    .maybeSingle();
  if (errFicha) return no(500, "No se pudo leer la ficha. No se cambió nada.");
  if (!ficha) return no(404, "Profesional no encontrado");
  if (ficha.identidad_validada !== true) {
    return no(409, "La identidad todavía no está validada: la matrícula se corrige con el cruce de identidad.");
  }
  if (ficha.es_cuenta_test === true) return no(400, "Las cuentas de prueba no se consultan contra REFEPS.");
  if (!ficha.didit_session_id) {
    return no(409, "Esta ficha no tiene una verificación biométrica para confirmar el DNI: no se puede cambiar desde acá.");
  }

  // El DNI que vale es el del documento que verificó la biometría.
  let dniDidit = "";
  try {
    const decision = await obtenerDecisionDidit(ficha.didit_session_id as string);
    if (decision.status !== "Approved") {
      return no(409, "La verificación de identidad ya no figura aprobada. No se cambió nada.");
    }
    dniDidit = soloDigitos(decision.id_verifications?.[0]?.document_number);
  } catch {
    return no(503, "No pudimos confirmar la identidad en este momento. No se cambió nada: probá de nuevo en un rato.");
  }
  if (!dniDidit || dniDidit !== soloDigitos(ficha.dni as string | null)) {
    return no(409, "El DNI de la ficha no es el del documento verificado. No se cambió nada.");
  }

  // REFEPS en vivo, por ese DNI.
  const refeps = await validarMedicoREFEPS(dniDidit);
  if (!refeps.encontrado) {
    const transitorio = !!refeps.error && ERRORES_SISTEMA_REFEPS.has(refeps.error);
    return transitorio
      ? no(503, "REFEPS no respondió. No se cambió nada: probá de nuevo en un rato.")
      : no(400, "REFEPS no devolvió ningún profesional para este DNI.");
  }
  const profesion = profesionDe(ficha.profesion as string | null);
  const nueva = elegirDeRefeps((refeps.matriculas ?? []) as MatriculaDeRefeps[], elegida, profesion);
  if (!nueva) {
    return no(400, `REFEPS no tiene hoy esa matrícula como de ${nombreProfesion(profesion)} y habilitada para este DNI.`);
  }

  const anterior: MatriculaEnFicha = {
    tipo_matricula: ficha.tipo_matricula as MatriculaEnFicha["tipo_matricula"],
    numero_matricula: ficha.numero_matricula as string,
    provincia_matricula: (ficha.provincia_matricula as string | null) ?? null,
  };
  if (
    anterior.tipo_matricula === nueva.tipo_matricula &&
    anterior.numero_matricula === nueva.numero_matricula &&
    anterior.provincia_matricula === nueva.provincia_matricula
  ) {
    return no(409, `${etiquetaMatricula(nueva)} ya es la matrícula de la ficha.`);
  }

  // Solo si la ficha sigue como se leyó (la función compara los valores anteriores).
  const { data: filas, error } = await admin.rpc("cambiar_matricula_validada", {
    p_medico_id: medicoId,
    p_tipo: nueva.tipo_matricula,
    p_numero: nueva.numero_matricula,
    p_provincia: nueva.provincia_matricula,
    p_tipo_anterior: anterior.tipo_matricula,
    p_numero_anterior: anterior.numero_matricula,
    p_provincia_anterior: anterior.provincia_matricula,
  });
  if (error) {
    if (error.code === "23505") return no(409, "Esa matrícula ya está cargada en otra cuenta de Docto.");
    console.error("[medicos/cambiar-matricula] la base rechazó el cambio:", error.message, { medicoId });
    return no(500, "No se pudo guardar el cambio. No se cambió nada.");
  }
  if (filas !== 1) return no(409, "La ficha cambió mientras tanto. Recargá la página y probá de nuevo.");

  return { ok: true, anterior, nueva };
}
