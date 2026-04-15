import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "";
  const safeNext = next.startsWith("/") && !next.includes("://") ? next : "";

  // Sin code = error. Redirect al login.
  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login`);
  }

  // Destino final: si viene next lo usamos, si no → landing (que ya detecta sesión)
  const destination = safeNext && safeNext !== "/" ? safeNext : "/";
  const response = NextResponse.redirect(`${origin}${destination}`);

  // Cliente que escribe cookies DIRECTAMENTE en el response
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

  // Intercambiar code por sesión. Si falla → login.
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/auth/login`);
  }

  // Sesión creada OK. Las cookies ya están en el response.
  // La landing (/) detecta la sesión y redirige a /dashboard, /clinica, o /onboarding.
  return response;
}
