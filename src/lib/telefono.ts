// src/lib/telefono.ts
// Normalización de teléfonos argentinos — módulo PURO, sin dependencias de server
// (nada de Supabase admin ni env vars secretas), para poder importarlo tanto desde
// server actions como desde componentes cliente. El caso que lo motivó (auditoría
// 06/08): el paso 1 del registro médico necesita validar el celular con la MISMA
// regla que aplica el server, y la versión canónica vivía en whatsapp.ts, que
// importa el admin client de Supabase y no es seguro de meter en el bundle del
// cliente. whatsapp.ts la re-exporta para no romper los imports existentes.

/**
 * Normaliza un teléfono argentino a E.164 móvil para WhatsApp: +549XXXXXXXXXX.
 *
 * Móvil nacional argentino = 10 dígitos (código de área 2-4 + abonado). Esta función
 * pela el país (54), el 9 de móvil, el 0 de larga distancia y el viejo prefijo "15"
 * embebido, y RECHAZA (devuelve null) cualquier cosa que no quede en exactamente 10
 * dígitos — así nunca arma un número equivocado por tomar "los últimos 10".
 */
export function normalizarTelefonoAR(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).replace(/\D/g, ""); // solo dígitos
  if (!s) return null;

  if (s.startsWith("00")) s = s.slice(2); // salida internacional
  if (s.startsWith("54")) s = s.slice(2); // país
  if (s.startsWith("9")) s = s.slice(1); // 9 de móvil (lo re-agregamos al final)
  if (s.startsWith("0")) s = s.slice(1); // 0 de larga distancia

  // Viejo prefijo de móvil "15" embebido entre el área y el abonado (área + 15 + abonado
  // = 12 díg). Probamos áreas de 2, 3 o 4 dígitos y removemos el "15" si así queda en 10.
  if (s.length === 12) {
    for (const areaLen of [2, 3, 4]) {
      if (s.slice(areaLen, areaLen + 2) === "15") {
        const candidato = s.slice(0, areaLen) + s.slice(areaLen + 2);
        if (candidato.length === 10) {
          s = candidato;
          break;
        }
      }
    }
  }

  if (s.length !== 10) return null; // móvil nacional = 10 díg exactos
  return `+549${s}`;
}
