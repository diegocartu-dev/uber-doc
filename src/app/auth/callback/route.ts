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
  // Solo para usuarios que NO son médicos
  if (data.user) {
    const admin = createAdminClient();
    const { data: esMedico } = await admin
      .from("medicos")
      .select("id")
      .eq("user_id", data.user.id)
      .maybeSingle();

    if (!esMedico) {
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
  }

  return response;
}
