// ─── ¿Este profesional puede cobrar? — fuente de verdad única ────────────────
//
// `estado` SOLO no alcanza y esto ya costó caro: la columna pasa a 'expirado'
// recién DENTRO del checkout (`api/pago/crear-v2`), o sea cuando un paciente ya
// pidió la consulta y está por pagar. Hasta ese momento un permiso vencido
// figura 'activo'.
//
// Con esa media verdad, el panel de admin pintaba en verde justo al profesional
// que no podía cobrar, y el gate de disponibilidad lo dejaba publicarse. La
// pantalla del propio profesional (`medico/perfil/TabCobros`) sí miraba la
// fecha — o sea que la regla correcta ya existía, escrita en un solo lado y
// sin que los otros dos la usaran. Acá queda una vez.

export type EstadoCuentaMp = "no_conectado" | "conectado" | "expirado";

export interface CuentaMpMinima {
  estado?: string | null;
  expires_at?: string | null;
}

/**
 * - `no_conectado`: no hay cuenta, o el profesional revocó la autorización
 *   desde Mercado Pago (un refresh no la resucita: tiene que reconectar).
 * - `conectado`: activa Y con el permiso vigente. Lo único que cobra.
 * - `expirado`: hay cuenta, pero hoy no cobra. Se recupera renovando.
 */
export function estadoCuentaMp(cuenta: CuentaMpMinima | null | undefined): EstadoCuentaMp {
  if (!cuenta || cuenta.estado === "revocado") return "no_conectado";
  if (cuenta.estado === "activo" && cuenta.expires_at && new Date(cuenta.expires_at).getTime() > Date.now()) {
    return "conectado";
  }
  return "expirado";
}
