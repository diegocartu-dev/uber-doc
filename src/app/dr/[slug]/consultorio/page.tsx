export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import AppNavbar from "@/components/AppNavbar";
import ConsultorioPrivadoClient from "./ConsultorioPrivadoClient";

export default async function ConsultorioPrivadoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/dr/${slug}`);

  const fullName = user.user_metadata?.full_name || user.email;
  let role = user.user_metadata?.role as "paciente" | "medico" | null;
  if (!role) {
    const { data: esMedico } = await supabase
      .from("medicos").select("id").eq("user_id", user.id).maybeSingle();
    if (esMedico) role = "medico";
    else {
      const { data: esPaciente } = await supabase
        .from("pacientes").select("id").eq("user_id", user.id).maybeSingle();
      if (esPaciente) role = "paciente";
    }
  }

  // Fetch medico by slug (admin para no depender de RLS)
  const supabaseAdmin = createAdminClient();
  const { data: medico } = await supabaseAdmin
    .from("medicos")
    .select("id, nombre_completo, especialidad, disponible, disponible_desde, disponible_hasta, precio_consulta, duracion_consulta, modalidad_atencion, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (!medico) notFound();

  // Calcular disponibilidad
  const ahora = new Date();
  const hh = ahora.getHours().toString().padStart(2, "0");
  const mm = ahora.getMinutes().toString().padStart(2, "0");
  const horaActual = `${hh}:${mm}`;

  const enHorario =
    medico.disponible &&
    (!medico.disponible_desde || !medico.disponible_hasta ||
      (horaActual >= medico.disponible_desde.slice(0, 5) &&
       horaActual <= medico.disponible_hasta.slice(0, 5)));

  const puedeInmediata =
    enHorario &&
    (medico.modalidad_atencion === "inmediata" || medico.modalidad_atencion === "ambas");

  // Contar pacientes en espera
  const { data: consultasEspera } = await supabase
    .from("consultas")
    .select("id")
    .eq("medico_id", medico.id)
    .eq("estado", "esperando");

  const enEspera = consultasEspera?.length ?? 0;
  const tiempoEstimado = enEspera * medico.duracion_consulta;

  const initials = medico.nombre_completo
    .split(" ")
    .map((w: string) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-full" style={{ backgroundColor: "var(--color-bg-secondary)" }}>
      <AppNavbar userName={fullName} userRole={role} />

      <main className="mx-auto max-w-lg px-4 py-8">
        {/* Card del médico */}
        <div
          className="rounded-[var(--radius-lg)] bg-white p-6"
          style={{ border: "1px solid var(--color-border-default)" }}
        >
          {/* Avatar + info */}
          <div className="flex items-center gap-4">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-semibold"
              style={{
                backgroundColor: "var(--color-bg-tertiary)",
                color: "var(--color-text-secondary)",
              }}
            >
              {initials}
            </div>
            <div>
              <h1
                className="text-lg font-semibold"
                style={{ color: "var(--color-text-primary)" }}
              >
                Dr. {medico.nombre_completo}
              </h1>
              <p
                className="text-sm"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {medico.especialidad}
              </p>
              <div className="mt-1.5 flex items-center gap-1.5">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${enHorario ? "animate-pulse" : ""}`}
                  style={{ backgroundColor: enHorario ? "var(--color-success)" : "var(--color-muted)" }}
                />
                <span
                  className="text-xs"
                  style={{ color: enHorario ? "var(--color-success)" : "var(--color-text-tertiary)" }}
                >
                  {enHorario ? "Disponible ahora" : "No disponible en este momento"}
                </span>
              </div>
            </div>
          </div>

          {/* Precio + duración */}
          <div
            className="mt-5 flex items-center justify-between rounded-[var(--radius-md)] px-4 py-3"
            style={{ backgroundColor: "var(--color-bg-tertiary)" }}
          >
            <div>
              <p className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>Consulta</p>
              <p className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
                {new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(medico.precio_consulta)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>Duración</p>
              <p className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
                {medico.duracion_consulta} min
              </p>
            </div>
          </div>

          {/* Cola de espera */}
          {puedeInmediata && enEspera > 0 && (
            <p
              className="mt-3 text-center text-xs"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              {enEspera} paciente{enEspera !== 1 ? "s" : ""} en espera · ~{tiempoEstimado} min
            </p>
          )}

          {/* Acciones */}
          <ConsultorioPrivadoClient
            medicoId={medico.id}
            especialidad={medico.especialidad}
            slug={medico.slug}
            puedeInmediata={puedeInmediata}
          />
        </div>

        {/* Nota */}
        <p
          className="mt-6 text-center text-xs"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Consultorio virtual en Docto · Plataforma de telemedicina segura
        </p>
      </main>
    </div>
  );
}
