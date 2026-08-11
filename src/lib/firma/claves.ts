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
//
// ⚠️ ANTES DE USAR ESTA FUNCIÓN, LEER ESTO — HOY NO FUNCIONA.
//
// `medico_claves` tiene `medico_id UNIQUE` a nivel tabla (la restricción entera
// `medico_claves_medico_id_key`, del CREATE TABLE original; el índice parcial
// posterior sobre `activa=true` NO la reemplaza). O sea: un médico no puede
// tener más de UNA fila, nunca.
//
// Esta función hace UPDATE (marcar la vieja como revocada) y DESPUÉS INSERT de
// la nueva. Ese INSERT viola la restricción única y falla — pero la revocación
// YA SE GUARDÓ. Resultado: el profesional queda con una sola clave revocada,
// sin ninguna activa, y no puede firmar NADA hasta que alguien lo arregle a
// mano. Es peor que no haber intentado rotar.
//
// Por eso hoy no la llama nadie (verificado: cero call sites en todo el repo) y
// en producción no existe una sola clave revocada.
//
// QUÉ HAY QUE DECIDIR CUANDO HAGA FALTA (clave comprometida, cambio de
// matrícula), porque son dos modelos incompatibles y hay que elegir uno:
//
//  (a) UNA clave por médico: se pisa la vieja (UPDATE en vez de INSERT). Simple,
//      pero las firmas viejas dejan de poder verificarse con su clave original.
//  (b) HISTORIAL de claves: hay que BORRAR la restricción única entera y dejar
//      solo el índice parcial sobre `activa=true`. Recién ahí conviven la
//      revocada y la nueva, y los fallbacks de verificación histórica que ya
//      existen en `firma/receta.ts` y `firma/documento.ts` empiezan a tener
//      sentido — hoy son código inalcanzable, porque nunca puede haber una fila
//      vieja que encontrar.
//
// El comentario de acá arriba ("se mantiene para verificar firmas históricas")
// describe la intención (b), pero la base impone la (a). Esa contradicción es el
// bug de fondo, no el filtro `activa=true` que proponía el PR #264.
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
