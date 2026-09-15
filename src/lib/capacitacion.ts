// Videos de capacitación para profesionales (decisión Diego, 15/09/2026).
//
// ── QUÉ ES Y DÓNDE SE VE ─────────────────────────────────────────────────────
// Dos videos: cómo empezar a atender y cómo cursar una consulta. Se ven SOLO
// dentro de la pantalla "Configurá cómo atendés", y solo si la cuenta está
// aprobada. No se mandan por mail: Diego lo decidió así.
//
// ── LO QUE SE PUEDE Y LO QUE NO SE PUEDE PROMETER ────────────────────────────
// Diego pidió que no se puedan descargar ni reenviar. Hay que decirlo claro,
// porque es fácil prometer de más: si un video se reproduce, los bytes ya están
// en la máquina de quien mira, y la pantalla siempre se puede grabar. Eso no lo
// impide nada, ni el DRM caro.
//
// Lo que SÍ hace este diseño, y es bastante:
//   1. El archivo vive en un bucket PRIVADO. No hay dirección pública.
//   2. La página nunca escribe la dirección real: el reproductor pide una ruta
//      nuestra, que exige sesión y cuenta aprobada, y recién ahí redirige a una
//      dirección firmada que caduca. Copiar el link de la página no le sirve a
//      nadie sin sesión.
//   3. La dirección firmada que sí se ve en las herramientas del navegador
//      caduca sola. Ver `SEGUNDOS_LINK_FIRMADO` para por qué no es más corta.
//   4. Encima del video va el nombre de quien lo está mirando. No impide nada,
//      pero una grabación de pantalla delata a quien la sacó, y eso es lo único
//      que cambia la conducta de alguien que piensa reenviarlo.
//
// ── CÓMO SE REEMPLAZA UN VIDEO ───────────────────────────────────────────────
// Se sube el archivo nuevo con OTRO nombre y se cambia `archivo` acá. NUNCA se
// pisa el mismo nombre: el borde de la CDN de Supabase sigue sirviendo la
// versión vieja un rato aunque el objeto se haya borrado (medido 14/09). Un
// nombre nuevo no tiene esa caché. Detalle en docs/video-profesional/SERVIR-VIDEOS.md.

export const BUCKET_CAPACITACION = "capacitacion-profesionales";

/**
 * Cuánto dura la dirección firmada.
 *
 * NO puede ser corta. El navegador pide el video por pedazos a medida que
 * avanza, y cada pedazo vuelve a presentar la firma: con cinco minutos, alguien
 * que pausa, retrocede o deja la pestaña abierta se queda con el video cortado
 * a la mitad. Bajar el número tampoco compra seguridad real, porque cualquier
 * plazo que alcance para mirar un video de cuatro minutos alcanza para pegarlo
 * en un chat. Lo que de verdad protege es el punto 2 de arriba.
 */
export const SEGUNDOS_LINK_FIRMADO = 2 * 60 * 60;

export type VideoCapacitacion = {
  /** Lo que va en la URL de la ruta. Solo letras minúsculas y guiones. */
  id: string;
  titulo: string;
  bajada: string;
  /** Como se lee en pantalla. Medido del archivo real. */
  duracion: string;
  /** Nombre del objeto en el bucket privado. NUNCA viaja al navegador. */
  archivo: string;
  /** Portada: el cuadro de título del propio video. Vive en public/, no es sensible. */
  poster: string;
};

/** Lo único que necesita la pantalla. Sin `archivo`: el nombre del objeto no sale del servidor. */
export type VideoCapacitacionVisible = Omit<VideoCapacitacion, "archivo">;

// LOS TÍTULOS SON LOS DEL CUADRO DE TÍTULO DE CADA VIDEO, a propósito. La
// tarjeta, el encabezado del reproductor y lo primero que muestra el video
// tienen que decir lo mismo: si dicen tres cosas distintas, un profesional de
// 70 años no sabe si abrió el video correcto. Por eso tampoco se usa "cursar",
// que es vocabulario interno y no aparece en ninguna pantalla.
//
// El video 2 es solo del flujo de CONSULTA INMEDIATA (aceptar, esperar el
// pago, atender, documentar): la bajada lo dice para que nadie espere ver turnos.
//
// Duraciones medidas con ffprobe sobre los archivos subidos: 150,0 s y 225,7 s.
export const VIDEOS_CAPACITACION: readonly VideoCapacitacion[] = [
  {
    id: "empezar",
    titulo: "Cómo configurar cómo atendés",
    bajada: "Consulta inmediata, agenda de turnos y el link de tu consultorio particular.",
    duracion: "2 min 30 s",
    archivo: "v1-configurar-2026-09-14.mp4",
    poster: "/capacitacion/v1-configurar.jpg",
  },
  {
    id: "consulta",
    titulo: "Atender una consulta de principio a fin",
    bajada: "Consulta inmediata: desde que un paciente te espera hasta que recibe sus documentos.",
    duracion: "3 min 46 s",
    archivo: "v2-atender-2026-09-14.mp4",
    poster: "/capacitacion/v2-atender.jpg",
  },
];

/** Para la pantalla: el catálogo sin los nombres de los objetos del bucket. */
export function videosParaPantalla(): VideoCapacitacionVisible[] {
  return VIDEOS_CAPACITACION.map(({ id, titulo, bajada, duracion, poster }) => ({ id, titulo, bajada, duracion, poster }));
}

export function videoPorId(id: string): VideoCapacitacion | null {
  return VIDEOS_CAPACITACION.find((v) => v.id === id) ?? null;
}

/**
 * ¿Esta cuenta puede ver los videos?
 *
 * Es la forma en que el repo dice "aprobado": `verificado` y
 * `estado_registro = 'aprobado'`, que el panel de admin escribe siempre juntos.
 * Y además la baja: la baja es BLANDA y no toca ninguna de las dos columnas,
 * así que sin mirarla alguien dado de baja figura como aprobado.
 *
 * Las cuentas de prueba NO tienen exención, y no la necesitan: nacen aprobadas.
 */
export function puedeVerCapacitacion(
  m: { verificado?: boolean | null; estado_registro?: string | null; dado_de_baja?: boolean | null } | null | undefined,
): boolean {
  if (!m) return false;
  return m.verificado === true && m.estado_registro === "aprobado" && m.dado_de_baja !== true;
}
