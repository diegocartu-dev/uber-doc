const STORAGE_KEY = "docto_origin_slug";

/**
 * Guarda el slug del consultorio de origen en sessionStorage.
 * Llamar desde páginas /dr/[slug] cuando el paciente entra.
 */
export function setOriginSlug(slug: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, slug);
}

/**
 * Limpia el slug de origen (ej: al ir al home o clínica virtual).
 */
export function clearOriginSlug(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}

/**
 * Lee el slug de origen desde sessionStorage.
 * Devuelve null si no hay slug guardado o estamos en SSR.
 */
export function getOriginSlug(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(STORAGE_KEY);
}

/**
 * Devuelve la URL del logo según el origen del paciente.
 * Si vino de /dr/[slug] → /dr/[slug]/consultorio
 * Si no → fallback (default "/")
 */
export function getLogoHref(fallback = "/"): string {
  const slug = getOriginSlug();
  if (slug) return `/dr/${slug}/consultorio`;
  return fallback;
}
