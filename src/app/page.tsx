import Link from "next/link";
import {
  ShieldCheck,
  FileText,
  Wallet,
  Check,
  ArrowRight,
  CalendarCheck,
  Users,
  Stethoscope,
} from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import LandingNav from "@/components/landing/LandingNav";
import Buscador from "@/components/landing/Buscador";
import { PhoneMockupHero, PhoneMockupInmediata, PhoneMockupTurnos } from "@/components/landing/PhoneMockup";
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

  const turnosFeatures = [
    {
      title: "Hasta 45 días de anticipación",
      description: "Planificá tu consulta cuando más te convenga.",
    },
    {
      title: "Recordatorio automático",
      description: "",
    },
    {
      title: "Cancelación flexible",
      description: "",
    },
  ];

  const inmediataFeatures = [
    {
      title: "Espera promedio 12 minutos",
      description: "Clínica Médica, Pediatría y Dermatología disponibles casi siempre.",
    },
    {
      title: "Pagás solo si te atienden",
      description: "",
    },
    {
      title: "Receta digital, indicaciones y certificado",
      description: "En tu mail y en tu perfil de Docto.",
    },
  ];

  const medicoFeatures = [
    { icon: Wallet, title: "Cobrás por consulta", description: "Sin mensualidades. Nos llevamos una comisión solo cuando atendés." },
    { icon: CalendarCheck, title: "Agenda flexible", description: "Publicás tus horarios y los cambiás cuando quieras. Vos mandás." },
    { icon: FileText, title: "Receta digital", description: "Firma electrónica con validez legal, sin papel ni trámites." },
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
                Profesionales verificados
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <FileText size={15} style={{ color: "#3F7A52" }} />
                Receta digital
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <Wallet size={15} style={{ color: "#3F7A52" }} />
                Atención directa, sin intermediarios
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

      {/* ============ CÓMO FUNCIONA — Inmediata + Turnos lado a lado ============ */}
      <section id="como-funciona" style={{ padding: "96px 24px 0", background: "var(--color-bg-secondary)", position: "relative", overflow: "hidden" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          {/* Eyebrow centrado */}
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--color-primary)",
              }}
            >
              Cómo funciona
            </div>
          </div>

          {/* Dos columnas */}
          <div className="landing-como-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48 }}>
            {/* COLUMNA IZQUIERDA — Consulta Inmediata */}
            <div>
              <div
                className="landing-pulse-badge"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 14px",
                  borderRadius: 999,
                  background: "var(--color-success-tint)",
                  color: "#3F7A52",
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 16,
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
                  fontSize: "clamp(24px, 2.5vw, 32px)",
                  lineHeight: 1.12,
                  fontWeight: 700,
                  letterSpacing: "-0.03em",
                  margin: "0 0 14px",
                }}
              >
                ¿No podés esperar?
                <br />
                Conectate con un médico <span style={{ color: "#3F7A52" }}>ahora</span>.
              </h2>

              <p
                style={{
                  fontSize: 15,
                  lineHeight: 1.55,
                  color: "var(--color-text-secondary)",
                  margin: "0 0 22px",
                }}
              >
                Médicos disponibles para atención espontánea.
                Entrás a la sala de espera y te atienden.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
                {inmediataFeatures.map((f) => (
                  <div key={f.title} style={{ display: "flex", gap: 10 }}>
                    <div
                      style={{
                        flexShrink: 0,
                        width: 20,
                        height: 20,
                        borderRadius: 999,
                        background: "var(--color-success-tint)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginTop: 1,
                      }}
                    >
                      <Check size={12} style={{ color: "#3F7A52" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: f.description ? 1 : 0 }}>
                        {f.title}
                      </div>
                      {f.description && (
                        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.45 }}>
                          {f.description}
                        </div>
                      )}
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
                  padding: "12px 20px",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: "none",
                  marginBottom: 32,
                }}
              >
                Ver médicos disponibles
                <ArrowRight size={15} />
              </Link>

              <div className="landing-phone-col" style={{ display: "flex", justifyContent: "center" }}>
                <div style={{ transform: "scale(0.72)", transformOrigin: "top center" }}>
                  <PhoneMockupInmediata />
                </div>
              </div>
            </div>

            {/* COLUMNA DERECHA — Turnos Programados */}
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 14px",
                  borderRadius: 999,
                  background: "rgba(55, 138, 221, 0.1)",
                  color: "var(--color-primary)",
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 16,
                }}
              >
                Turnos programados
              </div>

              <h2
                className="landing-section-title"
                style={{
                  fontSize: "clamp(24px, 2.5vw, 32px)",
                  lineHeight: 1.12,
                  fontWeight: 700,
                  letterSpacing: "-0.03em",
                  margin: "0 0 14px",
                }}
              >
                Elegí tu médico, reservá tu horario.
              </h2>

              <p
                style={{
                  fontSize: 15,
                  lineHeight: 1.55,
                  color: "var(--color-text-secondary)",
                  margin: "0 0 22px",
                }}
              >
                Buscá por especialidad o nombre, elegí el día y la hora que mejor te queda,
                y pagá de forma segura. Confirmación inmediata.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
                {turnosFeatures.map((f) => (
                  <div key={f.title} style={{ display: "flex", gap: 10 }}>
                    <div
                      style={{
                        flexShrink: 0,
                        width: 20,
                        height: 20,
                        borderRadius: 999,
                        background: "var(--color-success-tint)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginTop: 1,
                      }}
                    >
                      <Check size={12} style={{ color: "#1D9E75" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: f.description ? 1 : 0 }}>
                        {f.title}
                      </div>
                      {f.description && (
                        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.45 }}>
                          {f.description}
                        </div>
                      )}
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
                  padding: "12px 20px",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: "none",
                  marginBottom: 32,
                }}
              >
                Buscar turno
                <ArrowRight size={15} />
              </Link>

              <div className="landing-phone-col" style={{ display: "flex", justifyContent: "center" }}>
                <div style={{ transform: "scale(0.72)", transformOrigin: "top center" }}>
                  <PhoneMockupTurnos />
                </div>
              </div>
            </div>
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
                fontSize: 18,
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
                href="/medicos"
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
                Conocé más
              </Link>
            </div>
          </div>

          <div className="landing-medico-cards" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {medicoFeatures.map((f) => (
              <div key={f.title} style={{
                padding: "22px 20px",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 14,
                background: "rgba(255,255,255,0.03)",
              }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "rgba(161, 206, 164, 0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 14,
                  }}
                >
                  <f.icon size={18} style={{ color: "#A1CEA4" }} />
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 4 }}>{f.title}</div>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: "rgba(255,255,255,0.6)" }}>{f.description}</div>
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
          .landing-como-grid { grid-template-columns: 1fr !important; gap: 48px !important; }
          .landing-medicos-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
        }

        @media (max-width: 720px) {
          /* Hero */
          .landing-hero-h1 { font-size: 32px !important; line-height: 1.08 !important; letter-spacing: -0.03em !important; }
          .hero-sub-desktop { display: none !important; }
          .hero-sub-mobile { display: block !important; }

          /* Kill device mockups */
          .landing-phone-hero { display: none !important; }
          .landing-phone-col { display: none !important; }

          /* Trust line vertical */
          .landing-trust-line { flex-direction: column !important; align-items: flex-start !important; gap: 10px !important; }

          /* MÉDICOS cards — single column on mobile */
          .landing-medico-cards { grid-template-columns: 1fr !important; }

          /* CTAs "Sumate" + "Conocé más" — misma fila compactos */
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
