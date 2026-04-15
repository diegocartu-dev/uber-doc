import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "";
  const safeNext = next.startsWith("/") && !next.includes("://") ? next : "";

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
  }

  // Si viene un next útil (distinto de "/"), respetarlo — viene del flujo previo
  if (safeNext && safeNext !== "/") {
    return NextResponse.redirect(`${origin}${safeNext}`);
  }

  // Sin next útil: determinar destino según perfil del usuario autenticado
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
  }

  // Chequear si es médico primero
  const { data: medico } = await supabase
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (medico) {
    return NextResponse.redirect(`${origin}/dashboard`);
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

  if (perfilCompleto) {
    return NextResponse.redirect(`${origin}/clinica`);
  }

  return NextResponse.redirect(`${origin}/onboarding?redirectTo=/clinica`);
}
