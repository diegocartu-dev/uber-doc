export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { Stethoscope } from "lucide-react";
import SetOriginSlug from "@/components/SetOriginSlug";
import ConsultorioLoginClient from "./ConsultorioLoginClient";
import { formatNombreMedico } from "@/lib/utils/texto";
import { identidadHabilitada } from "@/lib/perfil-medico";
import { parsearAreasAtencion, textosAreas } from "@/lib/areas-atencion";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabaseAdmin = createAdminClient();
  const { data: medico } = await supabaseAdmin
    .from("medicos")
    .select("nombre_completo, titulo, especialidad, verificado, estado_registro, identidad_validada, biometria_exenta, es_cuenta_test")
    .eq("slug", slug)
    .maybeSingle();

  const { getFlag } = await import("@/lib/feature-flags");
  const flagIdentidadGate = await getFlag("identidad_gate_activa");
  if (!medico || !medico.verificado || medico.estado_registro !== "aprobado" || (flagIdentidadGate && !identidadHabilitada(medico))) return { title: "Médico no encontrado — Docto" };

  // El título del médico va también acá: es lo que se ve en la pestaña del
  // navegador y en la previsualización cuando comparte el link por WhatsApp.
  return {
    title: `${formatNombreMedico(medico.nombre_completo, medico.titulo)} — ${medico.especialidad} — Docto`,
    robots: { index: false, follow: false },
  };
}

export default async function ConsultorioPublicoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Feature flag: consultorio particular
  const { getFlag } = await import("@/lib/feature-flags");
  if (!(await getFlag("consultorio_particular"))) notFound();

  // Fetch medico con admin client (pre-login, no RLS para anon)
  const supabaseAdmin = createAdminClient();
  const { data: medico } = await supabaseAdmin
    .from("medicos")
    .select("nombre_completo, titulo, especialidad, slug, verificado, estado_registro, identidad_validada, biometria_exenta, es_cuenta_test, foto_url, visible_consultorio_particular")
    .eq("slug", slug)
    .maybeSingle();

  const flagIdentidadGate = await getFlag("identidad_gate_activa");
  if (!medico || !medico.verificado || medico.estado_registro !== "aprobado" || (flagIdentidadGate && !identidadHabilitada(medico))) notFound();
  // Enforcement del toggle (15/07): antes era decorativo — el link seguía
  // funcionando con el canal apagado. false explícito = consultorio cerrado.
  // Los 17 médicos reales lo tienen en true (verificado contra prod).
  if (medico.visible_consultorio_particular === false) notFound();

  // Áreas de atención declaradas (ej: "Atiende adolescentes (10 a 19 años)"). Query
  // PROPIA a propósito: la columna es nueva y la de arriba es la que decide si esta
  // página existe — si algo fallara con la columna, se cae solo el cartelito y no el
  // perfil público del médico. Informativa: no condiciona nada.
  const { data: areasRow } = await supabaseAdmin
    .from("medicos")
    .select("areas_atencion")
    .eq("slug", slug)
    .maybeSingle();
  const areas = textosAreas(parsearAreasAtencion(areasRow?.areas_atencion));

  // Si el usuario ya está logueado, redirigir al consultorio
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { redirect } = await import("next/navigation");
    redirect(`/dr/${slug}/consultorio`);
  }

  const initials = medico.nombre_completo
    .split(/\s+/)
    .filter(Boolean)
    .map((w: string) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-4">
      <SetOriginSlug slug={slug} />
      <div className="w-full max-w-sm text-center">
        {/* Logo */}
        <Link href={`/dr/${slug}`} className="mb-10 flex items-center justify-center gap-2">
          <Stethoscope size={28} strokeWidth={2} color="var(--color-brand)" />
          <span className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>docto</span>
        </Link>

        {/* Avatar */}
        {medico.foto_url ? (
          <div
            className="mx-auto h-20 w-20 rounded-full bg-cover bg-center"
            style={{ backgroundImage: `url(${medico.foto_url})`, backgroundColor: "var(--color-bg-tertiary)", boxShadow: "inset 0 0 0 1px var(--color-border-default)" }}
          />
        ) : (
          <div
            className="mx-auto flex h-20 w-20 items-center justify-center rounded-full text-2xl font-semibold"
            style={{
              backgroundColor: "var(--color-bg-tertiary)",
              color: "var(--color-text-secondary)",
              boxShadow: "inset 0 0 0 1px var(--color-border-default)",
            }}
          >
            {initials}
          </div>
        )}

        {/* Info del médico */}
        <h1
          className="mt-5 text-xl font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          {formatNombreMedico(medico.nombre_completo, medico.titulo)}
        </h1>
        <p
          className="mt-1 text-sm"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {medico.especialidad}
        </p>

        {/* Área de atención declarada por el médico. Informativa. */}
        {areas.length > 0 && (
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            {areas.map((texto) => (
              <span
                key={texto}
                className="inline-block rounded-md px-2 py-0.5 text-xs font-medium leading-snug"
                style={{ backgroundColor: "rgba(55,138,221,0.08)", color: "#378ADD" }}
              >
                {texto}
              </span>
            ))}
          </div>
        )}

        {/* Descripción */}
        <p
          className="mt-6 text-sm leading-relaxed"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Ingresá para solicitar una consulta o agendar un turno.
        </p>

        <ConsultorioLoginClient slug={slug} />

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
