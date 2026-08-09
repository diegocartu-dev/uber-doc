"use client";

// Compresión de imágenes EN EL NAVEGADOR antes de subirlas.
//
// Bug real (hallado 01/08/2026): el registro médico perdía ~la mitad de los
// médicos. Causa: Vercel rechaza con HTTP 413 cualquier envío de más de ~4,5 MB
// (verificado empíricamente contra producción: 5 MB → 413, 3 MB → 200), pero el
// formulario aceptaba credencial 5 MB + firma 2 MB + foto de perfil 5 MB. Una
// foto de credencial sacada con un celular moderno pesa 3-5 MB, así que el envío
// moría ANTES de llegar al server: sin mensaje útil, el médico abandonaba.
//
// Subir el límite no alcanza (el tope de Vercel es duro), así que la foto se
// achica en el teléfono del médico. Una credencial de 5 MB queda en ~400-800 KB,
// perfectamente legible, y sube mucho más rápido con datos móviles.

const LADO_MAX = 1600; // suficiente para leer una credencial o un DNI
const CALIDAD = 0.82; // JPEG: buen texto legible sin peso de más

/**
 * Techo REAL de la plataforma para un envío, medido contra producción
 * (5 MB → 413 con `x-vercel-error: FUNCTION_PAYLOAD_TOO_LARGE`; 3 MB → llega).
 *
 * Es un tope DURO de Vercel: el 413 corta ANTES de que la petición entre a la
 * app, así que ningún guard del servidor puede atraparlo ni devolver un mensaje.
 * Por eso hay que frenar en el navegador, antes de mandar. Se deja margen porque
 * el multipart suma sus propios bytes además del archivo.
 *
 * La compresión resuelve las imágenes; lo que NO se puede comprimir (un PDF, por
 * ejemplo, que es lo que suele mandar el colegio médico) tiene que chocar contra
 * este número y recibir una explicación, no un botón colgado.
 */
export const MAX_BYTES_ENVIO = 4 * 1024 * 1024; // 4 MB

/**
 * Devuelve una versión comprimida del archivo (JPEG). Si el archivo no es una
 * imagen, o si algo falla, devuelve el original: la compresión NUNCA debe
 * impedir que el médico avance.
 */
export async function comprimirImagen(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);

    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", CALIDAD)
    );
    if (!blob || blob.size >= file.size) return file; // no empeorar

    const nombre = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nombre, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

/** Comprime todos los archivos de imagen de un FormData, en paralelo. */
export async function comprimirImagenesDeFormData(
  formData: FormData,
  campos: string[]
): Promise<void> {
  await Promise.all(
    campos.map(async (campo) => {
      const valor = formData.get(campo);
      if (!(valor instanceof File) || valor.size === 0) return;
      const comprimido = await comprimirImagen(valor);
      if (comprimido !== valor) formData.set(campo, comprimido, comprimido.name);
    })
  );
}

/** Peso total de los archivos de un FormData, en bytes. */
export function pesoTotal(formData: FormData): number {
  let total = 0;
  formData.forEach((v) => {
    if (v instanceof File) total += v.size;
  });
  return total;
}
