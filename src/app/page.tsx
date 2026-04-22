import Link from "next/link";
import {
  ShieldCheck, FileText, Wallet, Search, CalendarCheck, Video,
  Check, ArrowRight, Stethoscope,
} from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import LandingNav from "@/components/landing/LandingNav";
import LandingBuscador from "@/components/landing/LandingBuscador";

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

  const trustItems = [
    { icon: ShieldCheck, text: "Matrícula verificada" },
    { icon: FileText, text: "Recetas con validez legal" },
    { icon: Wallet, text: "Sin obra social de por medio" },
  ];

  const metrics = [
    { n: "+450", l: "médicos con matrícula verificada" },
    { n: "22", l: "especialidades" },
    { n: "18 min", l: "tiempo promedio de espera" },
    { n: "4.8/5", l: "calificación de pacientes" },
  ];

  const steps = [
    {
      n: "01", icon: Search,
      t: "Elegí especialidad",
      d: "Buscá por especialidad, síntoma o nombre del profesional. Filtrá por disponibilidad inmediata o reservá turno programado.",
    },
    {
      n: "02", icon: CalendarCheck,
      t: "Reservá y pagá",
      d: "Elegí un horario en la agenda del médico. Pagás con tarjeta — sin pasar por tu obra social. Recibís confirmación al toque.",
    },
    {
      n: "03", icon: Video,
      t: "Consulta por video",
      d: "A la hora del turno, entrás a la sala de espera desde el navegador o la app. Si hay receta, queda lista en \"Mis documentos\".",
    },
  ];

  const inmediataFeatures = [
    { t: "Espera promedio 12 minutos", d: "Clínica Médica, Pediatría y Dermatología disponibles casi siempre." },
    { t: "Pagás solo si te atienden", d: "Si ningún médico toma tu consulta en 30 min, se te reintegra automáticamente." },
    { t: "Receta al instante", d: "Si el médico indica medicación, queda firmada digitalmente en \"Mis documentos\"." },
  ];

  const medicoFeatures = [
    { icon: "wallet", n: "Cobrás por consulta", d: "Sin mensualidades. Nos llevamos una comisión solo cuando atendés." },
    { icon: "calendar", n: "Agenda flexible", d: "Publicás tus horarios y los cambiás cuando quieras. Vos mandás." },
    { icon: "file-text", n: "Receta digital", d: "Firma electrónica con validez legal, sin papel ni trámites." },
    { icon: "users", n: "Pacientes verificados", d: "DNI + cobertura confirmados antes de reservar turno." },
  ];

  const footerCols = [
    { t: "Pacientes", links: ["Buscar médico", "Consulta inmediata", "Mis consultas", "Ayuda"] },
    { t: "Médicos", links: ["Sumate a Docto", "Cómo cobramos", "Panel profesional", "Receta digital"] },
    { t: "Empresa", links: ["Sobre nosotros", "Blog", "Prensa", "Contacto"] },
    { t: "Legal", links: ["Términos", "Privacidad", "Aviso médico", "Política de reembolsos"] },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <LandingNav />

      {/* ===== HERO ===== */}
      <section style={{ padding: "56px 24px 72px", background: "#fff" }}>
        <div
          className="landing-hero-grid"
          style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 48, alignItems: "center" }}
        >
          <div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "6px 12px", borderRadius: 999,
              background: "var(--color-success-soft)", color: "var(--color-success)",
              fontSize: 12, fontWeight: 600, marginBottom: 24,
            }}>
              <span className="landing-pulse-dot" style={{
                width: 7, height: 7, borderRadius: "50%",
                background: "var(--color-success)",
              }} />
              124 médicos disponibles ahora
            </div>

            <h1 style={{
              fontSize: "clamp(40px, 5.4vw, 64px)",
              lineHeight: 1.05, fontWeight: 700, letterSpacing: "-0.035em",
              margin: "0 0 20px", color: "var(--color-text-primary)",
            }}>
              El médico que necesitás,
              <br />
              <span style={{ color: "var(--color-primary)" }}>cuando lo necesitás</span>.
            </h1>

            <p style={{
              fontSize: 18, lineHeight: 1.55,
              color: "var(--color-text-secondary)", margin: "0 0 28px", maxWidth: 560,
            }}>
              Reservá turno con médicos con matrícula verificada y recibí tu receta con validez legal. Desde donde estés, sin obra social de por medio.
            </p>

            <div style={{ marginBottom: 18 }}>
              <LandingBuscador />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap", fontSize: 13, color: "var(--color-text-secondary)" }}>
              {trustItems.map((item, i) => (
                <span key={i} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <item.icon size={15} strokeWidth={1.75} style={{ color: "#3F7A52" }} />
                  {item.text}
                </span>
              ))}
            </div>
          </div>

          {/* Phone mockup */}
          <div style={{ display: "flex", justifyContent: "center", position: "relative" }}>
            <div style={{
              position: "absolute", inset: "-40px -20px",
              background: "radial-gradient(circle at 60% 40%, rgba(161, 206, 164, 0.35), transparent 60%)",
              zIndex: 0, borderRadius: "50%",
            }} />
            <div style={{ position: "relative", zIndex: 1 }}>
              <PhoneMockup>
                <PhoneScreenHero />
              </PhoneMockup>
            </div>
          </div>
        </div>
      </section>

      {/* ===== METRICS BAR ===== */}
      <section style={{
        padding: "20px 24px",
        borderTop: "1px solid var(--color-border-default)",
        borderBottom: "1px solid var(--color-border-default)",
        background: "#fff",
      }}>
        <div
          className="landing-metrics-grid"
          style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 32 }}
        >
          {metrics.map((m, i) => (
            <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--color-text-primary)" }}>{m.n}</div>
              <div style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.3 }}>{m.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== CÓMO FUNCIONA ===== */}
      <section id="como-funciona" style={{ padding: "96px 24px", background: "#fff" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ maxWidth: 640, marginBottom: 56 }}>
            <div style={{
              fontSize: 12, fontWeight: 600, letterSpacing: "0.08em",
              textTransform: "uppercase" as const, color: "var(--color-primary)", marginBottom: 14,
            }}>
              Cómo funciona
            </div>
            <h2 style={{
              fontSize: "clamp(30px, 3.2vw, 42px)", lineHeight: 1.1,
              fontWeight: 700, letterSpacing: "-0.03em", margin: "0 0 14px",
              color: "var(--color-text-primary)",
            }}>
              De la búsqueda al turno en menos de 2 minutos.
            </h2>
            <p style={{ fontSize: 16, lineHeight: 1.55, color: "var(--color-text-secondary)", margin: 0 }}>
              Sin derivaciones, sin autorizaciones, sin llamadas. Tres pasos y hablás con un médico.
            </p>
          </div>

          <div
            className="landing-steps-grid"
            style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}
          >
            {steps.map((s, i) => (
              <div key={i} style={{
                padding: "28px 26px 30px",
                border: "1px solid var(--color-border-default)",
                borderRadius: 16, background: "#fff",
                display: "flex", flexDirection: "column", gap: 14,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{
                    fontSize: 13, fontWeight: 600,
                    color: "var(--color-text-tertiary)", letterSpacing: "0.05em",
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {s.n} / 03
                  </span>
                  <div style={{
                    width: 42, height: 42, borderRadius: 10,
                    background: "var(--color-bg-tertiary)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <s.icon size={20} strokeWidth={1.75} style={{ color: "var(--color-primary)" }} />
                  </div>
                </div>
                <h3 style={{
                  fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em",
                  margin: "8px 0 0", color: "var(--color-text-primary)",
                }}>
                  {s.t}
                </h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--color-text-secondary)", margin: 0 }}>
                  {s.d}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CONSULTA INMEDIATA ===== */}
      <section id="inmediata" style={{
        padding: "96px 24px",
        background: "var(--color-bg-secondary)",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: -120, right: -120,
          width: 480, height: 480, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(161, 206, 164, 0.25), transparent 65%)",
          pointerEvents: "none",
        }} />

        <div
          className="landing-inmediata-grid"
          style={{
            maxWidth: 1200, margin: "0 auto",
            display: "grid", gridTemplateColumns: "0.9fr 1.1fr",
            gap: 64, alignItems: "center", position: "relative",
          }}
        >
          <div style={{ display: "flex", justifyContent: "center" }}>
            <PhoneMockup>
              <PhoneScreenInmediata />
            </PhoneMockup>
          </div>

          <div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "6px 12px", borderRadius: 999,
              background: "var(--color-success-soft)", color: "var(--color-success)",
              fontSize: 12, fontWeight: 600, marginBottom: 20,
            }}>
              <span className="landing-pulse-dot" style={{
                width: 7, height: 7, borderRadius: "50%",
                background: "var(--color-success)",
              }} />
              Consulta inmediata
            </div>

            <h2 style={{
              fontSize: "clamp(30px, 3.2vw, 42px)", lineHeight: 1.1,
              fontWeight: 700, letterSpacing: "-0.03em", margin: "0 0 18px",
              color: "var(--color-text-primary)",
            }}>
              ¿No podés esperar?<br />Conectate con un médico <span style={{ color: "var(--color-success)" }}>ahora</span>.
            </h2>

            <p style={{
              fontSize: 17, lineHeight: 1.55, color: "var(--color-text-secondary)",
              margin: "0 0 28px", maxWidth: 520,
            }}>
              Médicos de guardia virtual listos para atenderte. Entrás a la sala de espera, te atiende el primero disponible, y si hace falta te lleva la receta al toque.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 32 }}>
              {inmediataFeatures.map((f, i) => (
                <div key={i} style={{ display: "flex", gap: 12 }}>
                  <div style={{
                    flexShrink: 0, width: 22, height: 22, borderRadius: 999,
                    background: "#E9F4EA",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Check size={13} strokeWidth={2.5} style={{ color: "#3F7A52" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 2 }}>{f.t}</div>
                    <div style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>{f.d}</div>
                  </div>
                </div>
              ))}
            </div>

            <Link
              href="/clinica"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                background: "var(--color-primary)", color: "#fff",
                padding: "13px 22px", borderRadius: 10, fontSize: 14.5, fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Ver médicos disponibles ahora
              <ArrowRight size={16} strokeWidth={2} />
            </Link>
          </div>
        </div>
      </section>

      {/* ===== PARA MÉDICOS ===== */}
      <section id="medicos" style={{ padding: "96px 24px", background: "#0F1720", color: "#fff" }}>
        <div
          className="landing-medicos-grid"
          style={{
            maxWidth: 1080, margin: "0 auto",
            display: "grid", gridTemplateColumns: "1fr 1fr",
            gap: 64, alignItems: "center",
          }}
        >
          <div>
            <div style={{
              fontSize: 12, fontWeight: 600, letterSpacing: "0.08em",
              textTransform: "uppercase" as const, color: "#A1CEA4", marginBottom: 14,
            }}>
              Para médicos
            </div>
            <h2 style={{
              fontSize: "clamp(28px, 3vw, 40px)", lineHeight: 1.12,
              fontWeight: 700, letterSpacing: "-0.03em", margin: "0 0 16px",
            }}>
              Tu agenda, tus pacientes, tus reglas.
            </h2>
            <p style={{
              fontSize: 16, lineHeight: 1.55, color: "rgba(255,255,255,0.7)",
              margin: "0 0 28px", maxWidth: 480,
            }}>
              Sumate a Docto si querés manejar tu práctica virtual sin intermediarios, cobrar por consulta y decidir cuándo trabajás.
            </p>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link
                href="/auth/registro-medico"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  background: "#fff", color: "#0F1720",
                  padding: "13px 22px", borderRadius: 10, fontSize: 14.5, fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Sumate a Docto
                <ArrowRight size={16} strokeWidth={2} />
              </Link>
              <a
                href="mailto:soporte@docto.com.ar"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  border: "1px solid rgba(255,255,255,0.2)", color: "#fff",
                  padding: "13px 22px", borderRadius: 10, fontSize: 14.5, fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Más información
              </a>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {medicoFeatures.map((f, i) => (
              <div key={i} style={{
                padding: "22px 20px",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 14,
                background: "rgba(255,255,255,0.03)",
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: "rgba(161, 206, 164, 0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginBottom: 14,
                }}>
                  <MedicoIcon name={f.icon} />
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 4 }}>{f.n}</div>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: "rgba(255,255,255,0.6)" }}>{f.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer style={{
        background: "var(--color-bg-tertiary)", padding: "64px 24px 32px",
        borderTop: "1px solid var(--color-border-default)",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div
            className="landing-footer-grid"
            style={{ display: "grid", gridTemplateColumns: "1.4fr repeat(4, 1fr)", gap: 40, marginBottom: 48 }}
          >
            <div>
              <div className="flex items-center gap-2">
                <Stethoscope size={24} strokeWidth={2} color="var(--color-brand)" />
                <span style={{ fontSize: 20, fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.02em" }} className="lowercase">
                  docto
                </span>
              </div>
              <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--color-text-secondary)", margin: "16px 0 20px", maxWidth: 280 }}>
                Plataforma de telemedicina argentina. Conectamos pacientes con médicos para consultas virtuales.
              </p>
            </div>
            {footerCols.map((c, i) => (
              <div key={i}>
                <div style={{
                  fontSize: 12, fontWeight: 600, letterSpacing: "0.06em",
                  textTransform: "uppercase" as const, color: "var(--color-text-tertiary)", marginBottom: 14,
                }}>
                  {c.t}
                </div>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                  {c.links.map((l, j) => (
                    <li key={j}>
                      <a href="#" style={{ fontSize: 13.5, color: "var(--color-text-secondary)" }}>{l}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div style={{
            borderTop: "1px solid var(--color-border-default)", paddingTop: 22,
            display: "flex", justifyContent: "space-between", alignItems: "center",
            flexWrap: "wrap", gap: 14,
          }}>
            <div style={{ fontSize: 12.5, color: "var(--color-text-tertiary)" }}>
              © 2026 Docto Telemedicina S.A.S. · Buenos Aires, Argentina · CUIT 30-71654321-0
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", display: "flex", gap: 14, alignItems: "center" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <ShieldCheck size={13} strokeWidth={1.75} />
                Superintendencia de Servicios de Salud
              </span>
              <span>·</span>
              <span>Hecho en Argentina</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ===== HELPER COMPONENTS (server-rendered) ===== */

function MedicoIcon({ name }: { name: string }) {
  const iconMap: Record<string, React.FC<{ size: number; strokeWidth: number; style: React.CSSProperties }>> = {
    wallet: Wallet,
    calendar: CalendarCheck,
    "file-text": FileText,
    users: ShieldCheck,
  };
  const Icon = iconMap[name] || FileText;
  return <Icon size={18} strokeWidth={1.75} style={{ color: "#A1CEA4" }} />;
}

function PhoneMockup({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      width: 280, height: 580,
      background: "#0F1720",
      borderRadius: 40, padding: 8,
      boxShadow: "0 30px 60px -20px rgba(15,23,32,0.25), 0 18px 30px -15px rgba(15,23,32,0.18)",
    }}>
      <div style={{
        width: "100%", height: "100%", background: "#fff",
        borderRadius: 34, overflow: "hidden", position: "relative",
      }}>
        <div style={{
          position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
          width: 100, height: 28, background: "#0F1720", borderRadius: 999, zIndex: 2,
        }} />
        {children}
      </div>
    </div>
  );
}

function PhoneScreenHero() {
  const cards = [
    { label: "Cardiología", status: "Disponible", dotColor: "var(--color-success)" },
    { label: "Neurología", status: "Con espera", dotColor: "#BA7517" },
    { label: "Pediatría", status: "Disponible", dotColor: "var(--color-success)" },
    { label: "Oftalmología", status: "Disponible", dotColor: "var(--color-success)" },
    { label: "Clínica Médica", status: "Disponible", dotColor: "var(--color-success)" },
    { label: "Nutrición", status: "Programada", dotColor: "#D85A30" },
  ];

  return (
    <div style={{ padding: "52px 18px 20px", height: "100%", background: "#F8F9FA" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 4, letterSpacing: "-0.01em" }}>Hola, Malena</div>
      <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 16 }}>¿Con qué te podemos ayudar hoy?</div>

      <div style={{
        background: "#fff", borderRadius: 10, padding: "10px 12px",
        border: "1px solid #E5E7EB", display: "flex", alignItems: "center", gap: 8, marginBottom: 14,
      }}>
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#9CA3AF" }} />
        <span style={{ fontSize: 10, color: "#9CA3AF" }}>Buscar especialidad</span>
      </div>

      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" as const, color: "#9CA3AF", marginBottom: 8 }}>
        Clínica virtual
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {cards.map((c, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 8, padding: "10px", border: "1px solid #E5E7EB" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <Stethoscope size={14} strokeWidth={1.75} style={{ color: "var(--color-primary)" }} />
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.dotColor, display: "inline-block" }} />
            </div>
            <div style={{ fontSize: 9, fontWeight: 600, color: "#111827" }}>{c.label}</div>
            <div style={{ fontSize: 8, color: "#9CA3AF" }}>{c.status}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PhoneScreenInmediata() {
  return (
    <div style={{ padding: "52px 16px 16px", height: "100%", background: "#F8F9FA" }}>
      <div style={{
        background: "#fff", borderRadius: 12, padding: 14,
        border: "1.5px solid var(--color-success-border)",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        marginBottom: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <span className="landing-pulse-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--color-success)" }} />
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "var(--color-success)" }}>
            Disponible ahora
          </span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%", background: "#F1F3F5",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 600, color: "#4B5563",
          }}>MR</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>Dra. Martina Ríos</div>
            <div style={{ fontSize: 10, color: "#9CA3AF" }}>Clínica Médica · MP 48129</div>
          </div>
        </div>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginTop: 10, paddingTop: 10, borderTop: "1px solid #F0F0EF",
        }}>
          <div style={{ fontSize: 10, color: "#4B5563" }}>Espera estimada</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#111827" }}>~4 min</div>
        </div>
        <div style={{
          width: "100%", marginTop: 10, background: "var(--color-primary)", color: "#fff",
          borderRadius: 8, padding: "9px 0", fontSize: 11, fontWeight: 600, textAlign: "center" as const,
        }}>
          Consultar ahora
        </div>
      </div>

      {[
        { n: "Dr. Tomás Vera", e: "Clínica Médica", w: "~12 min", avail: true },
        { n: "Dra. Elena Sosa", e: "Pediatría", w: "~8 min", avail: true },
        { n: "Dr. Pablo Acuña", e: "Dermatología", w: "En 18:30", avail: false },
      ].map((m, i) => (
        <div key={i} style={{
          background: "#fff", borderRadius: 10, padding: 10,
          border: "1px solid #E5E7EB", marginBottom: 8,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: m.avail ? "var(--color-success)" : "#BA7517",
            display: "inline-block",
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.n}</div>
            <div style={{ fontSize: 9, color: "#9CA3AF" }}>{m.e}</div>
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, color: m.avail ? "var(--color-success)" : "#BA7517" }}>{m.w}</div>
        </div>
      ))}
    </div>
  );
}
