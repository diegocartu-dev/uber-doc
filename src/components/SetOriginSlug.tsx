"use client";

import { useEffect } from "react";
import { setOriginSlug } from "@/lib/origin-slug";

/**
 * Componente invisible que setea el slug de origen en sessionStorage.
 * Montar en páginas /dr/[slug] para que el paciente quede "anclado"
 * a ese consultorio durante toda la sesión.
 */
export default function SetOriginSlug({ slug }: { slug: string }) {
  useEffect(() => {
    setOriginSlug(slug);
  }, [slug]);

  return null;
}
