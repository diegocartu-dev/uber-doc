import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "";
  const safeNext = next.startsWith("/") && !next.includes("://") ? next : "";

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login`);
  }

  const destination = safeNext && safeNext !== "/" ? safeNext : "/";
  const response = NextResponse.redirect(`${origin}${destination}`);

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

  const { error, data } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/auth/login`);
  }

  // Crear registro paciente si no existe (bypass RLS con admin client)
  // Solo para usuarios que NO son médicos NI admins.
  // Si es médico → forzar redirect a /dashboard (evita que caiga en / → onboarding).
  // Si es admin → redirect a /admin y NO crearle registro de paciente.
  if (data.user) {
    // Recuperación de contraseña: el link del mail loguea y va SIEMPRE a definir
    // la clave nueva, sin importar el rol (médico/paciente/admin). Tiene que ir
    // ANTES del ruteo por rol — la rama médico ignora `next` y se comería el flujo.
    if (safeNext === "/auth/nueva-contrasena") {
      return response;
    }

    const admin = createAdminClient();

    const { isAdmin } = await import("@/lib/admin-auth");
    if (await isAdmin(data.user.id)) {
      const adminResponse = NextResponse.redirect(`${origin}/admin`);
      response.cookies.getAll().forEach((cookie) => {
        adminResponse.cookies.set(cookie.name, cookie.value, cookie);
      });
      return adminResponse;
    }

    // Médico = rol en metadata (signUp de Fase A) O ficha ya existente. En el
    // registro nuevo la cuenta se crea (Fase A) ANTES de la ficha (Fase B), así
    // que NO alcanza con mirar la tabla. La ficha, si existe, manda a /dashboard
    // (preserva el comportamiento de los médicos ya registrados). Si es médico →
    // nunca se le crea fila de paciente.
    const esMedicoRol = data.user.user_metadata?.role === "medico";
    const { data: medicoRow } = await admin
      .from("medicos")
      .select("id")
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (esMedicoRol || medicoRow) {
      // Con ficha → dashboard (médico existente). Sin ficha → completar registro
      // (recién confirmó el mail en Fase A).
      const dest = medicoRow ? "/dashboard" : "/registro-medico/continuar";
      const medicoResponse = NextResponse.redirect(`${origin}${dest}`);
      response.cookies.getAll().forEach((cookie) => {
        medicoResponse.cookies.set(cookie.name, cookie.value, cookie);
      });
      return medicoResponse;
    }

    // No es médico → crear paciente si no existe
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
  }

  return response;
}
