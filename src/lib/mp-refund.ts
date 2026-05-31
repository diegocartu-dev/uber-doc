/**
 * Refund aislado contra la API de Mercado Pago (Ola 2 — ticket 2A).
 *
 * Ejecuta `POST /v1/payments/{paymentId}/refunds` con el token del collector.
 * En el flujo real de Docto el collector es el MÉDICO (el pago va directo a su
 * cuenta vía Checkout Pro con marketplace_fee), por lo que el `accessToken` que
 * se pasa acá debe ser el token OAuth del médico desencriptado con
 * `decrypt(mpAccount.access_token_encrypted)` (ver `mp-crypto.ts`).
 *
 * Esta función NO decide a quién refundear ni consulta la DB: recibe el
 * paymentId y el token ya resueltos. Eso la hace testeable sola y deja el
 * cableado a `cancelaciones.ts` para el ticket 2B.
 *
 * El caso de saldo insuficiente del médico (sección 2.2 de la política) se
 * DETECTA y se devuelve tipado, pero el flujo de cobertura (transferencia CVU
 * + deuda) es responsabilidad del ticket 2C — acá no se cubre nada.
 */

const MP_API = "https://api.mercadopago.com";

export interface RefundOptions {
  /**
   * Monto a refundear para un refund PARCIAL. Si se omite, MP hace un refund
   * TOTAL del pago (revierte el monto completo y el marketplace_fee asociado).
   */
  amount?: number;
  /**
   * Clave de idempotencia. MP la usa para no duplicar el refund si el request
   * se reintenta (timeout de red, reintento del cron de la sección 2.2). Si no
   * se pasa, se genera una. En producción conviene pasar una clave estable y
   * derivada del refund lógico (ej. `refund:{tipo}:{recursoId}`) para que el
   * reintento sea verdaderamente idempotente.
   */
  idempotencyKey?: string;
}

export type RefundResult =
  | {
      ok: true;
      status: number;
      refundId: string;
      /** Monto efectivamente refundado según MP. */
      amount: number;
      /** Respuesta cruda de MP, para auditoría/logging. */
      raw: unknown;
    }
  | {
      ok: false;
      status: number;
      /** Mensaje legible del error. */
      error: string;
      /**
       * `true` cuando MP rechaza el refund porque el collector (médico) no tiene
       * saldo suficiente. Dispara el flujo edge de la política (sección 2.2),
       * que NO vive en esta función.
       */
      insufficientFunds: boolean;
      /** Respuesta cruda de MP. */
      raw: unknown;
    };

/**
 * Heurística para detectar el rechazo por saldo insuficiente del collector.
 *
 * MP devuelve los errores de negocio del refund como `400` con un array
 * `cause: [{ code, description }]`. No pudimos provocar el caso de saldo
 * insuficiente en sandbox (el collector de test siempre tiene saldo), así que
 * la detección matchea tanto el texto como los códigos numéricos conocidos.
 *
 * Códigos observados empíricamente en sandbox (ticket 2A):
 *   - 2017 "Invalid transaction_amount for update"  → over-refund / monto
 *     inválido. NO es saldo insuficiente (lo excluimos abajo).
 *
 * Código de saldo insuficiente: MP no lo documenta de forma estable para la
 * API de refunds de marketplace y no se pudo reproducir en sandbox. Se deja la
 * detección por texto + se centraliza acá para ajustar el código exacto cuando
 * 2B/3B lo observen en producción (un médico real sin saldo). Mientras tanto,
 * el flujo edge (cobertura CVU + deuda) es 2C/3B, no esta función.
 */
function isInsufficientFunds(status: number, body: unknown): boolean {
  if (status !== 400) {
    // El saldo insuficiente se manifiesta como un 400 de negocio, no como 401
    // (token) ni 404 (pago inexistente).
    return false;
  }
  const causeCodes = extractCauseCodes(body);
  // 2017 = monto inválido / over-refund, explícitamente NO es saldo insuficiente.
  if (causeCodes.includes(2017)) return false;

  const haystack = JSON.stringify(body ?? {}).toLowerCase();
  return (
    haystack.includes("insufficient") ||
    haystack.includes("saldo") ||
    haystack.includes("not enough") ||
    haystack.includes("collector_balance")
  );
}

/** Extrae los `code` numéricos del array `cause` de un error de MP. */
function extractCauseCodes(body: unknown): number[] {
  if (!body || typeof body !== "object") return [];
  const cause = (body as Record<string, unknown>).cause;
  if (!Array.isArray(cause)) return [];
  return cause
    .map((c) => (c && typeof c === "object" ? (c as Record<string, unknown>).code : undefined))
    .filter((c): c is number => typeof c === "number");
}

function extractError(body: unknown): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.message === "string" && b.message) return b.message;
    if (typeof b.error === "string" && b.error) return b.error;
  }
  return "Mercado Pago rechazó el refund.";
}

/**
 * Ejecuta un refund (total o parcial) sobre un pago de MP.
 *
 * @param paymentId   ID del pago de MP a refundear (el `pago_id` que el webhook
 *                    guarda en `consultas`/`turnos`).
 * @param accessToken Token del collector (médico) ya desencriptado.
 * @param opts        `amount` para refund parcial; `idempotencyKey` para dedupe.
 */
export async function refundPayment(
  paymentId: string,
  accessToken: string,
  opts: RefundOptions = {}
): Promise<RefundResult> {
  if (!paymentId) {
    return { ok: false, status: 0, error: "paymentId requerido.", insufficientFunds: false, raw: null };
  }
  if (!accessToken) {
    return { ok: false, status: 0, error: "accessToken requerido.", insufficientFunds: false, raw: null };
  }

  const idempotencyKey = opts.idempotencyKey ?? crypto.randomUUID();

  // Refund total → MP exige body vacío (NO `{}` ni `{amount:null}`).
  // Refund parcial → body `{ amount }`.
  const hasAmount = typeof opts.amount === "number" && opts.amount > 0;

  let res: Response;
  try {
    res = await fetch(`${MP_API}/v1/payments/${paymentId}/refunds`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-Idempotency-Key": idempotencyKey,
      },
      ...(hasAmount ? { body: JSON.stringify({ amount: opts.amount }) } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, error: `Error de red llamando a MP: ${message}`, insufficientFunds: false, raw: null };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = { raw: "non-json response" };
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: extractError(body),
      insufficientFunds: isInsufficientFunds(res.status, body),
      raw: body,
    };
  }

  const b = (body ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    status: res.status,
    refundId: String(b.id ?? ""),
    amount: typeof b.amount === "number" ? b.amount : NaN,
    raw: body,
  };
}

export interface PaymentState {
  ok: boolean;
  /** Estado MP del pago: `approved`, `refunded`, `partially_refunded`, etc. */
  status?: string;
  /** Monto total del pago (`transaction_amount`). */
  transactionAmount?: number;
  /** Monto ya refundeado acumulado (`transaction_amount_refunded`). */
  amountRefunded?: number;
  error?: string;
}

/**
 * Consulta el estado real de un pago en MP (`GET /v1/payments/{id}`).
 *
 * Es la FUENTE DE VERDAD para decidir si un refund ya se aplicó, sin depender de
 * la cache de idempotencia de MP (cuyo TTL no está garantizado ≥24h). El cron de
 * reintentos la usa ANTES de reintentar o escalar: si el pago ya está refundeado,
 * resuelve en vez de re-ejecutar (evita over-refund → deuda fantasma, hallazgo
 * C1 de la auditoría 3B).
 *
 * Se consulta con el token del collector (médico), bajo cuya cuenta vive el pago.
 */
export async function getPaymentState(
  paymentId: string,
  accessToken: string
): Promise<PaymentState> {
  if (!paymentId || !accessToken) {
    return { ok: false, error: "paymentId y accessToken requeridos." };
  }

  let res: Response;
  try {
    res = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Error de red consultando el pago: ${message}` };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    return { ok: false, error: extractError(body) };
  }

  const b = (body ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    status: typeof b.status === "string" ? b.status : undefined,
    transactionAmount: typeof b.transaction_amount === "number" ? b.transaction_amount : undefined,
    amountRefunded: typeof b.transaction_amount_refunded === "number" ? b.transaction_amount_refunded : 0,
  };
}

// ===========================================================================
// Reversión del application_fee — regla "nadie gana, nadie pierde" (Diego)
// ===========================================================================
//
// CONTEXTO DE NEGOCIO
// El paciente debe recuperar el 100% del monto. Ese 100% está repartido en DOS
// cuentas de MP por el split de Checkout Pro (`marketplace_fee` en crear-v2):
//   - el NETO del médico (monto − fee) quedó en la cuenta del MÉDICO (collector),
//   - el FEE (la comisión de Docto) se liberó a la cuenta de DOCTO (marketplace).
// Para que nadie gane ni pierda, cada cuenta tiene que devolver SU parte.
//
// HALLAZGO EMPÍRICO (sandbox MP, ticket 2A/2A-ext, 2026-05-31)
// La API de refunds de MP NO sabe revertir el application_fee:
//   - `POST /v1/payments/{id}/refunds` solo acepta `{ amount }` (confirmado por
//     el SDK oficial `CreateRefundBody` y por tests: `refund_application_fee`,
//     `application_fee`, `refund_fee` → 400 code 8 "wrong parameter").
//   - No existe endpoint dedicado: `/refunds/application_fee` y
//     `/application_fee/refund` → 404 "resource not found".
//   - Tras CUALQUIER refund (total o parcial) el `application_fee` permanece
//     intacto en `fee_details`: MP nunca lo revierte solo.
// Conclusión: el fee no se "revierte" con un flag. Hay que devolverlo
// explícitamente con un SEGUNDO refund hecho con el token de la cuenta que lo
// recibió (Docto). MP permite múltiples refunds parciales sobre el mismo pago,
// con distinto token, que sumen el total; cada uno debita de su propia cuenta y
// acredita al payer (verificado: dos parciales 3000 + 27000 → `refunded` total).
//
// MECÁNICA (dos llamadas, orden importa — ver `refundConReversionDeFee`)
//   1) Refund del NETO del médico con el token del MÉDICO (collector).
//   2) Refund del FEE con el token de DOCTO (marketplace, `MP_ACCESS_TOKEN`).
// Resultado: payer recibe neto + fee = 100%; médico debita su neto; Docto debita
// su comisión. Neto del juego: cero para todos.
//
// LÍMITE DE VALIDACIÓN: en sandbox el collector y el receptor del fee son la
// MISMA cuenta de test (no se pueden crear pagos con split entre cuentas
// separadas vía API headless — requiere Checkout Pro en browser). Por eso la
// SEPARACIÓN real de débito (médico vs Docto) queda pendiente de validar en
// Preview con cuentas separadas. La mecánica de dos refunds parciales que suman
// el total SÍ está probada en sandbox.

export interface ReversionFeeParams {
  /** ID del pago de MP a reembolsar (el `pago_id` guardado por el webhook). */
  paymentId: string;
  /** Token del MÉDICO (collector) ya desencriptado. Debita su neto. */
  tokenMedico: string;
  /** Token de DOCTO (marketplace, `MP_ACCESS_TOKEN`). Devuelve la comisión. */
  tokenDocto: string;
  /**
   * Comisión que cobró Docto (el `application_fee` del pago). Se persiste en
   * `consultas.mp_application_fee` / `turnos.mp_application_fee` por el webhook.
   */
  applicationFee: number;
  /**
   * Neto que cobró el médico (`monto − applicationFee`). Se persiste en
   * `mp_net_amount_medico`. Si se omite, debe pasarse `montoTotal` para derivarlo.
   */
  netoMedico?: number;
  /** Monto total del pago. Requerido si no se pasa `netoMedico`. */
  montoTotal?: number;
  /**
   * Prefijo para las claves de idempotencia. Debe ser ESTABLE por refund lógico
   * (ej. `refund:consulta:{id}`) para que un reintento no duplique ninguna pata.
   * Cada pata usa un sufijo distinto (`:medico` / `:docto`).
   */
  idempotencyPrefix: string;
}

export interface ReversionFeeResult {
  /** `true` solo si AMBAS patas se completaron. */
  ok: boolean;
  /** Refund del neto del médico (pata 1). */
  refundMedico: RefundResult;
  /**
   * Refund del fee de Docto (pata 2). `null` si la pata 1 falló y no se intentó
   * (no tiene sentido devolver el fee si el médico no devolvió su parte).
   */
  refundDocto: RefundResult | null;
  /** Monto efectivamente acreditado al payer entre ambas patas. */
  netoDevueltoAlPaciente: number;
  /**
   * `true` cuando la pata del médico se completó pero la de Docto falló: el
   * paciente recibió SOLO el neto, falta el fee. Estado inconsistente que el
   * llamador (2B / admin) debe reintentar reusando el MISMO `idempotencyPrefix`
   * — la idempotencia garantiza que la pata del médico no se vuelve a ejecutar.
   */
  feePendiente: boolean;
}

/**
 * Reembolso completo con reversión explícita del application_fee.
 *
 * Cumple la regla "nadie gana, nadie pierde": el paciente recupera el 100%,
 * compuesto por el neto que debita el médico + el fee que devuelve Docto.
 *
 * Orden deliberado — primero el médico, después Docto:
 *  - La pata del médico es la grande y la más propensa a fallar por saldo
 *    insuficiente (sección 2.2 de la política). Si falla, NO se toca a Docto:
 *    no tiene sentido que Docto devuelva su comisión si el grueso del reembolso
 *    no salió. El llamador deriva al flujo edge (cobertura CVU) con el médico
 *    como deudor del total, no del neto.
 *  - Si la del médico sale pero la de Docto falla, queda `feePendiente: true`:
 *    el paciente ya tiene su neto, solo falta el fee. Reintentable sin riesgo
 *    de doble débito gracias a la idempotencia por clave estable.
 *
 * NO es atómico (MP no ofrece transacción multi-cuenta). La atomicidad se
 * emula con idempotencia + reintento del llamador, no con rollback.
 */
export async function refundConReversionDeFee(
  params: ReversionFeeParams
): Promise<ReversionFeeResult> {
  const { paymentId, tokenMedico, tokenDocto, applicationFee, idempotencyPrefix } = params;

  const netoMedico =
    typeof params.netoMedico === "number"
      ? params.netoMedico
      : typeof params.montoTotal === "number"
        ? Math.round((params.montoTotal - applicationFee) * 100) / 100
        : NaN;

  const errBase = (error: string): ReversionFeeResult => ({
    ok: false,
    refundMedico: { ok: false, status: 0, error, insufficientFunds: false, raw: null },
    refundDocto: null,
    netoDevueltoAlPaciente: 0,
    feePendiente: false,
  });

  if (!Number.isFinite(netoMedico) || netoMedico <= 0) {
    return errBase("netoMedico inválido: pasá netoMedico o montoTotal junto con applicationFee.");
  }
  if (!Number.isFinite(applicationFee) || applicationFee <= 0) {
    return errBase("applicationFee inválido: debe ser > 0 para revertir la comisión de Docto.");
  }

  // ---- Pata 1: el médico devuelve su neto (token del médico) ----
  const refundMedico = await refundPayment(paymentId, tokenMedico, {
    amount: netoMedico,
    idempotencyKey: `${idempotencyPrefix}:medico`,
  });

  if (!refundMedico.ok) {
    // No se intenta la de Docto: el reembolso grueso no salió.
    return {
      ok: false,
      refundMedico,
      refundDocto: null,
      netoDevueltoAlPaciente: 0,
      feePendiente: false,
    };
  }

  // ---- Pata 2: Docto devuelve la comisión (token del marketplace) ----
  const refundDocto = await refundPayment(paymentId, tokenDocto, {
    amount: applicationFee,
    idempotencyKey: `${idempotencyPrefix}:docto`,
  });

  const netoDevueltoAlPaciente =
    (Number.isFinite(refundMedico.amount) ? refundMedico.amount : 0) +
    (refundDocto.ok && Number.isFinite(refundDocto.amount) ? refundDocto.amount : 0);

  return {
    ok: refundDocto.ok,
    refundMedico,
    refundDocto,
    netoDevueltoAlPaciente,
    feePendiente: !refundDocto.ok,
  };
}
