"use server";

// Re-subida de credencial para un médico que subió el documento equivocado (ej. su CV
// en vez de la credencial de matrícula) y todavía no fue aprobado. Solo el médico dueño,
// solo en estados no-aprobados (pendiente/rechazado/suspendido). Reusa el bucket
// `credenciales-medicos` (privado; el admin lo ve con URL firmada).

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const TIPOS_OK = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ESTADOS_PERMITIDOS = new Set(["pendiente_revision", "rechazado", "suspendido"]);

export async function resubirCredencial(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No estás autenticado." };

  const file = formData.get("credencial");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Elegí un archivo." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "El archivo es muy grande (máximo 10 MB)." };
  }
  if (!TIPOS_OK.includes(file.type)) {
    return { ok: false, error: "Formato no válido. Subí una imagen (JPG/PNG) o un PDF." };
  }

  const admin = createAdminClient();
  // Identificamos al médico por SU sesión → solo puede tocar su propia credencial.
  const { data: medico } = await admin
    .from("medicos")
    .select("id, estado_registro")
    .eq("user_id", user.id)
    .single();
  if (!medico) return { ok: false, error: "No encontramos tu registro de médico." };
  if (!ESTADOS_PERMITIDOS.has(medico.estado_registro)) {
    // Un médico ya aprobado no re-sube por acá (tiene otros flujos).
    return { ok: false, error: "Tu cuenta ya está aprobada; no hace falta re-subir la credencial." };
  }

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${medico.id}/credencial-${Date.now()}.${ext}`;
  const { error: upErr } = await admin.storage
    .from("credenciales-medicos")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) {
    console.error("[resubirCredencial] upload falló:", upErr.message);
    return { ok: false, error: "No pudimos subir el archivo. Intentá de nuevo." };
  }

  const { error: updErr } = await admin
    .from("medicos")
    .update({ foto_credencial_url: path })
    .eq("id", medico.id);
  if (updErr) {
    console.error("[resubirCredencial] update foto_credencial_url falló:", updErr.message);
    return { ok: false, error: "Subimos el archivo pero no pudimos guardarlo. Escribinos a soporte@docto.com.ar." };
  }

  return { ok: true };
}
