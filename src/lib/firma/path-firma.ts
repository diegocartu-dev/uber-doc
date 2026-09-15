// Validación del path de la firma manuscrita antes de bajarla del bucket.
//
// ── POR QUÉ EXISTE (hallazgo 15/09/2026, verificado contra producción) ───────
// `medicos.firma_manuscrita_url` la escribe el propio profesional en su fila
// (RLS: `auth.uid() = user_id`, y la columna NO está en el trigger que blinda
// las columnas de confianza). Guarda un path de Storage que después se baja con
// **service role**, que no pasa por RLS.
//
// Si ese path no se valida, un profesional —incluso pendiente, rechazado,
// suspendido o dado de baja— puede escribir en su ficha algo como
// `../consultas-temp/<lo que sea>` y hacer que el servidor le baje CUALQUIER
// objeto de CUALQUIER bucket privado: credenciales con DNI de otros, estudios
// clínicos de pacientes, firmas ajenas. Comprobado: `supabase-js` `.download()`
// resuelve el `..` y cruza de bucket.
//
// La forma legítima, única, es `medicos/<user_id>/firma.png|jpg|jpeg`. Un path
// así no tiene `..` ni cruza de bucket. Contra la base de producción, las 72
// fichas con firma ya siguen exactamente este patrón: validar no rompe ninguna.

/** Forma exacta y única de un path de firma: `medicos/<uuid>/firma.<png|jpg|jpeg>`. */
const FORMA_PATH_FIRMA = /^medicos\/[0-9a-fA-F-]{36}\/firma\.(png|jpe?g)$/;

/** El path tiene la forma legítima (sin `..`, sin cruce de bucket). */
export function esPathFirmaValido(path: string | null | undefined): boolean {
  return typeof path === "string" && FORMA_PATH_FIRMA.test(path);
}

/** El path es la firma DE ESTE profesional: la forma correcta y su propio user_id. */
export function esPathFirmaPropia(path: string | null | undefined, userId: string): boolean {
  if (!esPathFirmaValido(path)) return false;
  // path ya validado: el segundo segmento es el user_id.
  return (path as string).split("/")[1] === userId;
}
