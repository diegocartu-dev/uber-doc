import Link from "next/link";
import {
  ShieldCheck,
  FileText,
  Wallet,
  Search,
  CalendarCheck,
  Video,
  Check,
  ArrowRight,
  Calendar,
  FileSignature,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import LandingNav from "@/components/landing/LandingNav";
import Buscador from "@/components/landing/Buscador";
import { PhoneMockupHero, PhoneMockupInmediata } from "@/components/landing/PhoneMockup";
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

  /* ---------- Landing pag. para usuarios NO autenticados ---------- */

  const steps = [
    {
      n: "01",
      icon: Search,
      title: "Elegí especialidad",
      description:
        "Buscá por especialidad, síntoma o nombre del profesional. Filtrá por disponibilidad inmediata o reservá turno programado.",
    },
    {
      n: "02",
      icon: CalendarCheck,
      title: "Reservá y pagá",
      description:
        "Elegí un horario en la agenda del médico. Pagás con tarjeta — sin pasar por tu obra social. Recibís confirmación al toque.",
    },
    {
      n: "03",
      icon: Video,
      title: "Consulta por video",
      description:
        'A la hora del turno, entrás a la sala de espera desde el navegador o la app. Si hay receta, queda lista en "Mis documentos".',
    },
  ];

  const inmediataFeatures = [
    {
      title: "Espera promedio 12 minutos",
      description: "Clínica Médica, Pediatría y Dermatología disponibles casi siempre.",
    },
    {
      title: "Pagás solo si te atienden",
      description: "Si ningún médico toma tu consulta en 30 min, se te reintegra automáticamente.",
    },
    {
      title: "Receta al instante",
      description: 'Si el médico indica medicación, queda firmada digitalmente en "Mis documentos".',
    },
  ];

  const medicoCards = [
    { icon: Wallet, title: "Cobrás por consulta", description: "Sin mensualidades. Nos llevamos una comisión solo cuando atendés." },
    { icon: Calendar, title: "Agenda flexible", description: "Publicás tus horarios y los cambiás cuando quieras. Vos mandás." },
    { icon: FileSignature, title: "Receta digital", description: "Firma electrónica con validez legal, sin papel ni trámites." },
    { icon: Users, title: "Pacientes verificados", description: "DNI + cobertura confirmados antes de reservar turno." },
  ];

  return (
    <div className="landing-root" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#fff", overflowX: "hidden" }}>
      <LandingNav />

      {/* ============ HERO ============ */}
      <section style={{ padding: "56px 24px 72px", background: "#fff" }}>
        <div className="landing-hero-grid" style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 48, alignItems: "center" }}>
          <div>
            <h1
              className="landing-hero-h1"
              style={{
                fontSize: "clamp(34px, 5.4vw, 64px)",
                lineHeight: 1.05,
                fontWeight: 700,
                letterSpacing: "-0.035em",
                margin: "0 0 20px",
                color: "var(--color-text-primary)",
              }}
            >
              El médico que necesitás,
              <br />
              <span style={{ color: "var(--color-primary)" }}>cuando lo necesitás</span>.
            </h1>

            <p
              className="hero-sub-desktop"
              style={{
                fontSize: 18,
                lineHeight: 1.55,
                color: "var(--color-text-secondary)",
                margin: "0 0 28px",
                maxWidth: 560,
              }}
            >
              Reservá turno con médicos con matrícula verificada y recibí tu receta con validez legal.
              Desde donde estés, sin obra social de por medio.
            </p>
            <p
              className="hero-sub-mobile"
              style={{
                fontSize: 16,
                lineHeight: 1.5,
                color: "var(--color-text-secondary)",
                margin: "0 0 24px",
                maxWidth: 560,
                display: "none",
              }}
            >
              Médicos verificados. Receta digital. Sin obra social.
            </p>

            <div style={{ marginBottom: 18 }}>
              <Buscador />
            </div>

            {/* TrustLine */}
            <div className="landing-trust-line" style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap", fontSize: 13, color: "var(--color-text-secondary)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <ShieldCheck size={15} style={{ color: "#3F7A52" }} />
                Matrícula verificada
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <FileText size={15} style={{ color: "#3F7A52" }} />
                Recetas con validez legal
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <Wallet size={15} style={{ color: "#3F7A52" }} />
                Sin obra social de por medio
              </span>
            </div>
          </div>

          <div className="landing-phone-hero" style={{ display: "flex", justifyContent: "center", position: "relative" }}>
            <div
              style={{
                position: "absolute",
                inset: "-40px -20px",
                background: "radial-gradient(circle at 60% 40%, rgba(161, 206, 164, 0.35), transparent 60%)",
                zIndex: 0,
                borderRadius: "50%",
              }}
            />
            <div style={{ position: "relative", zIndex: 1 }}>
              <PhoneMockupHero />
            </div>
          </div>
        </div>
      </section>

      {/* ============ COMO FUNCIONA ============ */}
      <section id="como-funciona" style={{ padding: "96px 24px", background: "#fff" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div className="section-header" style={{ maxWidth: 640, marginBottom: 56 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--color-primary)",
                marginBottom: 14,
              }}
            >
              Cómo funciona
            </div>
            <h2
              className="landing-section-title"
              style={{
                fontSize: "clamp(30px, 3.2vw, 42px)",
                lineHeight: 1.1,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                margin: "0 0 14px",
              }}
            >
              De la búsqueda al turno en menos de 2 minutos.
            </h2>
            <p style={{ fontSize: 16, lineHeight: 1.55, color: "var(--color-text-secondary)", margin: 0 }}>
              Sin derivaciones, sin autorizaciones, sin llamadas. Tres pasos y hablás con un médico.
            </p>
          </div>

          <div className="landing-steps-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {steps.map((s) => (
              <div
                key={s.n}
                className="step-card"
                style={{
                  padding: "28px 26px 30px",
                  border: "1px solid var(--color-border-default)",
                  borderRadius: 16,
                  background: "#fff",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                <div className="step-card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span
                    className="step-card-num"
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--color-text-tertiary)",
                      letterSpacing: "0.05em",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {s.n} / 03
                  </span>
                  <div
                    className="step-card-icon"
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 10,
                      background: "var(--color-bg-tertiary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <s.icon size={20} style={{ color: "var(--color-primary)" }} />
                  </div>
                </div>
                <h3 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", margin: "8px 0 0" }}>
                  {s.title}
                </h3>
                <p className="step-card-desc" style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--color-text-secondary)", margin: 0 }}>
                  {s.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ CONSULTA INMEDIATA ============ */}
      <section
        id="inmediata"
        style={{
          padding: "96px 24px",
          background: "var(--color-bg-secondary)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Radial glow */}
        <div
          style={{
            position: "absolute",
            top: -120,
            right: -120,
            width: 480,
            height: 480,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(161, 206, 164, 0.25), transparent 65%)",
            pointerEvents: "none",
          }}
        />

        <div
          className="landing-inmediata-grid"
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "0.9fr 1.1fr",
            gap: 64,
            alignItems: "center",
            position: "relative",
          }}
        >
          <div className="landing-phone-inmediata" style={{ display: "flex", justifyContent: "center" }}>
            <PhoneMockupInmediata />
          </div>

          <div>
            <div
              className="landing-pulse-badge"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                borderRadius: 999,
                background: "var(--color-success-tint)",
                color: "#3F7A52",
                fontSize: 12,
                fontWeight: 600,
                marginBottom: 20,
              }}
            >
              <span
                className="landing-pulse"
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "#3F7A52",
                  display: "inline-block",
                }}
              />
              Consulta inmediata
            </div>

            <h2
              className="landing-section-title"
              style={{
                fontSize: "clamp(30px, 3.2vw, 42px)",
                lineHeight: 1.1,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                margin: "0 0 18px",
              }}
            >
              ¿No podés esperar?
              <br />
              Conectate con un médico <span style={{ color: "#3F7A52" }}>ahora</span>.
            </h2>

            <p
              style={{
                fontSize: 17,
                lineHeight: 1.55,
                color: "var(--color-text-secondary)",
                margin: "0 0 28px",
                maxWidth: 520,
              }}
            >
              Médicos de guardia virtual listos para atenderte. Entrás a la sala de espera,
              te atiende el primero disponible, y si hace falta te lleva la receta al toque.
            </p>

            <div className="inmediata-features" style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 32 }}>
              {inmediataFeatures.map((f) => (
                <div key={f.title} style={{ display: "flex", gap: 12 }}>
                  <div
                    style={{
                      flexShrink: 0,
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      background: "var(--color-success-tint)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Check size={13} style={{ color: "#3F7A52" }} />
                  </div>
                  <div>
                    <div className="feat-title" style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 2 }}>
                      {f.title}
                    </div>
                    <div className="feat-desc" style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
                      {f.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Link
              href="/clinica"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "var(--color-primary)",
                color: "#fff",
                padding: "13px 22px",
                borderRadius: 10,
                fontSize: 14.5,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Ver médicos disponibles ahora
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ============ PARA MEDICOS ============ */}
      <section id="medicos" style={{ padding: "96px 24px", background: "var(--color-dark)", color: "#fff" }}>
        <div
          className="landing-medicos-grid"
          style={{
            maxWidth: 1080,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 64,
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#A1CEA4",
                marginBottom: 14,
              }}
            >
              Para médicos
            </div>
            <h2
              className="landing-section-title"
              style={{
                fontSize: "clamp(28px, 3vw, 40px)",
                lineHeight: 1.12,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                margin: "0 0 16px",
              }}
            >
              Tu agenda, tus pacientes, tus reglas.
            </h2>
            <p
              style={{
                fontSize: 16,
                lineHeight: 1.55,
                color: "rgba(255,255,255,0.7)",
                margin: "0 0 28px",
                maxWidth: 480,
              }}
            >
              Sumate a Docto si querés manejar tu práctica virtual sin intermediarios,
              cobrar por consulta y decidir cuándo trabajás.
            </p>

            <div className="medicos-cta-row" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link
                href="/auth/registro-medico"
                className="medicos-cta-btn"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: "#fff",
                  color: "var(--color-dark)",
                  padding: "13px 22px",
                  borderRadius: 10,
                  fontSize: 14.5,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Sumate
                <ArrowRight size={16} />
              </Link>
              <Link
                href="/auth/registro-medico"
                className="medicos-cta-btn"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  border: "1px solid rgba(255,255,255,0.2)",
                  color: "#fff",
                  padding: "13px 22px",
                  borderRadius: 10,
                  fontSize: 14.5,
                  fontWeight: 600,
                  textDecoration: "none",
                  background: "transparent",
                }}
              >
                Más info
              </Link>
            </div>
          </div>

          <div className="landing-medico-cards" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {medicoCards.map((f) => (
              <div
                key={f.title}
                className="medico-card"
                style={{
                  padding: "22px 20px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <div className="medico-card-head" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                  <div
                    className="medico-card-icon"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: "rgba(161, 206, 164, 0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <f.icon size={18} style={{ color: "#A1CEA4" }} />
                  </div>
                  <div className="medico-card-title-inline" style={{ fontSize: 14.5, fontWeight: 600, display: "none" }}>{f.title}</div>
                </div>
                <div className="medico-card-title" style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 4 }}>{f.title}</div>
                <div className="medico-card-desc" style={{ fontSize: 13, lineHeight: 1.5, color: "rgba(255,255,255,0.6)" }}>
                  {f.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />

      {/* Responsive overrides + animations */}
      <style>{`
        @keyframes landing-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .landing-pulse {
          animation: landing-pulse 1.6s infinite;
        }

        /* Mobile-only subhead hidden by default (set via inline display:none) */

        @media (max-width: 900px) {
          .landing-hero-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
          .landing-steps-grid { grid-template-columns: 1fr !important; }
          .landing-inmediata-grid { grid-template-columns: 1fr !important; gap: 48px !important; }
          .landing-medicos-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
        }

        @media (max-width: 720px) {
          /* Hero */
          .landing-hero-h1 { font-size: 32px !important; line-height: 1.08 !important; letter-spacing: -0.03em !important; }
          .hero-sub-desktop { display: none !important; }
          .hero-sub-mobile { display: block !important; }

          /* Kill device mockups */
          .landing-phone-hero { display: none !important; }
          .landing-inmediata-grid > :first-child { display: none !important; }
          .landing-inmediata-grid { grid-template-columns: 1fr !important; }

          /* Trust line vertical */
          .landing-trust-line { flex-direction: column !important; align-items: flex-start !important; gap: 10px !important; }

          /* STEPS (Cómo funciona) — número + ícono misma línea + título + descripción */
          .step-card { padding: 18px 18px 20px !important; gap: 10px !important; }
          .step-card-header { justify-content: flex-start !important; gap: 12px !important; }
          .step-card-header > span { font-size: 14px !important; }
          .step-card-header > div { width: 32px !important; height: 32px !important; border-radius: 8px !important; }
          .step-card h3 { font-size: 18px !important; margin: 4px 0 0 !important; }
          .step-card-desc {
            font-size: 14px !important; line-height: 1.45 !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 2 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
          }

          /* MÉDICOS cards — ícono inline con título */
          .landing-medico-cards { grid-template-columns: 1fr !important; gap: 10px !important; }
          .medico-card { padding: 14px 16px !important; }
          .medico-card-head { margin-bottom: 4px !important; gap: 10px !important; }
          .medico-card-icon { width: 28px !important; height: 28px !important; border-radius: 8px !important; }
          .medico-card-title-inline { display: block !important; font-size: 14px !important; }
          .medico-card-title { display: none !important; }
          .medico-card-desc { font-size: 12.5px !important; line-height: 1.4 !important; }

          /* CTAs "Sumate" + "Más info" — misma fila compactos */
          .medicos-cta-row { flex-wrap: nowrap !important; gap: 8px !important; }
          .medicos-cta-btn { padding: 10px 14px !important; font-size: 13px !important; flex: 1; justify-content: center; white-space: nowrap; }
        }

        @media (max-width: 560px) {
          .landing-hero-grid { gap: 12px !important; }
        }

        /* Scroll-snap por secciones en mobile */
        @media (max-width: 720px) {
          html { scroll-snap-type: y proximity; scroll-behavior: smooth; }
          .landing-root > section, .landing-root > footer { scroll-snap-align: start; scroll-snap-stop: always; }
        }
      `}</style>
    </div>
  );
}
