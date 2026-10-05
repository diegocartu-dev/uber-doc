// Lo que Mercado Pago necesita saber del pagador para NO rechazar.
//
// Hallazgo 05/10/2026: casi todos los pagos rechazados de los últimos dos meses
// fueron `cc_rejected_high_risk` — el antifraude de Mercado Pago, no la
// tarjeta. Pacientes que intentaron tres y cinco veces, con débito y crédito,
// y se fueron. Nuestra preferencia no mandaba ningún dato del pagador (nombre,
// documento, mail, teléfono), ni categoría del ítem, ni descriptor: justo lo
// que Mercado Pago documenta como insumo de su modelo de riesgo ("Mejorá la
// aprobación de tus pagos"). Este archivo arma esa parte de la preferencia.
// Es puro para poder probarlo.

export interface DatosPagador {
  email: string | null | undefined;
  nombre?: string | null;
  apellido?: string | null;
  nombre_completo?: string | null;
  dni?: string | null;
  telefono?: string | null;
}

export interface PagadorMp {
  email?: string;
  name?: string;
  surname?: string;
  identification?: { type: "DNI"; number: string };
  phone?: { area_code: string; number: string };
}

/** Categoría de Mercado Pago para un servicio (lista cerrada de MP). */
export const CATEGORIA_MP = "services";
/** Lo que ve el paciente en el resumen de su tarjeta (máximo 22 caracteres). */
export const DESCRIPTOR_MP = "DOCTO";

function limpiar(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/** Nombre y apellido: los campos separados si existen; si no, el nombre completo partido. */
export function nombreYApellido(d: DatosPagador): { name?: string; surname?: string } {
  const nombre = limpiar(d.nombre);
  const apellido = limpiar(d.apellido);
  if (nombre || apellido) return { ...(nombre ? { name: nombre } : {}), ...(apellido ? { surname: apellido } : {}) };
  const partes = limpiar(d.nombre_completo).split(" ");
  if (partes.length === 0 || partes[0] === "") return {};
  if (partes.length === 1) return { name: partes[0] };
  return { name: partes[0], surname: partes.slice(1).join(" ") };
}

/** DNI de 7 u 8 dígitos; cualquier otra cosa no se manda (un dato mal es peor que ninguno). */
export function identificacion(dni: string | null | undefined): PagadorMp["identification"] | undefined {
  const digitos = (dni ?? "").replace(/\D/g, "");
  return /^\d{7,8}$/.test(digitos) ? { type: "DNI", number: digitos } : undefined;
}

/**
 * Teléfono argentino en el formato de MP (código de área + número). Acepta lo
 * que guarda `pacientes.telefono` (E.164 +549…, o 10 dígitos). Sin el 9 ni el
 * 15. Con área de dos dígitos (11) o de tres; las de cuatro quedan partidas en
 * 3+7, que es informativo y no invalida el dato.
 */
export function telefonoMp(telefono: string | null | undefined): PagadorMp["phone"] | undefined {
  let d = (telefono ?? "").replace(/\D/g, "");
  if (d.startsWith("549")) d = d.slice(3);
  else if (d.startsWith("54")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length !== 10) return undefined;
  const area = d.startsWith("11") ? d.slice(0, 2) : d.slice(0, 3);
  return { area_code: area, number: d.slice(area.length) };
}

/** El objeto `payer` de la preferencia. Solo lo que se sabe; nunca inventa. */
export function armarPagador(d: DatosPagador): PagadorMp {
  const email = limpiar(d.email);
  const ident = identificacion(d.dni);
  const phone = telefonoMp(d.telefono);
  return {
    ...(email ? { email } : {}),
    ...nombreYApellido(d),
    ...(ident ? { identification: ident } : {}),
    ...(phone ? { phone } : {}),
  };
}
