import { createAdminClient } from "@/lib/supabase/admin";
import {
  generarParRSA,
  encriptarClavePrivada,
} from "./crypto";

export async function provisionarClaves(medicoId: string): Promise<{ publicKey: string }> {
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("medico_claves")
    .select("id, clave_publica")
    .eq("medico_id", medicoId)
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
      const { data: race } = await supabase
        .from("medico_claves")
        .select("clave_publica")
        .eq("medico_id", medicoId)
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
    .maybeSingle();
  return !!data;
}
