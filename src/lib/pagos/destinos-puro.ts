// Lo puro de los destinos de pago: tipos, validación y etiquetas. Sin base ni
// servidor, así lo usan el cliente (el formulario del paciente) y las pruebas.
// Lo que toca la base vive en ./destinos.ts.

export type TipoDestino = "mp_email" | "alias" | "cvu" | "cbu";
export type RolDestino = "medico" | "paciente";
export type OrigenDestino = "oauth_mp" | "declarado" | "admin";

export interface Destino {
  id: string;
  user_id: string;
  rol: RolDestino;
  tipo: TipoDestino;
  valor: string;
  origen: OrigenDestino;
  usable_desde: string;
  verificado_en: string | null;
  created_at: string;
}

/** Horas de espera antes de poder pagar a un destino declarado que reemplaza a otro. */
export const HORAS_ESPERA_CAMBIO = 24;

// ── Validación de lo que escribe una persona ────────────────────────────────

/**
 * Dígitos verificadores de un CBU (y de un CVU, que usa el mismo esquema):
 * bloque 1 = 7 dígitos + verificador (pesos 7,1,3,9,7,1,3);
 * bloque 2 = 13 dígitos + verificador (pesos 3,9,7,1,3,9,7,1,3,9,7,1,3);
 * verificador = (10 − suma mod 10) mod 10.
 * Un error de tipeo en un dígito falla acá en vez de ir a otra cuenta.
 */
export function cbuValido(cbu: string): boolean {
  if (!/^\d{22}$/.test(cbu)) return false;
  const d = cbu.split("").map(Number);
  const verificador = (digitos: number[], pesos: number[]) => {
    const suma = digitos.reduce((acc, x, i) => acc + x * pesos[i], 0);
    return (10 - (suma % 10)) % 10;
  };
  const ok1 = verificador(d.slice(0, 7), [7, 1, 3, 9, 7, 1, 3]) === d[7];
  const ok2 = verificador(d.slice(8, 21), [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3]) === d[21];
  return ok1 && ok2;
}

export type DestinoDeclarado = { tipo: "alias" | "cvu" | "cbu"; valor: string };

/**
 * Normaliza lo que tipeó la persona. Acepta un alias (6 a 20 caracteres:
 * letras, números, punto y guion; se guarda en minúsculas) o 22 dígitos con
 * verificadores correctos (CVU si arranca en 000, CBU si no). Devuelve el
 * error en castellano, para mostrar tal cual.
 */
export function normalizarDestinoDeclarado(entrada: string): { ok: true; destino: DestinoDeclarado } | { ok: false; error: string } {
  const limpio = (entrada ?? "").trim();
  if (!limpio) return { ok: false, error: "Escribí un alias o un CVU/CBU." };
  const soloDigitos = limpio.replace(/[\s-]/g, "");
  if (/^\d+$/.test(soloDigitos)) {
    if (soloDigitos.length !== 22) return { ok: false, error: "Un CVU o CBU tiene 22 dígitos. Si es un alias, lleva letras." };
    if (!cbuValido(soloDigitos)) return { ok: false, error: "Ese CVU/CBU tiene un dígito mal. Revisalo." };
    return { ok: true, destino: { tipo: soloDigitos.startsWith("000") ? "cvu" : "cbu", valor: soloDigitos } };
  }
  const alias = limpio.toLowerCase();
  if (!/^[a-z0-9.\-]{6,20}$/.test(alias)) {
    return { ok: false, error: "Un alias tiene entre 6 y 20 caracteres: letras, números, punto o guion." };
  }
  return { ok: true, destino: { tipo: "alias", valor: alias } };
}

/**
 * Desde cuándo se puede pagar al destino nuevo. El primero, y todo lo que viene
 * de Mercado Pago o del admin, vale ya. Un destino declarado que reemplaza a
 * otro queda bloqueado 24 h: el panel de admin lo muestra como no transferible
 * y el cambio se avisa por mail; si alguien entró a la cuenta de un paciente y
 * cambió el alias, hay un día para que el aviso llegue antes de que salga plata.
 */
export function usableDesde(args: { reemplaza: boolean; origen: OrigenDestino; ahora: Date }): Date {
  if (!args.reemplaza || args.origen !== "declarado") return args.ahora;
  return new Date(args.ahora.getTime() + HORAS_ESPERA_CAMBIO * 60 * 60 * 1000);
}

/** Cómo se muestra un destino en pantalla, sin decir de más. */
export function etiquetaDestino(d: Pick<Destino, "tipo" | "valor">): string {
  switch (d.tipo) {
    case "mp_email":
      return `Cuenta de Mercado Pago (${d.valor})`;
    case "alias":
      return `Alias ${d.valor}`;
    case "cvu":
      return `CVU ${d.valor}`;
    case "cbu":
      return `CBU ${d.valor}`;
  }
}
