import Link from "next/link";
import {
  ArrowRight,
  ArrowLeft,
  Building2,
  Zap,
  Calendar,
  Sparkles,
  Check,
  Wallet,
  ShieldCheck,
} from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Footer from "@/components/Footer";

export default async function MedicosLanding() {
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
  }

  const formas = [
    {
      icon: Building2,
      color: "#D85A30",
      promesaColor: "#D85A30",
      title: "Consultorio Particular",
      promesa: "Tus pacientes te eligen a vos, no a \u201Cun médico disponible\u201D",
      descripcion: "Tu link personal, tu perfil, tu agenda, tus honorarios.",
    },
    {
      icon: Zap,
      color: "#378ADD",
      promesaColor: "#1D9E75",
      title: "Consulta Inmediata",
      promesa: "Prendés un switch y empezás a generar ingresos",
      descripcion: "Activás disponibilidad cuando tenés tiempo libre. Los pacientes te encuentran.",
    },
    {
      icon: Calendar,
      color: "#378ADD",
      promesaColor: "#378ADD",
      title: "Turnos Programados",
      promesa: "Tu agenda, tu ritmo, tus horarios disponibles al mundo",
      descripcion: "Confirmación y recordatorios automáticos. Vos solo atendés.",
    },
  ];

  const checks = [
    "Tus honorarios van directo a tu Mercado Pago.",
    "Docto nunca toca tu dinero.",
    "Sin abono. Sin contrato. Sin letra chica. Solo una comisión cuando atendés.",
  ];

  const pasos = [
    "Completás tu perfil (matrícula, especialidad, foto)",
    "Nova te ayuda a configurar tu agenda — solo contale cuándo querés trabajar",
    "Compartís tu link — tus pacientes ya pueden encontrarte",
  ];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#fff", overflowX: "hidden" }}>
      {/* Nav */}
      <nav style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(255,255,255,0.9)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--color-border-default)",
      }}>
        <div style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
            <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
              <path d="M13 8 L13 18 Q13 25 20 25 Q27 25 27 18 L27 8" stroke="#3F7A52" strokeWidth="2.4" strokeLinecap="round" fill="none"/>
              <line x1="20" y1="25" x2="20" y2="30" stroke="#3F7A52" strokeWidth="2.4" strokeLinecap="round"/>
              <circle cx="13" cy="7" r="2.6" fill="#378ADD"/>
              <circle cx="27" cy="7" r="2.6" fill="#378ADD"/>
              <circle cx="20" cy="33" r="3.2" fill="#E88B6A"/>
            </svg>
            <span style={{ fontSize: 20, fontWeight: 700, color: "#111827", letterSpacing: "-0.02em" }}>docto</span>
          </Link>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 14,
              color: "var(--color-text-secondary)",
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            <ArrowLeft size={15} />
            Volver
          </Link>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section style={{ padding: "80px 24px 88px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h1 className="medicos-hero-h1" style={{
            fontSize: "clamp(36px, 5vw, 56px)",
            lineHeight: 1.06,
            fontWeight: 700,
            letterSpacing: "-0.035em",
            margin: "0 0 24px",
            color: "var(--color-text-primary)",
          }}>
            Monetizá tu tiempo libre.{"\n"}
            Ejercé en tus términos.
          </h1>
          <p style={{
            fontSize: 18,
            lineHeight: 1.6,
            color: "var(--color-text-secondary)",
            margin: "0 0 36px",
            maxWidth: 560,
          }}>
            Sin obra social de por medio. Sin abono mensual.
            Sin nadie que te fije el precio. Tus honorarios
            van directo a tu Mercado Pago antes de que el
            paciente entre a la sala.
          </p>
          <Link
            href="/auth/registro-medico"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "#378ADD",
              color: "#fff",
              padding: "14px 28px",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Registrarme gratis
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* ─── 3 FORMAS DE EJERCER ─── */}
      <section style={{ padding: "80px 24px", background: "var(--color-bg-secondary)", borderTop: "1px solid var(--color-border-default)" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <h2 style={{
            fontSize: "clamp(24px, 3vw, 34px)",
            lineHeight: 1.15,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            margin: "0 0 44px",
            color: "var(--color-text-primary)",
            textAlign: "center",
          }}>
            Tres formas de ejercer, una sola plataforma
          </h2>

          <div className="medicos-formas-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
            {formas.map((f) => (
              <div
                key={f.title}
                style={{
                  padding: 24,
                  border: "1px solid var(--color-border-default)",
                  borderRadius: 14,
                  background: "#fff",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: `${f.color}14`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 16,
                }}>
                  <f.icon size={22} style={{ color: f.color }} />
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 6 }}>
                  {f.title}
                </div>
                <div style={{ fontSize: 15, fontWeight: 500, color: f.promesaColor, lineHeight: 1.4, marginBottom: 10 }}>
                  {f.promesa}
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.55, color: "var(--color-text-secondary)" }}>
                  {f.descripcion}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── NOVA + TU PLATA ─── */}
      <section style={{ padding: "80px 24px", background: "#F8F9FA" }}>
        <div className="medicos-nova-grid" style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
          {/* Nova */}
          <div className="medicos-nova-col" style={{ paddingRight: 40, borderRight: "1px solid var(--color-border-default)" }}>
            <div style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#378ADD",
              marginBottom: 12,
            }}>
              Tu asistente permanente
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: "rgba(55, 138, 221, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}>
                <Sparkles size={22} style={{ color: "#378ADD" }} />
              </div>
              <h3 style={{
                fontSize: "clamp(20px, 2.2vw, 26px)",
                lineHeight: 1.2,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                margin: 0,
                color: "var(--color-text-primary)",
              }}>
                Nova trabaja mientras vos atendés
              </h3>
            </div>
            <div style={{ fontSize: 15, lineHeight: 1.65, color: "var(--color-text-secondary)" }}>
              <p style={{ margin: "0 0 14px" }}>
                Dictás el diagnóstico en voz alta.
                Nova genera la receta con validez legal,
                las indicaciones y el certificado — todo
                con tu firma electrónica. El paciente los
                recibe automáticamente.
              </p>
              <p style={{ margin: 0 }}>
                La burocracia que te robaba 2 horas por día,
                resuelta en 20 segundos.
              </p>
              <p style={{ margin: "10px 0 0", fontWeight: 600, color: "var(--color-text-primary)", fontSize: 14 }}>
                Ninguna plataforma argentina tiene esto.
              </p>
            </div>
          </div>

          {/* Tu plata */}
          <div className="medicos-plata-col" style={{ paddingLeft: 40 }}>
            <div style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#1D9E75",
              marginBottom: 12,
            }}>
              Tus honorarios
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: "rgba(29, 158, 117, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}>
                <Wallet size={22} style={{ color: "#1D9E75" }} />
              </div>
              <h3 style={{
                fontSize: "clamp(20px, 2.2vw, 26px)",
                lineHeight: 1.2,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                margin: 0,
                color: "var(--color-text-primary)",
              }}>
                El paciente paga antes de entrar. Vos ya cobraste antes de decir hola.
              </h3>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 8 }}>
              {checks.map((item) => (
                <div key={item} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{
                    flexShrink: 0,
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    background: "rgba(29, 158, 117, 0.12)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: 2,
                  }}>
                    <Check size={13} style={{ color: "#1D9E75" }} />
                  </div>
                  <div style={{ fontSize: 15, lineHeight: 1.55, color: "var(--color-text-secondary)" }}>
                    {item}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── CIERRE + CTA ─── */}
      <section style={{ padding: "80px 24px 72px", background: "#fff", borderTop: "1px solid var(--color-border-default)" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h2 style={{
            fontSize: "clamp(24px, 3vw, 34px)",
            lineHeight: 1.15,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            margin: "0 0 40px",
            color: "var(--color-text-primary)",
            textAlign: "center",
          }}>
            Tres pasos y tu consultorio virtual ya existe
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 22, marginBottom: 48, maxWidth: 520, margin: "0 auto 48px" }}>
            {pasos.map((paso, i) => (
              <div key={i} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  background: "var(--color-bg-tertiary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  fontSize: 15,
                  fontWeight: 700,
                  color: "var(--color-text-secondary)",
                }}>
                  {i + 1}
                </div>
                <div style={{
                  fontSize: 16,
                  lineHeight: 1.5,
                  color: "var(--color-text-primary)",
                  paddingTop: 6,
                }}>
                  {paso}
                </div>
              </div>
            ))}
          </div>

          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <Link
              href="/auth/registro-medico"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "#378ADD",
                color: "#fff",
                padding: "16px 40px",
                borderRadius: 8,
                fontSize: 16,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Registrarme gratis
              <ArrowRight size={16} />
            </Link>
          </div>

          <div style={{ textAlign: "center" }}>
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: "var(--color-text-tertiary)",
            }}>
              <ShieldCheck size={14} style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
              Plataforma inscripta ante la AAIP (RL-2026-36086505). Opera bajo Ley 27.553 y Decreto 63/2024.
            </div>
          </div>
        </div>
      </section>

      <Footer />

      <style>{`
        .medicos-hero-h1 { white-space: pre-line; }
        @media (max-width: 840px) {
          .medicos-formas-grid {
            grid-template-columns: 1fr !important;
            max-width: 480px !important;
            margin: 0 auto !important;
          }
          .medicos-nova-grid {
            grid-template-columns: 1fr !important;
          }
          .medicos-nova-col {
            padding-right: 0 !important;
            border-right: none !important;
            padding-bottom: 36px !important;
            border-bottom: 1px solid var(--color-border-default) !important;
          }
          .medicos-plata-col {
            padding-left: 0 !important;
            padding-top: 36px !important;
          }
        }
      `}</style>
    </div>
  );
}
