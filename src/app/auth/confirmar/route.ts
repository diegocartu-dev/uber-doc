import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EmailOtpType } from "@supabase/supabase-js";

// Confirmación de email / recuperación por token_hash (15/07/2026).
//
// Por qué existe: el flujo viejo (ConfirmationURL → /auth/callback → PKCE
// exchangeCodeForSession) depende de una cookie code_verifier que solo existe en
// el navegador donde se INICIÓ el signUp/reset. Si el link del mail se abre en
// otro contexto (webview de Gmail, otro browser, otro dispositivo) el canje falla
// y el usuario cae al login deslogueado — caso real: dogfooding de Diego 14/07.
// verifyOtp con token_hash es el patrón oficial SSR de Supabase: el token viaja
// EN la URL del mail, la sesión se crea en el navegador que abre el link, sin
// cookies previas. Los templates de mail apuntan acá:
//   {{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=signup|recovery
// /auth/callback queda intacto para OAuth (Google) y links viejos en vuelo.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const esRecovery = type === "recovery";
  // Fallos (link vencido/ya usado): recovery tiene reingreso amable; signup cae
  // al login — ahí el mail casi seguro ya quedó confirmado por un intento previo,
  // así que el login manual funciona y el ruteo por rol lo lleva a donde debe.
  const urlFallo = `${origin}${esRecovery ? "/auth/recuperar?motivo=link-invalido" : "/auth/login"}`;

  if (!token_hash || !type) {
    return NextResponse.redirect(urlFallo);
  }

  // Response contenedor: verifyOtp escribe acá las cookies de la sesión nueva.
  const response = NextResponse.redirect(`${origin}/`);

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
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash });

  if (error || !data.user) {
    return NextResponse.redirect(urlFallo);
  }

  // Redirect final con las cookies de sesión copiadas (mismo patrón que /auth/callback).
  const redirectConSesion = (dest: string) => {
    const r = NextResponse.redirect(`${origin}${dest}`);
    response.cookies.getAll().forEach((cookie) => {
      r.cookies.set(cookie.name, cookie.value, cookie);
    });
    return r;
  };

  // Recuperación: directo a definir la clave nueva, sin importar el rol.
  if (esRecovery) {
    return redirectConSesion("/auth/nueva-contrasena");
  }

  // Confirmación de cuenta: mismo ruteo por rol que /auth/callback.
  const admin = createAdminClient();

  const { isAdmin } = await import("@/lib/admin-auth");
  if (await isAdmin(data.user.id)) {
    return redirectConSesion("/admin");
  }

  // Médico = rol en metadata (Fase A) O ficha existente. Sin ficha → completar
  // registro (Fase B). Con ficha → dashboard. Nunca crearle fila de paciente.
  const esMedicoRol = data.user.user_metadata?.role === "medico";
  const { data: medicoRow } = await admin
    .from("medicos")
    .select("id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (esMedicoRol || medicoRow) {
    return redirectConSesion(medicoRow ? "/dashboard" : "/registro-medico/continuar");
  }

  // Paciente: crear la fila si no existe (bypass RLS con admin), como el callback.
  const { data: existente } = await admin
    .from("pacientes")
    .select("id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!existente) {
    const fullName = data.user.user_metadata?.full_name ?? data.user.email?.split("@")[0] ?? "";
    await admin.from("pacientes").insert({
      user_id: data.user.id,
      nombre_completo: fullName,
      email: data.user.email ?? null,
    });
  }

  return redirectConSesion("/");
}
