import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "";
  const safeNext = next.startsWith("/") && !next.includes("://") ? next : "";

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
  }

  // Construimos la response de redirect ANTES de crear el cliente para que
  // exchangeCodeForSession pueda escribir las cookies directamente en ella.
  // Si usamos createClient() de server.ts, el setAll intenta escribir en el
  // cookie store de Next.js (read-only en Route Handlers) y falla silenciosamente,
  // dejando la sesión sin persistir en el browser.
  let redirectUrl = `${origin}/auth/login?error=auth_failed`;
  const response = NextResponse.redirect(redirectUrl);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.headers
            .get("cookie")
            ?.split("; ")
            .map((c) => {
              const [name, ...rest] = c.split("=");
              return { name, value: rest.join("=") };
            }) ?? [];
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    response.headers.set(
      "location",
      `${origin}/auth/login?error=auth_failed`
    );
    return response;
  }

  // Si viene un next útil (distinto de "/"), respetarlo — viene del flujo previo
  if (safeNext && safeNext !== "/") {
    response.headers.set("location", `${origin}${safeNext}`);
    return response;
  }

  // Sin next útil: determinar destino según perfil del usuario autenticado
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    response.headers.set(
      "location",
      `${origin}/auth/login?error=auth_failed`
    );
    return response;
  }

  // Chequear si es médico primero
  const { data: medico } = await supabase
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (medico) {
    response.headers.set("location", `${origin}/dashboard`);
    return response;
  }

  // Es paciente: verificar si tiene perfil completo
  const { data: paciente } = await supabase
    .from("pacientes")
    .select("nombre_completo, dni, fecha_nacimiento, telefono")
    .eq("user_id", user.id)
    .maybeSingle();

  const perfilCompleto =
    paciente &&
    paciente.nombre_completo &&
    paciente.dni &&
    paciente.fecha_nacimiento &&
    paciente.telefono;

  response.headers.set(
    "location",
    perfilCompleto ? `${origin}/clinica` : `${origin}/onboarding?redirectTo=/clinica`
  );
  return response;
}
