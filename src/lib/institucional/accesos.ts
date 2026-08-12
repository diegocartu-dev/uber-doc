// src/lib/institucional/accesos.ts
// Emisión del LINK DE ACCESO del paciente (tabla accesos_link, migración 004).
// SOLO instancia institucional.
//
// El link que viaja por WhatsApp/mail es NUESTRO token: en DB queda solo el
// sha256; el token pelado viaja una vez en el mensaje y NUNCA se guarda ni se
// loguea. La página de aterrizaje (/acceso/t/[token], interstitial + minteo de
// sesión patrón impersonate) llega en la ETAPA 3 — este módulo ya emite los
// tokens para que los avisos salgan con el link definitivo y la Etapa 3 solo
// tenga que abrir la puerta.
//
// Regla (spec §5.4, propuesta vigente): UN token vivo por (paciente, encuentro)
// — emitir uno nuevo revoca los anteriores del mismo recurso. Expiración:
// fin del encuentro + 30 días (la CI ancla en ahora + 30 días).

import { createHash, randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConfigInstitucion } from "@/lib/institucional/config";

const TREINTA_DIAS_MS = 30 * 24 * 3600_000;

export interface AccesoEmitido {
  url: string; // https://<dominio>/acceso/t/<token>
  accesoId: string;
}

export async function crearAccesoLink(params: {
  pacienteId: string; // pacientes.id
  turnoId?: string;
  consultaId?: string;
  destino: string; // path de aterrizaje post-login
  operadorId: string;
  /**
   * null = sin canal automático de envío (hallazgo revisión Etapa 2): el
   * acceso se emite IGUAL — la asignación ya está hecha y el operador necesita
   * el link como fallback manual. El envío es mejor esfuerzo; el token no.
   */
  canal: "whatsapp" | "mail" | null;
  enviadoA: string | null; // celular/mail al momento del envío (null = sin canal)
  /** Instante del encuentro (turno): ancla de la expiración. */
  encuentroMs?: number;
}): Promise<AccesoEmitido | null> {
  if (!params.turnoId === !params.consultaId) {
    // exactamente uno (CHECK accesos_link_un_recurso)
    console.error("[accesos] crearAccesoLink: se necesita turnoId XOR consultaId");
    return null;
  }

  const admin = createAdminClient();
  const config = await getConfigInstitucion();

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const ancla = params.encuentroMs && !Number.isNaN(params.encuentroMs) ? params.encuentroMs : Date.now();
  const expiraAt = new Date(ancla + TREINTA_DIAS_MS).toISOString();

  // Un token vivo por (paciente, encuentro): revocar los previos del recurso.
  const revocacion = admin
    .from("accesos_link")
    .update({ revocado_at: new Date().toISOString() })
    .eq("paciente_id", params.pacienteId)
    .is("revocado_at", null);
  const { error: errRevocar } = params.turnoId
    ? await revocacion.eq("turno_id", params.turnoId)
    : await revocacion.eq("consulta_id", params.consultaId!);
  if (errRevocar) {
    console.error("[accesos] No se pudieron revocar tokens previos:", errRevocar.message);
    // Se sigue igual: el token nuevo es el que viaja; el viejo vence solo.
  }

  const { data, error } = await admin
    .from("accesos_link")
    .insert({
      paciente_id: params.pacienteId,
      turno_id: params.turnoId ?? null,
      consulta_id: params.consultaId ?? null,
      token_hash: tokenHash,
      destino: params.destino,
      expira_at: expiraAt,
      creado_por: params.operadorId,
      canal: params.canal, // nullable (migración 010: enviado_a sin NOT NULL)
      enviado_a: params.enviadoA,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[accesos] No se pudo emitir el acceso:", error?.message);
    return null;
  }

  const dominio = config.dominio.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return { url: `https://${dominio}/acceso/t/${token}`, accesoId: data.id };
}
