import { createAdminClient } from "@/lib/supabase/admin";
import { randomInt, createHash, timingSafeEqual } from "crypto";

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const OTP_COOLDOWN_MS = 30 * 1000;
const MAX_INTENTOS = 5;

// Fix 1.1: Rate limiting global por médico
// Si un médico acumula MAX_OTPS_FALLIDOS OTPs invalidados en 24h,
// se bloquea la generación por LOCKOUT_MS.
const MAX_OTPS_FALLIDOS_24H = 10;
const LOCKOUT_MS = 60 * 60 * 1000; // 1 hora

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
  bloqueado_hasta?: string;
};

/**
 * Verifica si un médico está bloqueado por demasiados OTPs fallidos.
 * Un OTP "fallido" es uno que fue marcado como usado (invalidado)
 * con intentos >= MAX_INTENTOS en las últimas 24 horas.
 */
export async function verificarLockout(medicoId: string): Promise<{
  bloqueado: boolean;
  fallidos_24h: number;
  bloqueado_hasta?: string;
}> {
  const supabase = createAdminClient();
  const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: fallidos, count } = await supabase
    .from("otp_firma")
    .select("created_at", { count: "exact" })
    .eq("medico_id", medicoId)
    .eq("usado", true)
    .gte("intentos", MAX_INTENTOS)
    .gte("created_at", hace24h);

  const totalFallidos = count ?? fallidos?.length ?? 0;

  if (totalFallidos >= MAX_OTPS_FALLIDOS_24H) {
    // Encontrar el último OTP fallido para calcular cuándo se desbloquea
    const ultimoFallido = fallidos && fallidos.length > 0
      ? new Date(fallidos[fallidos.length - 1].created_at)
      : new Date();
    const bloqueadoHasta = new Date(ultimoFallido.getTime() + LOCKOUT_MS);

    if (Date.now() < bloqueadoHasta.getTime()) {
      return {
        bloqueado: true,
        fallidos_24h: totalFallidos,
        bloqueado_hasta: bloqueadoHasta.toISOString(),
      };
    }
  }

  return { bloqueado: false, fallidos_24h: totalFallidos };
}

export async function generarOTP(
  medicoId: string,
  consultaId?: string,
  turnoId?: string
): Promise<GenerarResult> {
  const supabase = createAdminClient();

  // Fix 1.1: Verificar lockout global antes de generar
  const lockout = await verificarLockout(medicoId);
  if (lockout.bloqueado) {
    return {
      ok: false,
      error: "Cuenta bloqueada temporalmente por demasiados intentos fallidos",
      bloqueado_hasta: lockout.bloqueado_hasta,
    };
  }

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

  // Fix 1.1: Verificar lockout antes de validar
  const lockout = await verificarLockout(medicoId);
  if (lockout.bloqueado) {
    return { ok: false, error: "Cuenta bloqueada temporalmente por demasiados intentos fallidos" };
  }

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
