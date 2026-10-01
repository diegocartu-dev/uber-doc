import type { SupabaseClient } from "@supabase/supabase-js";
import { obtenerDecisionDidit } from "./client";
import { validarMedicoREFEPS } from "@/lib/refeps/validar";
import { sendDoctoAlert } from "@/lib/alertas";
import {
  claveMatricula,
  cruzarMatricula,
  motivoRevisionHumano,
  type MatriculaDeRefeps,
} from "@/lib/medicos/matricula-refeps";
import { moverSlugSiNuncaSeAprobo } from "@/lib/medicos/slug-matricula";

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
  /** Para alertas legibles al admin y detección de transición (caso Williana). */
  nombre_completo?: string | null;
  /** didit_status ANTES de reconciliar — las alertas disparan solo en transición
   *  (mismo patrón que el mail verde de cron-guard), nunca en cada corrida. */
  didit_status?: string | null;
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

// Normaliza un DNI a solo dígitos para comparar.
function soloDigitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

type ResultadoCruce =
  // La matrícula quedó confirmada (coincidía o se adoptó la de REFEPS) e
  // identidad_validada = true ya está escrito.
  | { resultado: "validado" }
  // No hay una única respuesta: va a revisión con este motivo.
  | { resultado: "revisar"; motivo: string }
  // La ficha no se pudo leer o escribir, o cambió mientras se verificaba: no se
  // decide nada y la próxima corrida vuelve a mirar.
  | { resultado: "sin_decidir" };

interface FichaCruce {
  dni: string | null;
  tipo_matricula: string | null;
  numero_matricula: string | null;
  provincia_matricula: string | null;
  verificado: boolean | null;
  slug: string | null;
  notas_admin: string | null;
}

/**
 * ÚNICO lugar que escribe `identidad_validada = true`.
 *
 * El DNI ya está verificado por biometría y REFEPS respondió para ese DNI.
 * Entre la lectura de quien llamó y este momento pasaron dos consultas externas
 * (Didit y el Bus: hasta un minuto), y el profesional puede editar su DNI y su
 * matrícula mientras no esté validado. Por eso:
 *
 *  1. La ficha se lee de nuevo acá, y el DNI tiene que seguir siendo el que
 *     verificó la biometría.
 *  2. El cruce se decide sobre ESA lectura.
 *  3. El update lleva como condición los cuatro datos tal como se leyeron
 *     (DNI, tipo, número, provincia). Si alguno cambió en el medio, no escribe
 *     nada: nunca queda validado —y congelado por el candado de la base— un
 *     dato que nadie verificó.
 *
 * Si corresponde adoptar la matrícula de REFEPS, el cambio de número y la
 * validación van en el MISMO update (después el candado ya no dejaría
 * corregirla). Queda la nota en `notas_admin`, que el equipo ve al aprobar.
 */
async function cerrarCruce(
  admin: SupabaseClient,
  medicoId: string,
  dniVerificado: string,
  matriculasRefeps: MatriculaDeRefeps[],
  diditStatus: string
): Promise<ResultadoCruce> {
  const { data, error: errFicha } = await admin
    .from("medicos")
    .select("dni, tipo_matricula, numero_matricula, provincia_matricula, verificado, slug, notas_admin")
    .eq("id", medicoId)
    .single();
  const ficha = data as FichaCruce | null;
  if (errFicha || !ficha) {
    console.error("[didit/reconciliar] no se pudo leer la ficha para cerrar el cruce:", errFicha?.message);
    return { resultado: "sin_decidir" };
  }
  // El DNI cambió desde que se inició esta verificación: lo que se verificó ya
  // no es lo que dice la ficha. La próxima corrida lo lee de nuevo.
  if (!dniVerificado || soloDigitos(ficha.dni) !== dniVerificado) {
    return { resultado: "sin_decidir" };
  }

  const cruce = cruzarMatricula(ficha, matriculasRefeps);
  if (cruce.resultado === "revisar") {
    return { resultado: "revisar", motivo: motivoRevisionHumano(cruce.motivo, cruce.jurisdiccion) };
  }

  // Un profesional YA aprobado: cambiarle la matrícula lo devuelve solo a
  // revisión (trigger reverificar_medico) y lo saca de la clínica. Eso no se
  // hace sin que alguien lo mire.
  if (cruce.resultado === "adoptar" && ficha.verificado === true) {
    return {
      resultado: "revisar",
      motivo:
        "Didit aprobó la identidad, pero la matrícula declarada no es la que REFEPS tiene para ese DNI, y el profesional ya está aprobado: corregirla lo devuelve a revisión, así que no se hizo sola. Elegila en la ficha con «Usar esta».",
    };
  }

  const ahora = new Date();
  const cambios: Record<string, unknown> = {
    didit_status: diditStatus,
    identidad_validada: true,
    identidad_validada_at: ahora.toISOString(),
    identidad_revision_motivo: null,
  };
  if (cruce.resultado === "adoptar") {
    const fecha = ahora.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
    const nota = `${fecha} — Matrícula tomada de REFEPS: declaró ${ficha.tipo_matricula} ${ficha.numero_matricula}; para su DNI figura ${cruce.numero} (${cruce.jurisdiccion}).`;
    cambios.numero_matricula = cruce.numero;
    cambios.notas_admin = ficha.notas_admin ? `${ficha.notas_admin}\n${nota}` : nota;
  }

  // Solo si la ficha sigue EXACTAMENTE como se leyó (ver punto 3 de arriba).
  let escritura = admin.from("medicos").update(cambios).eq("id", medicoId);
  for (const col of ["dni", "tipo_matricula", "numero_matricula", "provincia_matricula"] as const) {
    const valor = ficha[col];
    escritura = valor === null ? escritura.is(col, null) : escritura.eq(col, valor);
  }
  const { data: escritas, error } = await escritura.select("id");
  if (error) {
    if (error.code === "23505") {
      // Otra cuenta de Docto ya tiene esa matrícula: eso sí es para mirar.
      return {
        resultado: "revisar",
        motivo:
          "Didit aprobó la identidad, pero la matrícula que REFEPS tiene para ese DNI ya está cargada en OTRA cuenta de Docto. Puede ser un registro duplicado de la misma persona.",
      };
    }
    console.error("[didit/reconciliar] no se pudo escribir la validación de identidad:", error.message);
    return { resultado: "sin_decidir" };
  }
  if (!escritas?.length) {
    console.warn(`[didit/reconciliar] la ficha cambió mientras se verificaba; se reintenta. medico=${medicoId}`);
    return { resultado: "sin_decidir" };
  }

  if (cruce.resultado === "adoptar") {
    console.log(`[didit/reconciliar] matrícula tomada de REFEPS medico=${medicoId} jurisdiccion=${cruce.jurisdiccion}`);
    await moverSlugSiNuncaSeAprobo(
      admin,
      medicoId,
      ficha.slug,
      { tipo: ficha.tipo_matricula, numero: ficha.numero_matricula },
      { tipo: ficha.tipo_matricula as string, numero: cruce.numero }
    );
  }
  return { resultado: "validado" };
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
    // Clave de comparación (dígitos, sin ceros a la izquierda): "M01234" y "1234"
    // son la misma matrícula.
    const matriculaDocto = claveMatricula(medico.numero_matricula);

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
      refeps.matriculas.some((m) => claveMatricula(m.numero) === matriculaDocto);

    // El DNI es el suyo (biometría) y REFEPS respondió para ese DNI. Si el
    // número que escribió figura, valida. Si no figura —en todos los casos
    // reales era un dígito mal tipeado— el número lo dice REFEPS: con una sola
    // matrícula de médico habilitada en la jurisdicción que declaró, es la suya
    // y se adopta. Regla y motivos: lib/medicos/matricula-refeps.ts.
    let motivoMatricula: string | null = null;
    if (dniCoincide && refeps.encontrado) {
      const cruce = await cerrarCruce(admin, medico.id, dniDidit, refeps.matriculas ?? [], decisionStatus);
      if (cruce.resultado === "validado") {
        return { outcome: "validado", diditStatus: decisionStatus };
      }
      if (cruce.resultado === "sin_decidir") {
        // La ficha no se pudo leer/escribir o cambió en el medio: no se decide
        // nada (ni se toca didit_status); la próxima corrida vuelve a mirar.
        return { outcome: "refeps_transitorio", diditStatus: decisionStatus };
      }
      motivoMatricula = cruce.motivo;
    }

    // Didit aprobó pero el cruce (respondido por REFEPS) no cierra → revisión
    // manual, NO validar. Acá REFEPS SÍ respondió (un fallo transitorio ya
    // retornó arriba): o el DNI no coincide, o la matrícula no pertenece / no figura.
    //
    // Este "In Review" es SINTÉTICO (lo pone Docto, no Didit) y necesita acción
    // HUMANA del admin — el caso Williana (20/07) vivió días invisible porque
    // era indistinguible del In Review real y no alertaba a nadie. Ahora:
    // motivo persistido (visible en el panel) + mail al admin SOLO en la
    // transición (no en cada corrida de 10 min del cron).
    const motivoHumano = !dniCoincide
      ? "Didit aprobó la identidad, pero el DNI del documento escaneado no coincide con el DNI registrado en Docto."
      : motivoMatricula ??
        "Didit aprobó la identidad, pero REFEPS no devolvió ningún profesional para ese DNI.";
    updates.didit_status = "In Review";
    updates.identidad_revision_motivo = motivoHumano;
    await admin.from("medicos").update(updates).eq("id", medico.id);

    if (medico.didit_status !== "In Review") {
      const nombre = medico.nombre_completo ?? `médico ${medico.id}`;
      await sendDoctoAlert(
        `🟠 Identidad de ${nombre}: necesita TU revisión`,
        `${nombre} completó la verificación biométrica y Didit la APROBÓ — la persona es quien dice ser. Pero el cruce automático no cierra:\n\n${motivoHumano}\n\n¿Tenés que hacer algo? Sí: entrá al panel de médicos, abrí la ficha y mirá la credencial y las matrículas que REFEPS tiene para esa persona. Si la correcta es una de esas, elegila con «Usar esta». Este caso no se pudo resolver solo y necesita tu criterio. Nadie más va a revisarlo: es tuyo.\n\n———\nDetalle técnico (para Claude): medico_id=${medico.id}, dniCoincide=${dniCoincide}, matriculaPertenece=${matriculaPertenece}.`
      );
    }
    return {
      outcome: "en_revision",
      diditStatus: "In Review",
      motivo: `dniCoincide=${dniCoincide} matriculaPertenece=${matriculaPertenece}`,
    };
  }

  // 4. Estado no-aprobado (In Progress, Declined, Expired…) → solo registramos,
  //    con dos alertas de transición al admin (nunca repetidas por corrida):
  //    - "In Review" REAL de Didit: informativa — la revisión es de ellos, esperar.
  //    - "Declined": el verificador rechazó — revisar el caso en el panel.
  await admin.from("medicos").update(updates).eq("id", medico.id);
  if (decisionStatus !== medico.didit_status) {
    const nombre = medico.nombre_completo ?? `médico ${medico.id}`;
    if (decisionStatus === "In Review") {
      await sendDoctoAlert(
        `🟡 Identidad de ${nombre}: Didit la está revisando`,
        `${nombre} completó la verificación y quedó en la cola de revisión manual de DIDIT (no nuestra — suele pasar con documentos extranjeros o fotos dudosas).\n\n¿Tenés que hacer algo? No: la resuelven ellos, normalmente en horas. Cuando Didit decida, el sistema sigue solo y si hace falta algo tuyo te llega otro mail.\n\n———\nDetalle técnico (para Claude): medico_id=${medico.id}, didit_status=In Review (real, reportado por Didit).`
      );
    } else if (decisionStatus === "Declined") {
      await sendDoctoAlert(
        `🔴 Identidad de ${nombre}: RECHAZADA por el verificador`,
        `Didit no pudo confirmar que ${nombre} sea quien dice ser (documento ilegible, selfie que no coincide, o intento de suplantación).\n\n¿Tenés que hacer algo? Sí, cuando puedas: mirá el caso en el panel de médicos (badge rojo) y la credencial. El médico ya ve en su pantalla la opción de reintentar con mejores fotos; si insiste en fallar, es señal de alerta real.\n\n———\nDetalle técnico (para Claude): medico_id=${medico.id}, didit_status=Declined.`
      );
    }
  }
  return { outcome: "no_aprobado", diditStatus: decisionStatus };
}
