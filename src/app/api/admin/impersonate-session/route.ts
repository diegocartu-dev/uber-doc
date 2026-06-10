import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import crypto from "crypto";

const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/admin/impersonate-session?code=...
 *
 * Recibe un código firmado (HMAC) con email + OTP + expiración.
 * Verifica el OTP directamente con Supabase (sin pasar por el redirect chain
 * de magic links que se rompe con www/non-www y PKCE).
 * Setea cookies de sesión y redirige al dashboard.
 */
function verifyCode(
  code: string,
): { email: string; otp: string } | null {
  try {
    const dotIdx = code.lastIndexOf(".");
    if (dotIdx === -1) return null;

    const dataB64 = code.slice(0, dotIdx);
    const sig = code.slice(dotIdx + 1);

    const payload = Buffer.from(dataB64, "base64url").toString("utf-8");
    const expectedSig = crypto
      .createHmac("sha256", SECRET)
      .update(payload)
      .digest("hex");

    if (sig !== expectedSig) return null;

    const { email, otp, exp } = JSON.parse(payload) as {
      email: string;
      otp: string;
      exp: number;
    };

    if (Date.now() > exp) return null;

    return { email, otp };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login`);
  }

  const verified = verifyCode(code);
  if (!verified) {
    console.error("[impersonate-session] Invalid or expired code");
    return NextResponse.redirect(`${origin}/auth/login`);
  }

  // Redirect a / — el root page enruta según tipo de usuario
  // (médico → /dashboard, paciente → /clinica o /onboarding)
  const response = NextResponse.redirect(`${origin}/`);

  // Crear Supabase client que setea cookies en el response
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          const cookieHeader = request.headers.get("cookie") ?? "";
          if (!cookieHeader) return [];
          return cookieHeader.split("; ").map((c) => {
            const [name, ...rest] = c.split("=");
            return { name, value: rest.join("=") };
          });
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Verificar OTP directo — esto crea la sesión y setea cookies
  const { error } = await supabase.auth.verifyOtp({
    email: verified.email,
    token: verified.otp,
    type: "magiclink",
  });

  if (error) {
    console.error("[impersonate-session] verifyOtp error:", error.message);
    return NextResponse.redirect(`${origin}/auth/login`);
  }

  return response;
}
