/**
 * Estado de pago de una consulta inmediata, visto desde el paciente.
 *
 * POR QUÉ EXISTE (caso real 07/08): las pantallas del paciente agrupaban
 * "aceptada" (el médico aceptó, el paciente TODAVÍA NO PAGÓ) junto con "pagada"
 * y "en_curso" en una sola variable `aceptada`. Con la consulta impaga la
 * pantalla decía "Esperando que el médico inicie la videollamada…" — o sea, le
 * pedía esperar cuando el sistema la estaba esperando A ELLA. Una paciente se
 * quedó veinte minutos ahí, intentando pagar tres veces.
 *
 * La regla es una sola y vive acá para que las dos pantallas no vuelvan a
 * divergir.
 *
 * Estados de MP que valen como "el pago ya está en camino, NO le pidas que
 * pague de nuevo": `pending` (cupón Rapipago / Pago Fácil), `in_process`
 * (revisión de MP) y `authorized` (tarjeta autorizada sin capturar). Los
 * persiste el webhook (`handleStatusOnly`).
 */

export const MP_ESTADOS_EN_CAMINO = ["pending", "in_process", "authorized"] as const;

export type EstadoPagoPaciente =
  /** Nadie pagó nada: hay que pedirle el pago, con todas las letras. */
  | "falta_pagar"
  /** MP tiene el pago pero todavía no lo acreditó: esperar es correcto acá. */
  | "en_camino"
  /** Pago confirmado: recién acá corresponde "esperá a que el médico llame". */
  | "confirmado";

/**
 * @param estado    `consultas.estado` ("esperando" | "aceptada" | "pagada" | "en_curso" | …)
 * @param mpStatus  `consultas.mp_status` (lo escribe el webhook de Mercado Pago; NULL si nunca hubo pago)
 *
 * Ojo: para consultas inmediatas el webhook de un pago aprobado salta directo a
 * `en_curso` (no a `pagada`); `pagada` la deja la simulación de cuentas de test.
 * Miramos `mp_status === "approved"` además del estado para no tratar como
 * impaga una consulta ya pagada cuyo estado todavía no cambió.
 */
export function estadoPagoConsulta(
  estado: string | null | undefined,
  mpStatus: string | null | undefined
): EstadoPagoPaciente {
  if (estado === "pagada" || estado === "en_curso" || estado === "completada") return "confirmado";
  if (mpStatus === "approved") return "confirmado";
  if (MP_ESTADOS_EN_CAMINO.includes(mpStatus as (typeof MP_ESTADOS_EN_CAMINO)[number])) {
    return "en_camino";
  }
  return "falta_pagar";
}
