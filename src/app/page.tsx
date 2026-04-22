import Link from "next/link";
import { Video, FileText, Shield, Clock, Stethoscope, ArrowRight } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import AppNavbar from "@/components/AppNavbar";
import Footer from "@/components/Footer";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  if (code) redirect(`/auth/callback?code=${code}`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: medico } = await supabase
      .from("medicos")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (medico) redirect("/dashboard");

    const admin = createAdminClient();
    const { data: paciente } = await admin
      .from("pacientes")
      .select("nombre_completo, dni, fecha_nacimiento, sexo_dni")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!paciente) {
      const fullName = user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "";
      await admin.from("pacientes").insert({
        user_id: user.id,
        nombre_completo: fullName,
        email: user.email ?? null,
      });
      redirect("/onboarding");
    }

    const perfilCompleto =
      paciente.nombre_completo?.trim() &&
      paciente.dni?.trim() &&
      paciente.fecha_nacimiento &&
      paciente.sexo_dni;

    redirect(perfilCompleto ? "/clinica" : "/onboarding");
  }

  const steps = [
    {
      icon: Stethoscope,
      title: "Elegí tu especialidad",
      description: "Buscá entre nuestros médicos matriculados y elegí turno o consulta inmediata.",
    },
    {
      icon: Video,
      title: "Conectá por videollamada",
      description: "Consultá desde tu casa, sin traslados ni salas de espera. Solo necesitás tu celular.",
    },
    {
      icon: FileText,
      title: "Recibí tu receta digital",
      description: "Tu médico te envía la receta al instante. Descargala y presentala en cualquier farmacia.",
    },
  ];

  const features = [
    {
      icon: Shield,
      title: "Médicos matriculados",
      description: "Todos nuestros profesionales están verificados y habilitados para ejercer.",
    },
    {
      icon: FileText,
      title: "Recetas con validez legal",
      description: "Recetas digitales válidas para presentar en farmacias de todo el país.",
    },
    {
      icon: Video,
      title: "Videoconsulta segura",
      description: "Conexión encriptada punto a punto. Tu consulta es privada y confidencial.",
    },
    {
      icon: Clock,
      title: "Disponible cuando lo necesitás",
      description: "Consultas inmediatas o programadas. Elegí el horario que te quede mejor.",
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <AppNavbar showMenu={false} />

      {/* Hero */}
      <section
        className="flex flex-col items-center px-4 text-center"
        style={{ paddingTop: "var(--space-16)", paddingBottom: "var(--space-20)" }}
      >
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white"
          style={{ backgroundColor: "var(--color-warning)" }}
        >
          Beta abierta
        </span>

        <h1
          className="mt-6 max-w-2xl text-4xl font-bold sm:text-5xl"
          style={{ color: "var(--color-text-primary)", lineHeight: 1.15, letterSpacing: "-0.02em" }}
        >
          Tu médico, a un toque
        </h1>

        <p
          className="mt-4 max-w-lg text-[15px] leading-relaxed sm:text-lg sm:leading-relaxed"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Consultá con un médico por videollamada en minutos.
          Recetas digitales, turnos programados y consulta inmediata.
        </p>

        <div className="mt-10 flex w-full max-w-sm flex-col gap-3 sm:flex-row sm:justify-center sm:max-w-none">
          <Link
            href="/auth/register"
            className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] px-8 py-3 text-sm font-semibold text-white transition-all active:scale-[0.97]"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            Crear cuenta gratis
            <ArrowRight size={16} strokeWidth={2} />
          </Link>
          <Link
            href="/auth/login"
            className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] px-8 py-3 text-sm font-semibold transition-all active:scale-[0.97]"
            style={{
              color: "var(--color-primary)",
              border: "1.5px solid var(--color-primary)",
            }}
          >
            Ya tengo cuenta
          </Link>
        </div>
      </section>

      {/* Cómo funciona */}
      <section
        className="px-4"
        style={{
          backgroundColor: "var(--color-bg-secondary)",
          paddingTop: "var(--space-20)",
          paddingBottom: "var(--space-20)",
        }}
      >
        <div className="mx-auto max-w-5xl">
          <p
            className="text-center text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--color-primary)", letterSpacing: "0.1em" }}
          >
            Cómo funciona
          </p>
          <h2
            className="mt-3 text-center text-2xl font-bold sm:text-3xl"
            style={{ color: "var(--color-text-primary)" }}
          >
            3 pasos, sin complicaciones
          </h2>

          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {steps.map((step, i) => (
              <div key={i} className="flex flex-col items-center text-center">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-full"
                  style={{ backgroundColor: "var(--color-primary-soft)" }}
                >
                  <step.icon size={24} strokeWidth={1.75} style={{ color: "var(--color-primary)" }} />
                </div>
                <span
                  className="mt-2 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: "var(--color-primary)" }}
                >
                  {i + 1}
                </span>
                <h3
                  className="mt-3 text-lg font-semibold"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {step.title}
                </h3>
                <p
                  className="mt-2 max-w-xs text-[15px] leading-relaxed"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Por qué Docto */}
      <section
        className="px-4"
        style={{ paddingTop: "var(--space-20)", paddingBottom: "var(--space-20)" }}
      >
        <div className="mx-auto max-w-5xl">
          <p
            className="text-center text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--color-primary)", letterSpacing: "0.1em" }}
          >
            Por qué Docto
          </p>
          <h2
            className="mt-3 text-center text-2xl font-bold sm:text-3xl"
            style={{ color: "var(--color-text-primary)" }}
          >
            Telemedicina pensada para vos
          </h2>

          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {features.map((feature, i) => (
              <div
                key={i}
                className="flex gap-4 rounded-[var(--radius-lg)] p-5"
                style={{ border: "1px solid var(--color-border-default)" }}
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)]"
                  style={{ backgroundColor: "var(--color-primary-soft)" }}
                >
                  <feature.icon size={20} strokeWidth={1.75} style={{ color: "var(--color-primary)" }} />
                </div>
                <div>
                  <h3
                    className="text-[15px] font-semibold"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {feature.title}
                  </h3>
                  <p
                    className="mt-1 text-sm leading-relaxed"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section
        className="px-4 text-center"
        style={{
          backgroundColor: "var(--color-primary-soft)",
          paddingTop: "var(--space-16)",
          paddingBottom: "var(--space-16)",
        }}
      >
        <h2
          className="text-2xl font-bold sm:text-3xl"
          style={{ color: "var(--color-text-primary)" }}
        >
          Empezá a consultar hoy
        </h2>
        <p
          className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Creá tu cuenta en menos de un minuto. Sin costo de registro.
        </p>
        <div className="mt-8 flex justify-center">
          <Link
            href="/auth/register"
            className="inline-flex items-center gap-2 rounded-[var(--radius-md)] px-8 py-3 text-sm font-semibold text-white transition-all active:scale-[0.97]"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            Crear cuenta gratis
            <ArrowRight size={16} strokeWidth={2} />
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
