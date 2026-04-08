export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { Stethoscope } from "lucide-react";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabaseAdmin = createAdminClient();
  const { data: medico } = await supabaseAdmin
    .from("medicos")
    .select("nombre_completo, especialidad")
    .eq("slug", slug)
    .maybeSingle();

  if (!medico) return { title: "Médico no encontrado — Docto" };

  return {
    title: `Dr. ${medico.nombre_completo} — ${medico.especialidad} — Docto`,
    robots: { index: false, follow: false },
  };
}

export default async function ConsultorioPublicoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Fetch medico con admin client (pre-login, no RLS para anon)
  const supabaseAdmin = createAdminClient();
  const { data: medico } = await supabaseAdmin
    .from("medicos")
    .select("nombre_completo, especialidad, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (!medico) notFound();

  // Si el usuario ya está logueado, redirigir al consultorio
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { redirect } = await import("next/navigation");
    redirect(`/dr/${slug}/consultorio`);
  }

  const initials = medico.nombre_completo
    .split(" ")
    .map((w: string) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        {/* Logo */}
        <Link href="/" className="mb-10 flex items-center justify-center gap-2">
          <Stethoscope size={28} strokeWidth={2} color="var(--color-brand)" />
          <span className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>docto</span>
        </Link>

        {/* Avatar */}
        <div
          className="mx-auto flex h-20 w-20 items-center justify-center rounded-full text-2xl font-semibold"
          style={{
            backgroundColor: "var(--color-bg-tertiary)",
            color: "var(--color-text-secondary)",
          }}
        >
          {initials}
        </div>

        {/* Info del médico */}
        <h1
          className="mt-5 text-xl font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Dr. {medico.nombre_completo}
        </h1>
        <p
          className="mt-1 text-sm"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {medico.especialidad}
        </p>

        {/* Descripción */}
        <p
          className="mt-6 text-sm leading-relaxed"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Consultorio virtual en Docto. Iniciá sesión o registrate para solicitar una consulta o agendar un turno.
        </p>

        {/* Botones */}
        <div className="mt-8 space-y-3">
          <Link
            href={`/auth/login?redirect=/dr/${slug}/consultorio`}
            className="block w-full rounded-[var(--radius-md)] py-3 text-sm font-semibold text-white active:scale-[0.97] transition-all duration-100"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            Iniciar sesión
          </Link>
          <Link
            href={`/auth/register?redirect=/dr/${slug}/consultorio`}
            className="block w-full rounded-[var(--radius-md)] py-3 text-sm font-medium transition-colors hover:bg-[var(--color-bg-tertiary)]"
            style={{
              border: "1px solid var(--color-border-strong)",
              color: "var(--color-text-secondary)",
            }}
          >
            Registrarse
          </Link>
        </div>

        <p
          className="mt-8 text-xs"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Plataforma de telemedicina segura
        </p>
      </div>
    </div>
  );
}
