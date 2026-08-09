// src/lib/firma/documento.ts
//
// Firma electrónica de documentos médicos (receta / certificado / indicaciones /
// orden) sobre la tabla `documentos`.
//
// Cuatro caminos de atribución, mismo motor criptográfico (hash canónico SHA-256
// + RSA-SHA256 con la clave del médico) y mismo registro de no-repudio:
//
//   1. `firmarDocumento(...)`      — segundo factor OTP (art. 5 Ley 25.506 + 2FA).
//   2. `firmarDocumentoPorSesion(...)` — atribución por sesión autenticada del
//      médico en el instante en que toca "Finalizar consulta" con el contenido
//      a la vista. Es el acto de voluntad; la firma se ejecuta server-side.
//   3. `sellarDocumentoDiferido(...)` — sello de integridad DIFERIDO sobre
//      documentos emitidos antes de que el sellado automático existiera. NO es
//      una firma nueva: la firma electrónica ocurrió al emitirse (art. 5); esto
//      consolida su evidencia criptográfica. `firmado_at` es el instante REAL
//      del sellado, nunca la fecha de emisión. Ver el bloque del camino 3.
//   4. `firmarDocumentoPorRescate(...)` — el profesional redactó el contenido
//      desde su sesión (autoguardado del borrador) pero la consulta se cerró
//      sola, sin que tocara "Finalizar". La plataforma emite lo escrito y lo
//      sella; el log deja constancia expresa de que él NO confirmó al cerrar.
//      Ver el bloque del camino 4.
//
// Ninguna norma (25.506, 27.553, Dto. 98/2023, Dto. 407/2026) exige OTP por
// documento. Lo que el art. 5 in fine SÍ impone es que, si la firma se
// desconoce, la carga de acreditarla es de quien la invoca. Por eso el log de
// `firma_logs` guarda el sustrato completo de identificación (identidad
// biométrica, REFEPS, sesión, T&C, IP, user-agent) y va encadenado.
//
// El hash cubre el contenido clínico Y la identidad impresa (nombre del
// paciente, CUIL, obra social, matrícula del médico…), congelada al firmar en
// `firma_digital.identidad` — ver `./identidad.ts`. Sin eso, la firma afirmaba
// integridad sobre datos que sus dueños pueden editar después de emitido.
//
// REGLA DURA: la firma NUNCA bloquea la entrega del documento. Si falla, el
// documento queda guardado y entregado, sin sello y marcado como tal.

import { createAdminClient } from "@/lib/supabase/admin";
import { hashSHA256, firmar, verificar, desencriptarClavePrivada } from "./crypto";
import { canonicalJSON } from "./receta";
import { provisionarClaves } from "./claves";
import {
  construirIdentidadDocumento,
  identidadDesdeJSONB,
  type IdentidadDocumento,
} from "./identidad";
import { formatNombreMedico } from "@/lib/utils/texto";

// Consistente con el flujo de receta (OTP_EXPIRY_MS).
const OTP_VENTANA_MS = 5 * 60 * 1000;

const ALGORITMO = "RSA-SHA256";
const REINTENTOS_CADENA = 4;

/**
 * Sello criptográfico aplicado por la plataforma DESPUÉS de la emisión, sobre una
 * firma electrónica preexistente (art. 5 Ley 25.506). El valor dice las dos cosas
 * que importan: que fue posterior y que lo aplicó la plataforma, no el profesional.
 */
export const METODO_SELLADO_DIFERIDO = "sellado_diferido_plataforma";

/**
 * La plataforma emitió y selló, en el mismo instante, el contenido clínico que
 * el profesional había dejado escrito en el borrador de una consulta que se
 * cerró sola. Ver el camino 4 más abajo.
 */
export const METODO_RESCATE_BORRADOR = "rescate_borrador";

type MetodoAtribucion =
  | "otp"
  | "sesion_medico"
  | typeof METODO_SELLADO_DIFERIDO
  | typeof METODO_RESCATE_BORRADOR;

/**
 * Únicos tipos que se sellan: los documentos clínicos que el médico redactó y
 * tuvo a la vista al cerrar. `documentos` también recibe filas de tracking que
 * NO son documentos revisados (p. ej. `documento_medico`, que solo registra
 * "Documento enviado: archivo.pdf" cuando el médico manda un adjunto por mail):
 * firmarlas haría que /verificar diga "Documento verificado" sobre un nombre de
 * archivo que nadie revisó como documento firmado.
 */
export const TIPOS_FIRMABLES = ["receta", "indicaciones", "certificado", "orden"] as const;

export function esTipoFirmable(tipo: string | null | undefined): boolean {
  return !!tipo && (TIPOS_FIRMABLES as readonly string[]).includes(tipo);
}

type DocFirmable = {
  id: string;
  tipo: string;
  diagnostico: string | null;
  tratamiento: string | null;
  dias_reposo: number | null;
  contenido: string | null;
  paciente_id: string;
  medico_id: string;
  created_at: string;
};

// Columnas que se leen para firmar/verificar. Debe incluir TODO lo que entra al
// hash: si falta una, la verificación posterior no reproduce la firma.
const COLUMNAS_FIRMABLES =
  "id, tipo, medico_id, paciente_id, diagnostico, tratamiento, dias_reposo, contenido, created_at, firma_digital, consulta_id, turno_id";

/**
 * Objeto canónico que se hashea y firma. Liga la firma al contenido sustantivo
 * Y a la identidad del documento: cualquier alteración posterior invalida la
 * verificación.
 *
 * `created_at` entra al hash (dictamen 07/08/2026): en un certificado de reposo
 * el rango de días se calcula desde la fecha de emisión — sin ella dentro del
 * hash se podría correr la ventana de reposo sin romper la firma.
 * `id` entra al hash para que una firma no pueda transplantarse a otro
 * documento de contenido idéntico.
 *
 * `identidad` entra al hash (corrección post-revisión 07/08/2026): los IDs de
 * paciente y médico no son lo que el PDF imprime. Imprime nombre, CUIL, obra
 * social, matrícula — datos vivos y editables por sus dueños después de emitido.
 * Sin el snapshot dentro del hash, cambiarle el nombre al paciente producía un
 * PDF nuevo con el mismo QR y la página pública seguía en verde. Ver
 * `./identidad.ts`.
 */
function contenidoFirmable(doc: DocFirmable, identidad: IdentidadDocumento | null) {
  return {
    id: doc.id,
    tipo: doc.tipo,
    diagnostico: doc.diagnostico ?? null,
    tratamiento: doc.tratamiento ?? null,
    dias_reposo: doc.dias_reposo ?? null,
    contenido: doc.contenido ?? null,
    paciente_id: doc.paciente_id,
    medico_id: doc.medico_id,
    created_at: doc.created_at,
    identidad: identidad ?? null,
  };
}

type FirmaResult =
  | { ok: true; hash: string; firma: string; firmado_at: string }
  | { ok: false; error: string };

// ─── Registro de no-repudio (append-only + encadenado por médico) ─────────────

type LogFirma = {
  documento_id: string | null;
  receta_id: string | null;
  medico_id: string;
  hash: string;
  algoritmo: string;
  firmado_at: string;
  metodo_atribucion: MetodoAtribucion;
  otp_id: string | null;
  clave_id: string | null;
  ip: string | null;
  user_agent: string | null;
  firmante: Record<string, unknown> | null;
  contexto: Record<string, unknown> | null;
};

function genesisCadena(medicoId: string): string {
  return hashSHA256(`docto:firma_logs:genesis:${medicoId}`);
}

/**
 * Inserta la fila de `firma_logs` encadenada al último log del médico.
 * La unicidad de (medico_id, log_anterior_hash) en DB impide bifurcar la
 * cadena; si dos firmas concurrentes leen la misma punta, la perdedora
 * reintenta con la punta nueva.
 */
async function insertarFirmaLog(log: LogFirma): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient();

  for (let intento = 0; intento < REINTENTOS_CADENA; intento++) {
    const { data: ultimo, error: errorPunta } = await supabase
      .from("firma_logs")
      .select("log_hash")
      .eq("medico_id", log.medico_id)
      .not("log_hash", "is", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    // "No pude leer la punta" NO es "no hay punta": si se confunden, se usa el
    // hash génesis, que ya existe → unique_violation en los 4 reintentos y la
    // firma se revierte sin que nadie sepa por qué. Se corta acá, con la causa.
    if (errorPunta) {
      return {
        ok: false,
        error: `${pistaMigracion(errorPunta)}No se pudo leer la cadena de firmas: ${errorPunta.message}`,
      };
    }

    const logAnteriorHash = ultimo?.log_hash ?? genesisCadena(log.medico_id);
    const logHash = hashSHA256(canonicalJSON({ ...log, log_anterior_hash: logAnteriorHash }));

    const { error } = await supabase.from("firma_logs").insert({
      ...log,
      log_anterior_hash: logAnteriorHash,
      log_hash: logHash,
    });

    if (!error) return { ok: true };

    // 23505 = unique_violation → otra firma se metió en la cadena. Reintentar.
    if (error.code === "23505") continue;

    return { ok: false, error: `${pistaMigracion(error)}${error.message}` };
  }

  return { ok: false, error: "No se pudo encadenar el registro de firma (concurrencia)" };
}

/**
 * Si el código sale a producción ANTES de su migración, el insert en
 * `firma_logs` falla por columna inexistente (42703 / PGRST204), por
 * `otp_id NOT NULL` (23502) o porque el CHECK del método de atribución todavía
 * no conoce el valor nuevo (23514) — y los documentos salen "sin sello".
 * El error crudo de PostgREST no lo dice; este prefijo sí, y el cron
 * `documentos-sin-sello` avisa por mail dentro de la hora.
 */
function pistaMigracion(error: { code?: string; message?: string }): string {
  const codigo = error.code ?? "";
  const mensaje = error.message ?? "";
  const esColumnaFaltante = codigo === "42703" || codigo === "PGRST204";
  const esOtpObligatorio = codigo === "23502" && mensaje.includes("otp_id");
  // 23514 = check_violation. El CHECK de metodo_atribucion se ensancha en cada
  // migración que agrega un camino de firma nuevo.
  const esMetodoDesconocido = codigo === "23514" && mensaje.includes("metodo_atribucion");
  if (esMetodoDesconocido) {
    return "MIGRACIÓN FALTANTE (el CHECK de firma_logs.metodo_atribucion no conoce este método — aplicar la migración del camino de firma correspondiente, p. ej. supabase/migrations/20260808_rescate_borrador.sql): ";
  }
  return esColumnaFaltante || esOtpObligatorio
    ? "MIGRACIÓN FALTANTE (aplicar supabase/migrations/20260807_firma_por_sesion.sql): "
    : "";
}

/**
 * Firma el contenido y persiste. Garantiza el invariante:
 * documento firmado ⇔ existe su fila en firma_logs.
 * Si el log no se puede escribir, revierte la firma (el documento queda sin
 * sello, que es la verdad) en vez de dejar una firma sin defensa.
 */
async function sellarDocumento(
  doc: DocFirmable,
  identidad: IdentidadDocumento,
  claves: { id: string; clave_privada_enc: string },
  log: Omit<LogFirma, "hash" | "firmado_at" | "algoritmo" | "clave_id" | "documento_id" | "receta_id" | "medico_id">,
  /**
   * Campos extra para `documentos.firma_digital`. Hoy solo los usa el sellado
   * diferido (`sellado_diferido: true` + `emitido_at`), para que la página de
   * verificación pueda mostrar las DOS fechas sin ir a buscar el log.
   * NO entra al hash: el hash cubre el contenido y la identidad impresa.
   */
  extraFirmaDigital?: Record<string, unknown>
): Promise<FirmaResult> {
  const supabase = createAdminClient();

  const hash = hashSHA256(canonicalJSON(contenidoFirmable(doc, identidad)));
  const clavePrivada = desencriptarClavePrivada(claves.clave_privada_enc);
  const firma = firmar(hash, clavePrivada);
  // Reloj del SERVIDOR, UTC. Nunca del cliente.
  const firmadoAt = new Date().toISOString();

  const firmaDigital = {
    hash,
    firma,
    algoritmo: ALGORITMO,
    firmado_at: firmadoAt,
    medico_id: doc.medico_id,
    metodo_atribucion: log.metodo_atribucion,
    otp_id: log.otp_id,
    clave_id: claves.id,
    // Identidad impresa, congelada y cubierta por el hash. El PDF de un
    // documento sellado se arma DESDE acá, no desde las tablas vivas.
    identidad,
    ...(extraFirmaDigital ?? {}),
  };

  // Guard `is firma_digital null` → evita doble firma (TOCTOU).
  const { data: updated, error: updateError } = await supabase
    .from("documentos")
    .update({ firma_digital: firmaDigital })
    .eq("id", doc.id)
    .eq("medico_id", doc.medico_id)
    .is("firma_digital", null)
    .select("id");

  if (updateError || !updated || updated.length === 0) {
    return { ok: false, error: "El documento ya fue firmado o cambió de estado" };
  }

  const logResult = await insertarFirmaLog({
    ...log,
    documento_id: doc.id,
    receta_id: null,
    medico_id: doc.medico_id,
    hash,
    algoritmo: ALGORITMO,
    firmado_at: firmadoAt,
    clave_id: claves.id,
  });

  if (!logResult.ok) {
    // Sin log no hay defensa: preferimos "sin sello" (verdadero) antes que una
    // firma que no podríamos acreditar. Revertimos solo si sigue siendo NUESTRA firma.
    //
    // `.select("id")`: sin él, un UPDATE que no matchea ninguna fila devuelve
    // `error: null` y el invariante "documento firmado ⇔ fila en firma_logs" se
    // rompía EN SILENCIO — justo el estado que requiere corrección manual.
    const { data: revertidas, error: revertError } = await supabase
      .from("documentos")
      .update({ firma_digital: null })
      .eq("id", doc.id)
      .eq("firma_digital->>hash", hash)
      .select("id");

    console.error("[firma-doc] firma revertida: no se pudo escribir firma_logs:", logResult.error);

    if (revertError || !revertidas || revertidas.length === 0) {
      // Estado a corregir a mano: documento sellado sin registro de no-repudio.
      const causa = revertError
        ? `revert falló: ${revertError.message}`
        : "el UPDATE de revert no alcanzó ninguna fila";
      console.error(
        `[firma-doc] ALERTA: documento ${doc.id} puede haber quedado con firma_digital SIN firma_logs (${causa})`
      );
    }
    return { ok: false, error: `No se pudo registrar la firma: ${logResult.error}` };
  }

  return { ok: true, hash, firma, firmado_at: firmadoAt };
}

// ─── Camino 1 — firma con OTP (segundo factor) ────────────────────────────────

export async function firmarDocumento(
  documentoId: string,
  medicoId: string,
  otpId: string,
  meta: { ip: string; userAgent: string }
): Promise<FirmaResult> {
  const supabase = createAdminClient();

  // 1. OTP válido, del médico, NO consumido (ni para receta ni para documento), en ventana.
  const { data: otp } = await supabase
    .from("otp_firma")
    .select(
      "id, medico_id, usado, consulta_id, turno_id, created_at, consumido_para_receta_id, consumido_para_documento_id"
    )
    .eq("id", otpId)
    .single();

  if (!otp) return { ok: false, error: "OTP no encontrado" };
  if (!otp.usado) return { ok: false, error: "OTP no fue validado" };
  if (otp.medico_id !== medicoId) return { ok: false, error: "OTP no pertenece a este médico" };
  if (otp.consumido_para_receta_id || otp.consumido_para_documento_id) {
    return { ok: false, error: "Este código ya fue usado para firmar otro documento" };
  }
  if (Date.now() - new Date(otp.created_at).getTime() > OTP_VENTANA_MS) {
    return { ok: false, error: "OTP expirado para firma" };
  }

  // 2. Documento del médico, sin firmar, con consulta/turno asociado.
  const { data: doc } = await supabase
    .from("documentos")
    .select(COLUMNAS_FIRMABLES)
    .eq("id", documentoId)
    .single<DocFirmable & { firma_digital: unknown; consulta_id: string | null; turno_id: string | null }>();

  if (!doc) return { ok: false, error: "Documento no encontrado" };
  if (doc.medico_id !== medicoId) return { ok: false, error: "No autorizado" };
  if (doc.firma_digital) return { ok: false, error: "Documento ya firmado" };
  if (!esTipoFirmable(doc.tipo)) {
    return { ok: false, error: `Tipo no firmable: ${doc.tipo}` };
  }
  if (!doc.consulta_id && !doc.turno_id) {
    return { ok: false, error: "Documento sin consulta ni turno asociado" };
  }

  // 3. Scope del OTP: misma consulta/turno que el documento.
  if (doc.consulta_id && otp.consulta_id !== doc.consulta_id) {
    return { ok: false, error: "OTP no corresponde a esta consulta" };
  }
  if (doc.turno_id && otp.turno_id !== doc.turno_id) {
    return { ok: false, error: "OTP no corresponde a este turno" };
  }

  // 4. Clave activa (no revocada) del médico.
  const { data: claves } = await supabase
    .from("medico_claves")
    .select("id, clave_publica, clave_privada_enc")
    .eq("medico_id", medicoId)
    .eq("activa", true)
    .single();

  if (!claves) return { ok: false, error: "Médico sin claves de firma activas" };

  // 5. Congelar la identidad que el PDF imprime. Sin snapshot NO se firma: un
  //    sello sobre datos vivos afirmaría integridad que no cubre.
  const identidad = await construirIdentidadDocumento(medicoId, doc.paciente_id);
  if (!identidad) {
    return { ok: false, error: "No se pudo congelar la identidad del documento" };
  }

  const firmante = await snapshotFirmante(medicoId);
  const contexto = await contextoDocumento(doc, {
    consulta_id: doc.consulta_id,
    turno_id: doc.turno_id,
  });

  // 6. Firmar + persistir + loguear.
  const resultado = await sellarDocumento(doc, identidad, claves, {
    metodo_atribucion: "otp",
    otp_id: otpId,
    ip: meta.ip,
    user_agent: meta.userAgent,
    firmante,
    contexto: { ...contexto, otp_validado: true },
  });

  if (!resultado.ok) return resultado;

  // 7. Consumir OTP (one-time-use, atómico vía guards .is null).
  const { error: otpConsumoError } = await supabase
    .from("otp_firma")
    .update({ consumido_para_documento_id: documentoId })
    .eq("id", otpId)
    .is("consumido_para_documento_id", null)
    .is("consumido_para_receta_id", null);

  if (otpConsumoError) {
    console.error(
      "[firma-doc] OTP consumption failed (doc ya firmado vía guard is firma_digital):",
      otpConsumoError.message
    );
  }

  return resultado;
}

// ─── Camino 2 — firma por atribución de sesión del médico ────────────────────

export type AtribucionSesion = {
  /** auth.users.id de la sesión con la que el médico tocó "Finalizar consulta". */
  userId: string;
  /** IP de origen del request. Obligatoria (dictamen 07/08/2026). */
  ip: string;
  /** User-agent de origen. Obligatorio. */
  userAgent: string;
};

/**
 * Firma un documento atribuyéndolo a la sesión autenticada del médico.
 * El caller DEBE haber verificado que la sesión pertenece a `medicoId`.
 */
export async function firmarDocumentoPorSesion(
  documentoId: string,
  medicoId: string,
  atribucion: AtribucionSesion
): Promise<FirmaResult> {
  const supabase = createAdminClient();

  const { data: doc } = await supabase
    .from("documentos")
    .select(COLUMNAS_FIRMABLES)
    .eq("id", documentoId)
    .single<DocFirmable & { firma_digital: unknown; consulta_id: string | null; turno_id: string | null }>();

  if (!doc) return { ok: false, error: "Documento no encontrado" };
  if (doc.medico_id !== medicoId) return { ok: false, error: "No autorizado" };
  if (doc.firma_digital) return { ok: false, error: "Documento ya firmado" };
  if (!esTipoFirmable(doc.tipo)) {
    return { ok: false, error: `Tipo no firmable: ${doc.tipo}` };
  }
  if (!doc.consulta_id && !doc.turno_id) {
    return { ok: false, error: "Documento sin consulta ni turno asociado" };
  }

  const { data: claves } = await supabase
    .from("medico_claves")
    .select("id, clave_privada_enc")
    .eq("medico_id", medicoId)
    .eq("activa", true)
    .single();

  if (!claves) return { ok: false, error: "Médico sin claves de firma activas" };

  // Identidad impresa congelada antes de firmar (ver ./identidad.ts).
  const identidad = await construirIdentidadDocumento(medicoId, doc.paciente_id);
  if (!identidad) {
    return { ok: false, error: "No se pudo congelar la identidad del documento" };
  }

  const firmante = await snapshotFirmante(medicoId);
  const contexto = await contextoDocumento(doc, {
    consulta_id: doc.consulta_id,
    turno_id: doc.turno_id,
  });

  return sellarDocumento(doc, identidad, claves, {
    metodo_atribucion: "sesion_medico",
    otp_id: null,
    ip: atribucion.ip,
    user_agent: atribucion.userAgent,
    firmante: { ...firmante, sesion_user_id: atribucion.userId },
    contexto,
  });
}

// ─── Camino 3 — sello de integridad DIFERIDO (documentos históricos) ─────────
//
// QUÉ ES Y QUÉ NO ES (dictamen legal 07/08/2026, segunda parte):
// Los documentos emitidos antes de que el sellado automático existiera ya están
// firmados electrónicamente: el profesional, con identidad validada y matrícula
// verificada, los emitió desde su sesión autenticada, en una consulta que ocurrió
// y que el paciente pagó. El art. 5 de la Ley 25.506 es tecnológicamente neutro
// y no exige criptografía: ESE acto fue la firma.
//
// Lo que se aplica acá es el SELLO CRIPTOGRÁFICO — evidencia de esa firma, no la
// firma misma. No es "firma retroactiva", ni "regularización", ni "refirmado":
// esos términos no describen lo que pasa y no se usan.
//
// QUÉ CERTIFICA: que el contenido y la identidad impresa que hoy se registran
// corresponden a ese documento y a ese profesional según los registros de Docto;
// que desde el instante del sellado el contenido no cambió; y la atribución al
// profesional, sostenida en el acto de emisión.
//
// QUÉ NO CERTIFICA, y en ningún lado se afirma: que el profesional haya ejecutado
// un acto de firma en el instante del sellado (no lo hizo — queda constancia
// expresa en el log), ni integridad criptográfica entre la emisión y el sellado,
// ni fecha cierta de la firma en la fecha de emisión, ni firma digital de los
// arts. 7 y 8 (las presunciones de autoría e integridad NO se invocan).
//
// LÍMITE DURO: `firmado_at` es SIEMPRE el instante real del sellado. Ningún campo
// —acá, en el PDF, en la verificación pública o en un export— puede contener una
// fecha de firma anterior a la real. La fecha de emisión viaja aparte, en
// `contexto.emitido_at` y en `firma_digital.emitido_at`, y la página pública
// muestra las dos.

/** Por qué un documento NO entra al lote. Cada valor va al reporte del backfill. */
export type MotivoNoApto =
  | "no_encontrado"
  /** Ya tiene sello. Es el caso normal al reanudar: idempotencia, no error. */
  | "ya_sellado"
  /** Fila de tracking o tipo no clínico: no se firma (ver TIPOS_FIRMABLES). */
  | "tipo_no_firmable"
  /** Sin consulta ni turno: no hay acto médico al que atribuir la emisión. */
  | "sin_evento_clinico"
  | "cuenta_test"
  /**
   * El profesional no estaba validado (REFEPS/identidad) al momento de emitir, o
   * no es computable. Va a REVISIÓN MANUAL, no al lote.
   */
  | "medico_no_validado_al_emitir";

export type EvaluacionSellado =
  | { apto: true; medico_id: string; emitido_at: string; tipo: string; tiene_claves: boolean }
  | { apto: false; motivo: MotivoNoApto; detalle: string };

type DocSellable = DocFirmable & {
  firma_digital: unknown;
  consulta_id: string | null;
  turno_id: string | null;
};

type EvaluacionInterna =
  | {
      apto: true;
      doc: DocSellable;
      firmante: Record<string, unknown>;
      /**
       * ¿El profesional ya figuraba validado en NUESTROS registros cuando emitió?
       * true = sí · false = la validación quedó registrada después · null = no
       * computable. NO condiciona el sellado (para eso vale su estado de hoy:
       * aprobado + REFEPS validado), pero se guarda tal cual en el log: la
       * cronología real no se maquilla.
       */
      habilitado: boolean | null;
      tieneClaves: boolean;
    }
  | { apto: false; motivo: MotivoNoApto; detalle: string };

/**
 * ¿El profesional estaba validado cuando emitió el documento?
 * `null` cuando no es computable (falta alguna de las dos fechas de validación):
 * se declara el límite, no se simula un `true`.
 */
function habilitadoAlEmitir(
  firmante: Record<string, unknown>,
  emitidoAt: string
): boolean | null {
  const refeps = firmante.refeps_validado_at;
  const identidad = firmante.identidad_validada_at;
  if (typeof refeps !== "string" || typeof identidad !== "string") return null;

  const emitido = Date.parse(emitidoAt);
  const tRefeps = Date.parse(refeps);
  const tIdentidad = Date.parse(identidad);
  if (!Number.isFinite(emitido) || !Number.isFinite(tRefeps) || !Number.isFinite(tIdentidad)) {
    return null;
  }
  return tRefeps <= emitido && tIdentidad <= emitido;
}

/**
 * ¿El paciente del documento es una cuenta de prueba?
 *
 * `documentos.paciente_id` referencia `pacientes.id`, pero se consulta también
 * por `user_id`: en otras tablas la columna homónima guarda el user_id, y una
 * fila de prueba que se escape acá queda sellada y no se puede deshacer.
 *
 * Si la consulta falla, LANZA en vez de devolver `false`. Sellar es irreversible:
 * ante la duda no se sella. El backfill lo anota como `error_sellado` con el
 * detalle, así el operador ve qué pasó en vez de comerse un sellado silencioso.
 */
async function pacienteEsDePrueba(pacienteId: string | null): Promise<boolean> {
  if (!pacienteId) return false;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("pacientes")
    .select("id")
    .eq("es_cuenta_test", true)
    .or(`id.eq.${pacienteId},user_id.eq.${pacienteId}`)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `No se pudo determinar si el paciente es cuenta de prueba: ${error.message}`
    );
  }
  return !!data;
}

async function evaluarInterna(documentoId: string): Promise<EvaluacionInterna> {
  const supabase = createAdminClient();

  const { data: doc } = await supabase
    .from("documentos")
    .select(COLUMNAS_FIRMABLES)
    .eq("id", documentoId)
    .maybeSingle<DocSellable>();

  if (!doc) return { apto: false, motivo: "no_encontrado", detalle: "No existe el documento" };

  // Idempotencia: un documento sellado NO se vuelve a sellar nunca.
  if (doc.firma_digital) {
    return { apto: false, motivo: "ya_sellado", detalle: "Ya tiene sello electrónico" };
  }
  if (!esTipoFirmable(doc.tipo)) {
    return { apto: false, motivo: "tipo_no_firmable", detalle: `Tipo "${doc.tipo}"` };
  }
  if (!doc.consulta_id && !doc.turno_id) {
    return {
      apto: false,
      motivo: "sin_evento_clinico",
      detalle: "Sin consulta ni turno asociado",
    };
  }

  const firmante = await snapshotFirmante(doc.medico_id);

  if (firmante.es_cuenta_test === true) {
    return {
      apto: false,
      motivo: "cuenta_test",
      detalle: "Documento de una cuenta de prueba (profesional)",
    };
  }

  // El filtro miraba SOLO la bandera del MÉDICO, y eso deja pasar el caso que
  // más se dio: pruebas hechas con una cuenta de paciente interna contra
  // médicos reales. Esos documentos no son actos clínicos —sellarlos los suma
  // al lote y le manda al profesional el aviso de que "sus documentos ya se
  // pueden verificar" por algo que fue una prueba— y el sello no se deshace.
  // La convención del repo es filtrar bilateral: ver `src/lib/insights/filtro-test.ts`.
  if (await pacienteEsDePrueba(doc.paciente_id)) {
    return {
      apto: false,
      motivo: "cuenta_test",
      detalle: "Documento de una cuenta de prueba (paciente)",
    };
  }

  // Habilitación del profesional.
  //
  // `habilitadoAlEmitir` compara la fecha de emisión contra la fecha en que
  // NOSOTROS registramos la validación, y eso mide cuándo corrimos el chequeo,
  // no desde cuándo la persona es médica. Caso real: un profesional fundador,
  // aprobado y con matrícula activa en REFEPS, emitió documentos un día antes
  // de que la validación automática se ejecutara sobre su ficha. Bloquearlos
  // por eso sería castigar un documento legítimo por una demora nuestra —
  // exactamente el problema que este trabajo vino a reparar.
  //
  // Criterio: alcanza con que el profesional esté HOY aprobado y validado
  // contra REFEPS. Lo que NO se sella es el documento de alguien que nunca
  // fue validado, o que está rechazado o suspendido. La cronología real
  // (cuándo se validó vs. cuándo emitió) se registra igual en el log, sin
  // maquillar: `habilitado_al_emitir` distingue true / false / desconocido.
  const habilitado = habilitadoAlEmitir(firmante, doc.created_at);
  const validadoHoy =
    firmante.refeps_validado === true && firmante.estado_registro === "aprobado";
  if (!validadoHoy) {
    return {
      apto: false,
      motivo: "medico_no_validado_al_emitir",
      detalle:
        firmante.refeps_validado === true
          ? `El profesional no está aprobado hoy (estado: ${String(firmante.estado_registro ?? "desconocido")})`
          : "El profesional no figura validado contra REFEPS",
    };
  }

  const { data: claves } = await supabase
    .from("medico_claves")
    .select("id")
    .eq("medico_id", doc.medico_id)
    .eq("activa", true)
    .maybeSingle();

  return { apto: true, doc, firmante, habilitado, tieneClaves: !!claves };
}

/**
 * Evalúa si un documento entra al lote, SIN tocar nada. Es lo que corre el
 * `--dry-run` del backfill: exactamente los mismos guards que el sellado real,
 * para que la simulación no mienta.
 */
export async function evaluarSelladoDiferido(documentoId: string): Promise<EvaluacionSellado> {
  const e = await evaluarInterna(documentoId);
  if (!e.apto) return { apto: false, motivo: e.motivo, detalle: e.detalle };
  return {
    apto: true,
    medico_id: e.doc.medico_id,
    emitido_at: e.doc.created_at,
    tipo: e.doc.tipo,
    tiene_claves: e.tieneClaves,
  };
}

export type OpcionesSelladoDiferido = {
  /** Lote al que pertenece este sellado (tabla `sellado_diferido_lote`). */
  loteId: string;
  /** Total de documentos alcanzados por el lote. */
  loteTotal: number;
};

export type ResultadoSelladoDiferido =
  | {
      ok: true;
      hash: string;
      firmado_at: string;
      medico_id: string;
      /** El par de claves se generó recién para este sellado (queda en el log). */
      clave_creada: boolean;
    }
  | { ok: false; motivo: MotivoNoApto | "sin_claves" | "sin_identidad" | "error_sellado"; detalle: string };

/**
 * Autorización de la operación. Va dentro del `contexto` de CADA firma del lote:
 * quién la decidió, cuándo, y contra qué dictamen. Sin esto, el log dice que la
 * plataforma firmó por el profesional y no dice bajo qué autoridad.
 */
const AUTORIZACION_SELLADO_DIFERIDO = {
  tipo: "decision_operativa",
  responsable: "Diego González (CEO)",
  fecha: "2026-08-07",
  dictamen: "docs/legal/2026-08-07-firma-electronica-hallazgo-y-remediacion.md",
  registro: "docs/legal/2026-08-07-sellado-diferido-documentos-historicos.md",
} as const;

/**
 * Devuelve la clave activa del profesional; si no tiene, la provisiona.
 * Que la clave se haya creado recién NO se oculta: viaja al log como
 * `clave_creada_para_sellado_diferido`.
 */
async function asegurarClavesActivas(medicoId: string): Promise<
  | { ok: true; claves: { id: string; clave_privada_enc: string }; creada: boolean }
  | { ok: false; error: string }
> {
  const supabase = createAdminClient();

  const leer = () =>
    supabase
      .from("medico_claves")
      .select("id, clave_privada_enc")
      .eq("medico_id", medicoId)
      .eq("activa", true)
      .maybeSingle();

  const { data: existente } = await leer();
  if (existente) return { ok: true, claves: existente, creada: false };

  try {
    await provisionarClaves(medicoId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "error provisionando claves" };
  }

  const { data: nueva } = await leer();
  if (!nueva) return { ok: false, error: "La clave se provisionó pero no se pudo leer" };
  return { ok: true, claves: nueva, creada: true };
}

/**
 * Aplica el sello de integridad diferido sobre UN documento histórico.
 * Idempotente por construcción: el guard `.is("firma_digital", null)` de
 * `sellarDocumento` impide re-sellar, y la evaluación previa saltea lo ya sellado.
 */
export async function sellarDocumentoDiferido(
  documentoId: string,
  opciones: OpcionesSelladoDiferido
): Promise<ResultadoSelladoDiferido> {
  const evaluacion = await evaluarInterna(documentoId);
  if (!evaluacion.apto) {
    return { ok: false, motivo: evaluacion.motivo, detalle: evaluacion.detalle };
  }

  const { doc, firmante } = evaluacion;

  const claves = await asegurarClavesActivas(doc.medico_id);
  if (!claves.ok) return { ok: false, motivo: "sin_claves", detalle: claves.error };

  // Identidad impresa congelada. LÍMITE DECLARADO, no simulado: se lee de las
  // tablas VIVAS de médicos y pacientes, que no tienen `updated_at`. No hay forma
  // de probar que el nombre o la obra social de hoy son los del día de la
  // emisión, así que el log lo dice (`identidad_verificada_contra_emision: false`)
  // en vez de aparentar lo contrario.
  const identidad = await construirIdentidadDocumento(doc.medico_id, doc.paciente_id);
  if (!identidad) {
    return {
      ok: false,
      motivo: "sin_identidad",
      detalle: "No se pudo congelar la identidad del documento",
    };
  }

  const contextoBase = await contextoDocumento(doc, {
    consulta_id: doc.consulta_id,
    turno_id: doc.turno_id,
  });

  const emitidoAt = doc.created_at;
  const diasEntre = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(emitidoAt)) / (24 * 60 * 60 * 1000))
  );

  const resultado = await sellarDocumento(
    doc,
    identidad,
    claves.claves,
    {
      metodo_atribucion: METODO_SELLADO_DIFERIDO,
      otp_id: null,
      // NO se inventa una IP: no hubo request del profesional. Quién ejecutó el
      // sello consta en `contexto.aplicado_por`.
      ip: null,
      user_agent: null,
      firmante: {
        ...firmante,
        habilitado_al_emitir: true,
        clave_creada_para_sellado_diferido: claves.creada,
      },
      contexto: {
        ...contextoBase,
        sellado_diferido: true,
        emitido_at: emitidoAt,
        dias_entre_emision_y_sellado: diasEntre,
        aplicado_por: "plataforma",
        // La constancia expresa. El profesional NO ejecutó un acto de firma en
        // este instante, y el registro lo dice con todas las letras.
        firmado_por_el_profesional_en_este_instante: false,
        acto_de_voluntad_original: {
          tipo: "emision_desde_sesion_autenticada",
          consulta_id: doc.consulta_id,
          turno_id: doc.turno_id,
          completada_at: contextoBase.completada_at ?? null,
        },
        motivo: "remediacion_falla_de_sellado_automatico",
        autorizacion: AUTORIZACION_SELLADO_DIFERIDO,
        lote_id: opciones.loteId,
        lote_total: opciones.loteTotal,
        identidad_origen: "datos_vigentes_al_sellado",
        identidad_verificada_contra_emision: false,
      },
    },
    // En `firma_digital` para que /verificar muestre las dos fechas sin leer el log.
    { sellado_diferido: true, emitido_at: emitidoAt }
  );

  if (!resultado.ok) return { ok: false, motivo: "error_sellado", detalle: resultado.error };

  return {
    ok: true,
    hash: resultado.hash,
    firmado_at: resultado.firmado_at,
    medico_id: doc.medico_id,
    clave_creada: claves.creada,
  };
}

// ─── Camino 4 — firma de lo rescatado del borrador ───────────────────────────
//
// QUÉ PASÓ CUANDO SE USA ESTE CAMINO: el profesional escribió el contenido
// clínico durante la consulta y Docto lo autoguardó en el borrador (cada PATCH
// del autoguardado verificó su sesión autenticada). Después la consulta se cerró
// SIN que tocara "Finalizar": se cortó internet, se cerró la sala de video, o la
// cerró un cron. Antes de esto, lo escrito moría en el borrador y el paciente no
// recibía nada.
//
// QUÉ CERTIFICA: que el contenido emitido es exactamente el que el profesional
// dejó escrito, que desde el sellado no cambió, y la atribución al profesional
// —sostenida en la redacción desde su sesión, no en un acto de cierre.
//
// QUÉ NO CERTIFICA, y el log lo dice con todas las letras
// (`confirmado_por_el_profesional_al_cerrar: false`): que el profesional haya
// revisado y confirmado el contenido antes de emitirse. No lo hizo — por eso el
// rescate SIEMPRE le avisa para que revise.
//
// Mismo motor, mismo log, misma identidad congelada que los otros caminos: lo
// único distinto es el nombre honesto de la atribución.

export type ContextoRescate = {
  /** Por qué camino se cerró el encuentro (cierre_origen del registro). */
  cierreOrigen: string;
  /** `updated_at` del borrador rescatado: cuándo escribió el profesional. */
  borradorActualizadoAt: string | null;
  /** Instante en que el sistema cerró el encuentro. */
  cerradoAt: string;
};

/**
 * Firma un documento emitido por el rescate automático del borrador.
 * El caller DEBE haber verificado que el documento corresponde a `medicoId`.
 */
export async function firmarDocumentoPorRescate(
  documentoId: string,
  medicoId: string,
  rescate: ContextoRescate
): Promise<FirmaResult> {
  const supabase = createAdminClient();

  const { data: doc } = await supabase
    .from("documentos")
    .select(COLUMNAS_FIRMABLES)
    .eq("id", documentoId)
    .single<DocFirmable & { firma_digital: unknown; consulta_id: string | null; turno_id: string | null }>();

  if (!doc) return { ok: false, error: "Documento no encontrado" };
  if (doc.medico_id !== medicoId) return { ok: false, error: "No autorizado" };
  if (doc.firma_digital) return { ok: false, error: "Documento ya firmado" };
  if (!esTipoFirmable(doc.tipo)) return { ok: false, error: `Tipo no firmable: ${doc.tipo}` };
  if (!doc.consulta_id && !doc.turno_id) {
    return { ok: false, error: "Documento sin consulta ni turno asociado" };
  }

  const firmante = await snapshotFirmante(medicoId);

  // Mismo gate de estado del firmante que el camino por sesión: la firma se
  // atribuye a la matrícula, y un profesional rechazado o suspendido no sigue
  // sellando con ella. Cuentas de test exentas de REFEPS (igual que el
  // constraint de DB).
  const habilitado =
    firmante.estado_registro === "aprobado" &&
    (firmante.refeps_validado === true || firmante.es_cuenta_test === true);
  if (!habilitado) {
    return { ok: false, error: "Profesional no habilitado para firmar" };
  }

  const { data: claves } = await supabase
    .from("medico_claves")
    .select("id, clave_privada_enc")
    .eq("medico_id", medicoId)
    .eq("activa", true)
    .maybeSingle();

  if (!claves) return { ok: false, error: "Médico sin claves de firma activas" };

  const identidad = await construirIdentidadDocumento(medicoId, doc.paciente_id);
  if (!identidad) {
    return { ok: false, error: "No se pudo congelar la identidad del documento" };
  }

  const contextoBase = await contextoDocumento(doc, {
    consulta_id: doc.consulta_id,
    turno_id: doc.turno_id,
  });

  return sellarDocumento(doc, identidad, claves, {
    metodo_atribucion: METODO_RESCATE_BORRADOR,
    otp_id: null,
    // No hubo request del profesional: no se inventa IP ni user-agent.
    ip: null,
    user_agent: null,
    firmante,
    contexto: {
      ...contextoBase,
      // Los dos campos que exige el CHECK de la migración 20260808.
      rescate_automatico: true,
      cierre_origen: rescate.cierreOrigen,
      // La constancia expresa de lo que NO pasó.
      confirmado_por_el_profesional_al_cerrar: false,
      acto_de_voluntad_original: {
        tipo: "redaccion_autoguardada_desde_sesion_autenticada",
        borrador_actualizado_at: rescate.borradorActualizadoAt,
      },
      cerrado_automaticamente_at: rescate.cerradoAt,
      motivo: "rescate_de_borrador_en_cierre_automatico",
      revision_del_profesional: "pendiente_notificada",
    },
  });
}

// ─── Snapshot del firmante y del contexto (checklist del dictamen) ────────────

/**
 * Snapshot del firmante al instante de firmar. NO es una FK: la matrícula, las
 * jurisdicciones y el estado REFEPS cambian, y la defensa necesita el estado
 * que existía cuando se firmó.
 */
async function snapshotFirmante(medicoId: string): Promise<Record<string, unknown>> {
  const supabase = createAdminClient();

  // Service role: `medicos` tiene columnas sin GRANT para authenticated.
  const { data: medico } = await supabase
    .from("medicos")
    .select(
      "id, user_id, nombre_completo, especialidad, tipo_matricula, numero_matricula, jurisdicciones, refeps_validado, refeps_validado_at, identidad_validada, identidad_validada_at, didit_session_id, didit_status, es_cuenta_test, estado_registro"
    )
    .eq("id", medicoId)
    .single();

  if (!medico) return { medico_id: medicoId, snapshot_incompleto: true };

  // Aceptación de T&C del médico: es donde consta que su click constituye su
  // firma electrónica. HOY NO EXISTE — verificado en producción 07/08/2026:
  // `aceptaciones_legales` solo tiene filas `datos_sensibles` (1.108), ningún
  // camino de la app inserta `tyc_medico` y `versiones_textos_legales` no tiene
  // esa versión. O sea: este bloque va a devolver `null` en el 100% de las
  // firmas hasta que exista el texto y el punto de aceptación.
  //
  // Es una decisión de producto/legal pendiente de Diego, no un olvido: sin ese
  // consentimiento documentado la atribución por sesión es más débil (dictamen
  // 07/08/2026, punto 3). Mientras no exista, el log registra la constancia
  // explícita de que no existe MÁS las aceptaciones que el médico sí firmó, para
  // que la defensa no arranque de cero.
  let tycMedico: Record<string, unknown> | null = null;
  let aceptacionesRegistradas: { tipo: string; aceptado_at: string }[] = [];
  if (medico.user_id) {
    const { data: todas } = await supabase
      .from("aceptaciones_legales")
      .select("id, tipo, version_id, created_at, ip_address, user_agent")
      .eq("user_id", medico.user_id)
      .order("created_at", { ascending: false })
      .limit(20);

    aceptacionesRegistradas = (todas ?? []).map((a) => ({
      tipo: a.tipo as string,
      aceptado_at: a.created_at as string,
    }));

    const aceptacion = (todas ?? []).find((a) => a.tipo === "tyc_medico");

    if (aceptacion) {
      const { data: version } = await supabase
        .from("versiones_textos_legales")
        .select("version, hash_sha256")
        .eq("id", aceptacion.version_id)
        .maybeSingle();

      tycMedico = {
        aceptacion_id: aceptacion.id,
        version_id: aceptacion.version_id,
        version: version?.version ?? null,
        hash_texto: version?.hash_sha256 ?? null,
        aceptado_at: aceptacion.created_at,
        ip: aceptacion.ip_address ?? null,
        user_agent: aceptacion.user_agent ?? null,
      };
    }
  }

  return {
    medico_id: medico.id,
    user_id: medico.user_id ?? null,
    nombre_completo: medico.nombre_completo ?? null,
    especialidad: medico.especialidad ?? null,
    tipo_matricula: medico.tipo_matricula ?? null,
    numero_matricula: medico.numero_matricula ?? null,
    jurisdicciones: medico.jurisdicciones ?? [],
    refeps_validado: medico.refeps_validado ?? false,
    refeps_validado_at: medico.refeps_validado_at ?? null,
    identidad_validada: medico.identidad_validada ?? false,
    identidad_validada_at: medico.identidad_validada_at ?? null,
    didit_session_id: medico.didit_session_id ?? null,
    didit_status: medico.didit_status ?? null,
    // Estado de la ficha AL MOMENTO DE SELLAR: es lo que habilita el sellado
    // diferido (aprobado + REFEPS validado). Se consultaba pero no se devolvía,
    // así que el gate lo leía como `undefined` y descartaba TODOS los documentos.
    estado_registro: medico.estado_registro ?? null,
    es_cuenta_test: medico.es_cuenta_test ?? false,
    tyc_medico: tycMedico,
    tyc_medico_registrada: tycMedico !== null,
    // Qué SÍ aceptó el médico, aunque no exista todavía el T&C específico de firma.
    aceptaciones_registradas: aceptacionesRegistradas,
  };
}

/**
 * Circunstancias del acto: qué documento, de qué evento clínico, cerrado cuándo.
 */
async function contextoDocumento(
  doc: DocFirmable,
  ancla: { consulta_id: string | null; turno_id: string | null }
): Promise<Record<string, unknown>> {
  const supabase = createAdminClient();
  const esTurno = !!ancla.turno_id;

  let completadaAt: string | null = null;
  const anclaId = ancla.turno_id ?? ancla.consulta_id;
  if (anclaId) {
    const { data: registro } = await supabase
      .from(esTurno ? "turnos" : "consultas")
      .select("completada_at")
      .eq("id", anclaId)
      .maybeSingle();
    completadaAt = registro?.completada_at ?? null;
  }

  return {
    canal: esTurno ? "turno" : "consulta",
    consulta_id: ancla.consulta_id,
    turno_id: ancla.turno_id,
    completada_at: completadaAt,
    documento_tipo: doc.tipo,
    documento_created_at: doc.created_at,
    paciente_id: doc.paciente_id,
  };
}

// ─── Verificación ─────────────────────────────────────────────────────────────

export type EstadoVerificacion =
  /** No existe un documento con ese id. */
  | "no_encontrado"
  /** Existe, pero nunca se le aplicó sello electrónico. NO es "inválido". */
  | "sin_sello"
  /** Tiene sello y el contenido coincide: firma verificada. */
  | "verificada"
  /** Tiene sello pero el contenido cambió después de firmarse. */
  | "alterada"
  /** Tiene sello pero la firma no verifica contra la clave del médico. */
  | "invalida";

export type VerificacionDocumento = {
  estado: EstadoVerificacion;
  medico_id: string | null;
  /**
   * Fecha de EMISIÓN del documento (`documentos.created_at`). La página pública
   * muestra siempre las dos fechas —emisión y sello— también cuando coinciden:
   * así el sellado diferido no es un caso especial que salta a la vista, y que
   * en el caso normal coincidan es la mejor prueba de que Docto no juega con las
   * fechas.
   */
  emitido_at: string | null;
  /** El sello se aplicó DESPUÉS de la emisión (ver camino 3). */
  sellado_diferido: boolean;
  datos: {
    hash_original: string;
    hash_actual: string;
    algoritmo: string;
    firmado_at: string;
    metodo_atribucion: string | null;
  } | null;
  /**
   * Firmante TAL COMO QUEDÓ CONGELADO en la firma. La página pública lo prefiere
   * a la fila viva de `medicos`: si el médico se cambió el nombre después, el
   * documento y la verificación tienen que seguir diciendo lo mismo.
   */
  firmante: { nombre: string; especialidad: string; matricula: string } | null;
};

/**
 * Verifica el sello de un documento de la tabla `documentos`.
 * Distingue explícitamente "sin sello" de "firma no válida": un documento
 * emitido antes del sellado automático es legítimo, no sospechoso.
 */
export async function verificarDocumento(documentoId: string): Promise<VerificacionDocumento> {
  const supabase = createAdminClient();

  const { data: doc } = await supabase
    .from("documentos")
    .select(COLUMNAS_FIRMABLES)
    .eq("id", documentoId)
    .maybeSingle<DocFirmable & { firma_digital: unknown }>();

  if (!doc) {
    return {
      estado: "no_encontrado",
      medico_id: null,
      emitido_at: null,
      sellado_diferido: false,
      datos: null,
      firmante: null,
    };
  }
  if (!doc.firma_digital) {
    return {
      estado: "sin_sello",
      medico_id: doc.medico_id,
      emitido_at: doc.created_at,
      sellado_diferido: false,
      datos: null,
      firmante: null,
    };
  }

  const fd = doc.firma_digital as {
    hash: string;
    firma: string;
    algoritmo: string;
    firmado_at: string;
    medico_id: string;
    metodo_atribucion?: string;
    clave_id?: string;
    identidad?: unknown;
  };

  // Snapshot congelado: entra al hash, así que si alguien lo edita en la base
  // el recálculo no reproduce la firma y el estado pasa a "alterada".
  const identidad = identidadDesdeJSONB(fd.identidad);
  // El nombre sale ya con el tratamiento que el profesional eligió, igual que en
  // el PDF: la página pública de verificación y el papel tienen que decir lo
  // MISMO, y hasta hoy la página mostraba el nombre pelado. El título sale del
  // snapshot congelado (solo v:2); un documento v:1 no lo tiene guardado y se
  // muestra sin él — no se inventa un tratamiento sobre algo ya firmado.
  const firmante = identidad
    ? {
        nombre: formatNombreMedico(identidad.medico_nombre, identidad.medico_titulo ?? null),
        especialidad: identidad.medico_especialidad,
        matricula: identidad.medico_matricula,
      }
    : null;

  // Clave que firmó: la del log (clave_id), con fallback a la registrada en la
  // propia firma y, por último, a la última clave conocida del médico.
  const { data: log } = await supabase
    .from("firma_logs")
    .select("clave_id")
    .eq("documento_id", documentoId)
    .limit(1)
    .maybeSingle();

  const claveIdBuscada = log?.clave_id ?? fd.clave_id ?? null;
  let clavePublica: string | null = null;

  if (claveIdBuscada) {
    const { data: c } = await supabase
      .from("medico_claves")
      .select("clave_publica")
      .eq("id", claveIdBuscada)
      .maybeSingle();
    clavePublica = c?.clave_publica ?? null;
  }
  if (!clavePublica) {
    const { data: c } = await supabase
      .from("medico_claves")
      .select("clave_publica")
      .eq("medico_id", fd.medico_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    clavePublica = c?.clave_publica ?? null;
  }

  const hashActual = hashSHA256(canonicalJSON(contenidoFirmable(doc, identidad)));
  const alterada = hashActual !== fd.hash;

  const datos = {
    hash_original: fd.hash,
    hash_actual: hashActual,
    algoritmo: fd.algoritmo,
    firmado_at: fd.firmado_at,
    metodo_atribucion: fd.metodo_atribucion ?? null,
  };

  // La emisión sale de la fila, no de la firma: es un dato del documento, y así
  // no depende de que el jsonb lo repita.
  const comun = {
    medico_id: fd.medico_id,
    emitido_at: doc.created_at,
    sellado_diferido: fd.metodo_atribucion === METODO_SELLADO_DIFERIDO,
    datos,
    firmante,
  };

  if (!clavePublica) {
    // Hay sello pero no podemos recuperar la clave: no afirmamos validez.
    return { estado: "invalida", ...comun };
  }

  if (alterada) return { estado: "alterada", ...comun };

  let firmaValida = false;
  try {
    firmaValida = verificar(fd.hash, fd.firma, clavePublica);
  } catch {
    firmaValida = false;
  }

  return { estado: firmaValida ? "verificada" : "invalida", ...comun };
}

type VerificacionResult = {
  valida: boolean;
  alterada: boolean;
  datos: {
    hash_original: string;
    hash_actual: string;
    algoritmo: string;
    firmado_at: string;
    medico_id: string;
  } | null;
};

/** @deprecated Usar `verificarDocumento`, que distingue "sin sello" de "inválida". */
export async function verificarFirmaDocumento(documentoId: string): Promise<VerificacionResult> {
  const r = await verificarDocumento(documentoId);
  if (!r.datos || !r.medico_id) return { valida: false, alterada: false, datos: null };
  return {
    valida: r.estado === "verificada",
    alterada: r.estado === "alterada",
    datos: { ...r.datos, medico_id: r.medico_id },
  };
}
