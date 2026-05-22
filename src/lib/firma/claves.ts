import { createAdminClient } from "@/lib/supabase/admin";
import {
  generarParRSA,
  encriptarClavePrivada,
} from "./crypto";

export async function provisionarClaves(medicoId: string): Promise<{ publicKey: string }> {
  const supabase = createAdminClient();

  // Fix I-3: Solo buscar clave activa (no revocada)
  const { data: existing } = await supabase
    .from("medico_claves")
    .select("id, clave_publica")
    .eq("medico_id", medicoId)
    .eq("activa", true)
    .maybeSingle();

  if (existing) {
    return { publicKey: existing.clave_publica };
  }

  const { publicKey, privateKey } = generarParRSA();
  const privadaEnc = encriptarClavePrivada(privateKey);

  const { error } = await supabase.from("medico_claves").insert({
    medico_id: medicoId,
    clave_publica: publicKey,
    clave_privada_enc: privadaEnc,
  });

  if (error) {
    if (error.code === "23505") {
      // Roberto: filtrar por activa=true para no devolver clave revocada
      const { data: race } = await supabase
        .from("medico_claves")
        .select("clave_publica")
        .eq("medico_id", medicoId)
        .eq("activa", true)
        .single();
      if (race) return { publicKey: race.clave_publica };
    }
    throw new Error(`Error provisionando claves: ${error.message}`);
  }

  return { publicKey };
}

export async function tieneClaves(medicoId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("medico_claves")
    .select("id")
    .eq("medico_id", medicoId)
    .eq("activa", true)
    .maybeSingle();
  return !!data;
}

// Fix I-3 / 4.4: Revocar claves comprometidas o rotar periódicamente.
// La clave revocada se mantiene para verificar firmas históricas.
// Se genera un nuevo par de claves activas.
type RevocarResult = {
  ok: true;
  nuevaPublicKey: string;
} | {
  ok: false;
  error: string;
};

export async function revocarClaves(
  medicoId: string,
  motivo: string
): Promise<RevocarResult> {
  const supabase = createAdminClient();

  // Buscar clave activa actual
  const { data: actual } = await supabase
    .from("medico_claves")
    .select("id")
    .eq("medico_id", medicoId)
    .eq("activa", true)
    .maybeSingle();

  if (!actual) {
    return { ok: false, error: "No hay clave activa para revocar" };
  }

  // Revocar clave actual (no se borra — trigger anti-DELETE)
  const { error: revokeError } = await supabase
    .from("medico_claves")
    .update({
      activa: false,
      revocada_at: new Date().toISOString(),
      motivo_revocacion: motivo,
    })
    .eq("id", actual.id);

  if (revokeError) {
    return { ok: false, error: `Error revocando clave: ${revokeError.message}` };
  }

  // Generar nuevo par de claves
  const { publicKey, privateKey } = generarParRSA();
  const privadaEnc = encriptarClavePrivada(privateKey);

  const { error: insertError } = await supabase.from("medico_claves").insert({
    medico_id: medicoId,
    clave_publica: publicKey,
    clave_privada_enc: privadaEnc,
    activa: true,
  });

  if (insertError) {
    return { ok: false, error: `Error generando nuevas claves: ${insertError.message}` };
  }

  return { ok: true, nuevaPublicKey: publicKey };
}
