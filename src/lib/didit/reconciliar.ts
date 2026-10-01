import type { SupabaseClient } from "@supabase/supabase-js";
import { obtenerDecisionDidit } from "./client";
import { validarMedicoREFEPS } from "@/lib/refeps/validar";
import { sendDoctoAlert } from "@/lib/alertas";
import { derivarJurisdicciones } from "@/lib/jurisdicciones";
import {
  claveMatricula,
  cruzarMatricula,
  motivoRevisionHumano,
  MOTIVO_DNI_NO_COINCIDE,
  MOTIVO_SIN_PROFESIONAL_EN_REFEPS,
  type MatriculaDeclarada,
} from "@/lib/medicos/matricula-refeps";
import { moverSlugSiNuncaSeAprobo } from "@/lib/medicos/slug-matricula";

// ─── Reconciliación de identidad biométrica (Didit) ──────────────────────────
// ÚNICA fuente de verdad del control anti-suplantación. La usan TRES caminos:
//   1) el webhook (`/api/didit/webhook`) — reacción en tiempo real,
//   2) el cron de reconciliación (`/api/cron/reconciliar-identidad`) — backstop
//      que consulta a Didit por si el webhook nunca llegó (ej: URL mal apuntada), y
//   3) «Usar esta» del panel admin (`/api/admin/medicos`, usar_matricula_refeps),
//      que después de elegir la matrícula cierra el cruce en el momento.
// Mantener la lógica acá y NO duplicarla: dos copias de un control de identidad
// divergen con el tiempo y esa divergencia es la vulnerabilidad.
//
// Regla: solo se marca `identidad_validada` si Didit APROBÓ **y** el DNI que
// Didit verificó biométricamente es el de la ficha **y** la matrícula de la
// ficha es una matrícula de médico habilitada que REFEPS tiene para ese DNI.
// Si el número escrito no lo es, la matrícula sale de REFEPS
// (lib/medicos/matricula-refeps.ts, decisión Diego 01/10/2026).
// Nunca confiamos en el payload del webhook: re-consultamos la decisión autoritativa.

export type ResultadoREFEPS = Awaited<ReturnType<typeof validarMedicoREFEPS>>;

// Errores de REFEPS que son TRANSITORIOS (el Bus no respondió), NO un "no figura"
// real. Ante estos NO decidimos el cruce — dejamos al médico retriable. Doctrina
// del repo: "REFEPS timeout ≠ 'no figura'".
export const ERRORES_TRANSITORIOS_REFEPS = new Set([
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
  // Aprobado y DNI coincide, pero no se pudo decidir: el Bus REFEPS no respondió,
  // o la ficha no se pudo leer/escribir, o cambió mientras se verificaba. NO
  // decidimos ni tocamos didit_status; se reintenta en la próxima corrida.
  | { outcome: "refeps_transitorio"; diditStatus: string }
  // Aprobado por Didit pero el cruce (respondido por REFEPS) NO cierra → In Review.
  | { outcome: "en_revision"; diditStatus: string; motivo: string }
  // Cualquier otro estado (In Progress, Declined, Expired…) → solo registramos.
  | { outcome: "no_aprobado"; diditStatus: string };

// Normaliza un DNI a solo dígitos para comparar.
export function soloDigitos(v: string | null | undefined): string {
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

interface FichaCruce extends MatriculaDeclarada {
  dni: string | null;
  tipo_matricula: string | null;
  numero_matricula: string | null;
  provincia_matricula: string | null;
  verificado: boolean | null;
  verificado_at: string | null;
  estado_registro: string | null;
  slug: string | null;
  notas_admin: string | null;
}

// Las columnas de las que depende la decisión: el update que valida exige que
// sigan exactamente como se leyeron. `verificado` y `estado_registro` porque a
// un aprobado no se le corrige la matrícula sola. `notas_admin` entra SOLO
// cuando se adopta (se reescribe con la nota): en el resto no hace falta, y una
// nota larga alargaría la URL del update sin límite.
const COLUMNAS_DEL_CRUCE = [
  "dni",
  "tipo_matricula",
  "numero_matricula",
  "provincia_matricula",
  "verificado",
  "estado_registro",
] as const;

/**
 * Lo que REFEPS dijo para el DNI BIOMÉTRICO, listo para guardar. La validación
 * automática del alta se hizo con el DNI tipeado; desde que la biometría lo
 * confirma, este es el dato que vale. `refeps_validado` se escribe en los dos
 * sentidos salvo para un aprobado, al que solo se le escribe el "sí" (la base
 * exige REFEPS validado para estar aprobado; si dejó de estarlo, lo resuelve el
 * gate de aprobar, que consulta en vivo).
 */
function datosRefeps(refeps: ResultadoREFEPS, estadoRegistro: string | null, ahoraIso: string): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { raw: _raw, ...refepsSinRaw } = refeps;
  const { jurisdicciones } = derivarJurisdicciones(refeps.matriculas);
  const validado = !!refeps.encontrado && !!refeps.activo;
  // La fecha de validación acompaña a refeps_validado: si no se escribe (un
  // aprobado al que REFEPS hoy devuelve inactivo), tampoco se renueva la fecha.
  const escribeValidado = validado || estadoRegistro !== "aprobado";
  return {
    refeps_data: refepsSinRaw,
    ...(escribeValidado ? { refeps_validado: validado, refeps_validado_at: ahoraIso } : {}),
    ...(jurisdicciones.length ? { jurisdicciones } : {}),
  };
}

/**
 * Cuando el cruce queda en revisión, igual se guarda lo que REFEPS dijo para el
 * DNI biométrico: el panel arma las opciones de «Usar esta» con eso. Solo si el
 * DNI sigue siendo el verificado y la identidad no se validó en el medio.
 */
async function guardarRefepsSinValidar(admin: SupabaseClient, medicoId: string, ficha: FichaCruce, refeps: ResultadoREFEPS): Promise<void> {
  const { error } = await admin
    .from("medicos")
    .update(datosRefeps(refeps, ficha.estado_registro, new Date().toISOString()))
    .eq("id", medicoId)
    .eq("identidad_validada", false)
    .eq("dni", ficha.dni as string);
  if (error) console.warn("[didit/reconciliar] no se pudo guardar el REFEPS del DNI verificado:", error.message);
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
 *  3. El update lleva como condición las columnas del cruce tal como se
 *     leyeron. Si alguna cambió en el medio, no escribe nada: nunca queda
 *     validado —y congelado por el candado de la base— un dato que nadie verificó.
 *
 * En el mismo update se guarda lo que REFEPS dijo para el DNI BIOMÉTRICO
 * (refeps_data, refeps_validado, jurisdicciones): la validación automática del
 * alta se hizo con el DNI tipeado, y desde acá ese es el dato que vale.
 *
 * Si corresponde adoptar la matrícula de REFEPS, el cambio y la validación van
 * en el MISMO update (después el candado ya no dejaría corregirla). Queda en el
 * log de auditoría y una nota en la ficha.
 */
async function cerrarCruce(
  admin: SupabaseClient,
  medicoId: string,
  dniVerificado: string,
  refeps: ResultadoREFEPS,
  diditStatus: string
): Promise<ResultadoCruce> {
  const { data, error: errFicha } = await admin
    .from("medicos")
    .select("dni, tipo_matricula, numero_matricula, provincia_matricula, verificado, verificado_at, estado_registro, slug, notas_admin")
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

  const cruce = cruzarMatricula(ficha, refeps.matriculas ?? []);
  if (cruce.resultado === "revisar") {
    await guardarRefepsSinValidar(admin, medicoId, ficha, refeps);
    return { resultado: "revisar", motivo: motivoRevisionHumano(cruce.motivo, cruce.jurisdiccion) };
  }

  // Un profesional YA aprobado: cambiarle la matrícula lo devuelve solo a
  // revisión (trigger reverificar_medico) y lo saca de la clínica. Eso no se
  // hace sin que alguien lo mire.
  if (cruce.resultado === "adoptar" && ficha.verificado === true) {
    await guardarRefepsSinValidar(admin, medicoId, ficha, refeps);
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
    ...datosRefeps(refeps, ficha.estado_registro, ahora.toISOString()),
  };
  if (cruce.resultado === "adoptar") {
    const fecha = ahora.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
    const nota = `${fecha} — Matrícula tomada de REFEPS: declaró ${ficha.tipo_matricula} ${ficha.numero_matricula}${ficha.provincia_matricula ? ` (${ficha.provincia_matricula})` : ""}; para su DNI figura ${cruce.nueva.tipo_matricula} ${cruce.nueva.numero_matricula}${cruce.nueva.provincia_matricula ? ` (${cruce.nueva.provincia_matricula})` : ""}.`;
    cambios.tipo_matricula = cruce.nueva.tipo_matricula;
    cambios.numero_matricula = cruce.nueva.numero_matricula;
    cambios.provincia_matricula = cruce.nueva.provincia_matricula;
    cambios.notas_admin = ficha.notas_admin ? `${ficha.notas_admin}\n${nota}` : nota;
  }

  // Solo si la ficha sigue EXACTAMENTE como se leyó (ver punto 3 de arriba).
  let escritura = admin.from("medicos").update(cambios).eq("id", medicoId).eq("identidad_validada", false);
  const condiciones: Array<keyof FichaCruce> = [...COLUMNAS_DEL_CRUCE, ...(cruce.resultado === "adoptar" ? (["notas_admin"] as const) : [])];
  for (const col of condiciones) {
    const valor = ficha[col];
    escritura = valor === null ? escritura.is(col, null) : escritura.eq(col, valor);
  }
  const { data: escritas, error } = await escritura.select("id");
  if (error) {
    if (error.code === "23505") {
      // Otra cuenta de Docto ya tiene esa matrícula: eso sí es para mirar.
      await guardarRefepsSinValidar(admin, medicoId, ficha, refeps);
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
    console.log(`[didit/reconciliar] matrícula tomada de REFEPS medico=${medicoId} jurisdiccion=${cruce.jurisdiccion} por=${cruce.por}`);
    // Rastro donde el profesional no puede escribir. `admin_user_id` vacío =
    // lo hizo el sistema (requiere la migración que lo deja nulo; hasta
    // entonces este insert falla, se loguea y queda la nota de la ficha).
    const { error: errAudit } = await admin.from("admin_audit_log").insert({
      admin_user_id: null,
      accion: "corregir_matricula",
      recurso_tipo: "medico",
      recurso_id: medicoId,
      payload_anterior: {
        tipo_matricula: ficha.tipo_matricula,
        numero_matricula: ficha.numero_matricula,
        provincia_matricula: ficha.provincia_matricula,
      },
      payload_nuevo: cruce.nueva,
      motivo: "Tomada de REFEPS al validar la identidad",
      metadata: {
        actor: "sistema",
        por: cruce.por,
        jurisdiccion: cruce.jurisdiccion,
        // Cuánto se parecía lo que escribió: 0 = solo formato o jurisdicción.
        digitos_distintos: distanciaDigitos(ficha.numero_matricula, cruce.nueva.numero_matricula),
      },
    });
    if (errAudit) console.warn("[didit/reconciliar] la adopción no quedó en el log de auditoría:", errAudit.message);

    await moverSlugSiNuncaSeAprobo(admin, medicoId, ficha, {
      tipo: cruce.nueva.tipo_matricula,
      numero: cruce.nueva.numero_matricula,
    });
  }
  return { resultado: "validado" };
}

// Distancia de edición entre los dígitos de dos números (para el log).
function distanciaDigitos(a: string | null | undefined, b: string | null | undefined): number {
  const x = claveMatricula(a);
  const y = claveMatricula(b);
  const d: number[][] = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array(y.length).fill(0)]);
  for (let j = 1; j <= y.length; j++) d[0][j] = j;
  for (let i = 1; i <= x.length; i++)
    for (let j = 1; j <= y.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
  return d[x.length][y.length];
}

/**
 * Marca el cruce como "necesita revisión" (In Review SINTÉTICO, lo pone Docto,
 * no Didit) con el motivo. El caso Williana (20/07) vivió días invisible porque
 * era indistinguible del In Review real y no alertaba a nadie: por eso el motivo
 * queda persistido (visible en el panel) y el mail al equipo sale SOLO en la
 * transición, nunca en cada corrida del cron.
 */
async function marcarEnRevision(
  admin: SupabaseClient,
  medico: MedicoIdentidad,
  motivo: string,
  alertar: boolean
): Promise<void> {
  await admin
    .from("medicos")
    .update({ didit_status: "In Review", identidad_revision_motivo: motivo })
    .eq("id", medico.id)
    .eq("identidad_validada", false);

  if (!alertar || medico.didit_status === "In Review") return;
  const nombre = medico.nombre_completo ?? `médico ${medico.id}`;
  const queHacer =
    motivo === MOTIVO_DNI_NO_COINCIDE
      ? "entrá al panel de médicos y compará el DNI de la ficha con el del documento de la credencial. Si el de la ficha está mal tipeado, hay que corregirlo; el sistema vuelve a cruzar en la próxima pasada."
      : "entrá al panel de médicos y mirá la credencial y las matrículas que REFEPS tiene para esa persona. Si la correcta es una de esas, elegila con «Usar esta» y la identidad queda validada en el momento.";
  await sendDoctoAlert(
    `🟠 Identidad de ${nombre}: necesita TU revisión`,
    `${nombre} completó la verificación biométrica y Didit la APROBÓ — la persona es quien dice ser. Pero el cruce automático no cierra:\n\n${motivo}\n\n¿Tenés que hacer algo? Sí: ${queHacer} Este caso no se pudo resolver solo. Nadie más va a revisarlo: es tuyo.\n\n———\nDetalle técnico (para Claude): medico_id=${medico.id}.`
  );
}

/**
 * Paso del cruce con una decisión de Didit ya APROBADA en la mano. Lo usan
 * `reconciliarIdentidad` (webhook y cron) y «Usar esta» del panel, que ya
 * consultó REFEPS en vivo y lo pasa en `opciones.refeps` para no volver a
 * esperar al Bus.
 */
export async function aplicarDecisionAprobada(
  admin: SupabaseClient,
  medico: MedicoIdentidad,
  dniDidit: string,
  opciones: { refeps?: ResultadoREFEPS; alertar: boolean }
): Promise<ResultadoReconciliacion> {
  const diditStatus = "Approved";
  const dniCoincide = !!dniDidit && soloDigitos(medico.dni) === dniDidit;
  if (!dniCoincide) {
    await marcarEnRevision(admin, medico, MOTIVO_DNI_NO_COINCIDE, opciones.alertar);
    return { outcome: "en_revision", diditStatus: "In Review", motivo: "dni_no_coincide" };
  }

  // Un fallo TRANSITORIO del Bus (timeout/auth/interno) no es un "no figura":
  // marcar "In Review" por un hipo del Bus trabaría en falso a un médico legítimo.
  let refeps = opciones.refeps;
  if (!refeps) {
    try {
      refeps = await validarMedicoREFEPS(dniDidit);
    } catch {
      refeps = { encontrado: false, error: "REFEPS_ERROR_INTERNO" };
    }
  }
  if (!refeps.encontrado && refeps.error && ERRORES_TRANSITORIOS_REFEPS.has(refeps.error)) {
    return { outcome: "refeps_transitorio", diditStatus };
  }
  if (!refeps.encontrado) {
    // El "no" de REFEPS para el DNI biométrico también se guarda (la validación
    // del alta se hizo con el DNI tipeado). A un aprobado no se le baja: la base
    // exige REFEPS validado para estar aprobado; lo resuelve el gate de aprobar.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { raw: _raw, ...refepsSinRaw } = refeps;
    const { error: errNo } = await admin
      .from("medicos")
      .update({ refeps_data: refepsSinRaw, refeps_validado: false, refeps_validado_at: new Date().toISOString() })
      .eq("id", medico.id)
      .eq("identidad_validada", false)
      .eq("dni", medico.dni as string)
      .neq("estado_registro", "aprobado");
    if (errNo) console.warn("[didit/reconciliar] no se pudo guardar el 'no' de REFEPS:", errNo.message);
    await marcarEnRevision(admin, medico, MOTIVO_SIN_PROFESIONAL_EN_REFEPS, opciones.alertar);
    return { outcome: "en_revision", diditStatus: "In Review", motivo: "sin_profesional_en_refeps" };
  }

  const cruce = await cerrarCruce(admin, medico.id, dniDidit, refeps, diditStatus);
  if (cruce.resultado === "validado") return { outcome: "validado", diditStatus };
  if (cruce.resultado === "sin_decidir") return { outcome: "refeps_transitorio", diditStatus };
  await marcarEnRevision(admin, medico, cruce.motivo, opciones.alertar);
  return { outcome: "en_revision", diditStatus: "In Review", motivo: "matricula" };
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

  // 3. Si Didit aprobó, cruce anti-suplantación.
  if (decisionStatus === "Approved") {
    return aplicarDecisionAprobada(admin, medico, dniDidit, { alertar: true });
  }

  // 4. Estado no-aprobado (In Progress, Declined, Expired…) → solo registramos,
  //    con dos alertas de transición al admin (nunca repetidas por corrida):
  //    - "In Review" REAL de Didit: informativa — la revisión es de ellos, esperar.
  //    - "Declined": el verificador rechazó — revisar el caso en el panel.
  //    El motivo de un In Review sintético anterior se limpia: ya no aplica (si
  //    quedara, el panel confundiría un In Review real de Didit con uno nuestro).
  await admin
    .from("medicos")
    .update({ didit_status: decisionStatus, identidad_revision_motivo: null })
    .eq("id", medico.id);
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
