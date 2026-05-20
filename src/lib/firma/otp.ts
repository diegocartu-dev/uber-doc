import { createAdminClient } from "@/lib/supabase/admin";
import { randomInt, createHash, timingSafeEqual } from "crypto";

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const OTP_COOLDOWN_MS = 30 * 1000;
const MAX_INTENTOS = 5;

function hashOTP(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

type GenerarResult = {
  ok: true;
  codigo: string;
} | {
  ok: false;
  error: string;
  cooldown_restante?: number;
};

export async function generarOTP(
  medicoId: string,
  consultaId?: string,
  turnoId?: string
): Promise<GenerarResult> {
  const supabase = createAdminClient();

  const { data: reciente } = await supabase
    .from("otp_firma")
    .select("created_at")
    .eq("medico_id", medicoId)
    .eq("usado", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (reciente) {
    const elapsed = Date.now() - new Date(reciente.created_at).getTime();
    if (elapsed < OTP_COOLDOWN_MS) {
      return {
        ok: false,
        error: "Esperá antes de solicitar otro código",
        cooldown_restante: Math.ceil((OTP_COOLDOWN_MS - elapsed) / 1000),
      };
    }
  }

  const codigo = String(randomInt(100000, 999999));
  const hash = hashOTP(codigo);
  const expiraAt = new Date(Date.now() + OTP_EXPIRY_MS).toISOString();

  const { error } = await supabase.from("otp_firma").insert({
    medico_id: medicoId,
    hash_codigo: hash,
    expira_at: expiraAt,
    consulta_id: consultaId ?? null,
    turno_id: turnoId ?? null,
  });

  if (error) {
    throw new Error(`Error creando OTP: ${error.message}`);
  }

  return { ok: true, codigo };
}

type ValidarResult = {
  ok: true;
  otp_id: string;
} | {
  ok: false;
  error: string;
};

export async function validarOTP(
  medicoId: string,
  codigo: string,
  consultaId?: string,
  turnoId?: string
): Promise<ValidarResult> {
  const supabase = createAdminClient();

  let query = supabase
    .from("otp_firma")
    .select("id, hash_codigo, expira_at, intentos, consulta_id, turno_id")
    .eq("medico_id", medicoId)
    .eq("usado", false)
    .gt("expira_at", new Date().toISOString());

  if (consultaId) query = query.eq("consulta_id", consultaId);
  if (turnoId) query = query.eq("turno_id", turnoId);

  const { data: otps } = await query
    .order("created_at", { ascending: false })
    .limit(1);

  if (!otps || otps.length === 0) {
    return { ok: false, error: "Código expirado o no encontrado" };
  }

  const otp = otps[0];

  if (otp.intentos >= MAX_INTENTOS) {
    await supabase
      .from("otp_firma")
      .update({ usado: true })
      .eq("id", otp.id);
    return { ok: false, error: "Demasiados intentos" };
  }

  const hashInput = hashOTP(codigo);

  await supabase
    .from("otp_firma")
    .update({ intentos: otp.intentos + 1 })
    .eq("id", otp.id);

  const hashInputBuf = Buffer.from(hashInput, "hex");
  const hashStoredBuf = Buffer.from(otp.hash_codigo, "hex");
  if (!timingSafeEqual(hashInputBuf, hashStoredBuf)) {
    return { ok: false, error: "Código inválido" };
  }

  await supabase
    .from("otp_firma")
    .update({ usado: true })
    .eq("id", otp.id);

  return { ok: true, otp_id: otp.id };
}
