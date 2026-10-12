import { createAdminClient } from "@/lib/supabase/admin";
import { hashSHA256, verificar } from "./crypto";

// Fix 3.3: JSON.stringify no garantiza orden de keys.
// JSONB en PostgreSQL puede reordenar keys al almacenar.
// canonicalJSON ordena keys recursivamente para hash determinístico.
function canonicalJSON(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJSON).join(",") + "]";
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const pairs = keys.map(
      (k) => JSON.stringify(k) + ":" + canonicalJSON((value as Record<string, unknown>)[k])
    );
    return "{" + pairs.join(",") + "}";
  }
  return JSON.stringify(value);
}

export { canonicalJSON };

// `firmarReceta` (firma de la tabla `recetas` con código por mail) se borró el
// 12/10/2026: ninguna pantalla la llamaba y en producción nunca se emitió un
// código (`otp_firma` vacía). Las recetas se firman en `documento.ts`, por la
// sesión del profesional. Acá queda la verificación pública de las recetas
// viejas de `recetas` (`/api/verificar/[id]`) y `canonicalJSON`, que usa todo
// el motor de firma.

type VerificacionResult = {
  valida: boolean;
  alterada: boolean;
  datos: {
    hash_original: string;
    hash_actual: string;
    algoritmo: string;
    firmado_at: string;
    medico_id: string;
  } | null;
};

export async function verificarFirma(
  recetaId: string
): Promise<VerificacionResult> {
  const supabase = createAdminClient();

  const { data: receta } = await supabase
    .from("recetas")
    .select("datos_prescripcion, firma_digital, medico_id")
    .eq("id", recetaId)
    .single();

  if (!receta?.firma_digital) {
    return { valida: false, alterada: false, datos: null };
  }

  const fd = receta.firma_digital as {
    hash: string;
    firma: string;
    algoritmo: string;
    firmado_at: string;
    medico_id: string;
  };

  // Fix I-3: Buscar clave que firmó. Si hay firma_logs con clave_id, usarla.
  // Fallback: buscar cualquier clave del médico (activa o revocada) para verificación histórica.
  const { data: log } = await supabase
    .from("firma_logs")
    .select("clave_id")
    .eq("receta_id", recetaId)
    .limit(1)
    .maybeSingle();

  let clavePublica: string | null = null;

  if (log?.clave_id) {
    const { data: claveEspecifica } = await supabase
      .from("medico_claves")
      .select("clave_publica")
      .eq("id", log.clave_id)
      .single();
    clavePublica = claveEspecifica?.clave_publica ?? null;
  }

  if (!clavePublica) {
    // Fallback para firmas anteriores al sistema de logs
    const { data: claves } = await supabase
      .from("medico_claves")
      .select("clave_publica")
      .eq("medico_id", fd.medico_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    clavePublica = claves?.clave_publica ?? null;
  }

  if (!clavePublica) {
    return { valida: false, alterada: false, datos: null };
  }

  const contenidoActual = canonicalJSON(receta.datos_prescripcion);
  const hashActual = hashSHA256(contenidoActual);
  const alterada = hashActual !== fd.hash;
  const firmaValida = verificar(fd.hash, fd.firma, clavePublica);

  return {
    valida: firmaValida && !alterada,
    alterada,
    datos: {
      hash_original: fd.hash,
      hash_actual: hashActual,
      algoritmo: fd.algoritmo,
      firmado_at: fd.firmado_at,
      medico_id: fd.medico_id,
    },
  };
}
