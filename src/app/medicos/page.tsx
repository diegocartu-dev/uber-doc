import Link from "next/link";
import {
  ArrowRight,
  ArrowLeft,
  Building2,
  Zap,
  Calendar,
  Sparkles,
  Check,
  FileCheck,
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

  const formasDeEjercer = [
    {
      icon: Building2,
      color: "#D85A30",
      title: "Consultorio Particular",
      description: "Tus pacientes, tu URL, tu agenda, tu precio.",
    },
    {
      icon: Zap,
      color: "#378ADD",
      title: "Consulta Inmediata",
      description: "Monetizá cualquier momento libre, desde donde estés.",
    },
    {
      icon: Calendar,
      color: "#378ADD",
      title: "Turnos Programados",
      description: "Tu agenda online. Confirmación y recordatorios automáticos. Vos solo atendés.",
    },
  ];

  const tuPlata = [
    {
      title: "El paciente paga antes de entrar a la sala.",
      description: "Vos ya cobraste antes de decir hola.",
    },
    {
      title: "Tus honorarios van directo a tu Mercado Pago.",
      description: "Docto nunca toca tu dinero.",
    },
    {
      title: "Sin abono mensual. Sin contrato. Sin letra chica.",
      description: "Solo una comisión cuando atendés.",
    },
  ];

  const pasos = [
    "Completás tu perfil (matrícula, especialidad, foto)",
    "Configurás tu agenda o activás disponibilidad",
    "Compartís tu link — tu consultorio ya existe",
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
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
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
        </div>
      </nav>

      {/* Hero */}
      <section style={{ padding: "72px 24px 80px", background: "#fff" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h1 className="medicos-hero-h1" style={{
            fontSize: "clamp(32px, 4.5vw, 52px)",
            lineHeight: 1.08,
            fontWeight: 700,
            letterSpacing: "-0.035em",
            margin: "0 0 20px",
            color: "var(--color-text-primary)",
          }}>
            Tu consultorio virtual. Tu precio. Tus pacientes.
          </h1>
          <p style={{
            fontSize: 18,
            lineHeight: 1.55,
            color: "var(--color-text-secondary)",
            margin: "0 0 32px",
            maxWidth: 600,
          }}>
            Atendé por videollamada desde donde estés. Sin abono, sin contrato.
            Tus honorarios van directo a tu Mercado Pago antes de que el paciente entre a la sala.
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

      {/* Consultorio Particular */}
      <section style={{ padding: "80px 24px", background: "#fff", borderTop: "1px solid var(--color-border-default)" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: "rgba(216, 90, 48, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}>
              <Building2 size={22} style={{ color: "#D85A30" }} />
            </div>
          </div>
          <h2 style={{
            fontSize: "clamp(26px, 3vw, 36px)",
            lineHeight: 1.12,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            margin: "0 0 16px",
            color: "var(--color-text-primary)",
          }}>
            Tu Consultorio Particular, ahora digital
          </h2>
          <p style={{
            fontSize: 17,
            lineHeight: 1.6,
            color: "var(--color-text-secondary)",
            margin: 0,
            maxWidth: 580,
          }}>
            Tus propios pacientes te buscan a vos, no a &quot;un médico disponible&quot;.
            Compartís tu link personal (docto.com.ar/dr/tu-nombre) y ellos reservan con vos
            directamente. Tu perfil, tu agenda, tu precio.
          </p>
        </div>
      </section>

      {/* 3 Formas de ejercer */}
      <section style={{ padding: "80px 24px", background: "var(--color-bg-secondary)" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h2 style={{
            fontSize: "clamp(24px, 2.8vw, 34px)",
            lineHeight: 1.15,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            margin: "0 0 40px",
            color: "var(--color-text-primary)",
          }}>
            3 formas de ejercer
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {formasDeEjercer.map((f) => (
              <div
                key={f.title}
                style={{
                  padding: "24px",
                  border: "1px solid var(--color-border-default)",
                  borderRadius: 14,
                  background: "#fff",
                  display: "flex",
                  gap: 16,
                  alignItems: "flex-start",
                }}
              >
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: `${f.color}14`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <f.icon size={20} style={{ color: f.color }} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 }}>
                    {f.title}
                  </div>
                  <div style={{ fontSize: 15, lineHeight: 1.5, color: "var(--color-text-secondary)" }}>
                    {f.description}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Nova */}
      <section style={{ padding: "80px 24px", background: "var(--color-bg-tertiary)" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
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
          </div>
          <h2 style={{
            fontSize: "clamp(24px, 2.8vw, 34px)",
            lineHeight: 1.15,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            margin: "0 0 16px",
            color: "var(--color-text-primary)",
          }}>
            Nova hace en 20 segundos lo que tardás 15 minutos
          </h2>
          <p style={{
            fontSize: 17,
            lineHeight: 1.6,
            color: "var(--color-text-secondary)",
            margin: 0,
            maxWidth: 580,
          }}>
            Dictás el diagnóstico. Nova genera la receta con validez legal, las indicaciones
            y el certificado. Con tu firma electrónica. Lista para el paciente.
            Ninguna otra plataforma argentina tiene esto.
          </p>
        </div>
      </section>

      {/* Tu plata */}
      <section style={{ padding: "80px 24px", background: "#fff" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h2 style={{
            fontSize: "clamp(24px, 2.8vw, 34px)",
            lineHeight: 1.15,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            margin: "0 0 36px",
            color: "var(--color-text-primary)",
          }}>
            Tu plata, sin intermediarios
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {tuPlata.map((item) => (
              <div key={item.title} style={{ display: "flex", gap: 14 }}>
                <div style={{
                  flexShrink: 0,
                  width: 24,
                  height: 24,
                  borderRadius: 999,
                  background: "var(--color-success-tint)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 1,
                }}>
                  <Check size={14} style={{ color: "#3F7A52" }} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 2 }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 15, lineHeight: 1.5, color: "var(--color-text-secondary)" }}>
                    {item.description}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Documentación */}
      <section style={{ padding: "80px 24px", background: "var(--color-bg-secondary)" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
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
              <FileCheck size={22} style={{ color: "#378ADD" }} />
            </div>
          </div>
          <h2 style={{
            fontSize: "clamp(24px, 2.8vw, 34px)",
            lineHeight: 1.15,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            margin: "0 0 16px",
            color: "var(--color-text-primary)",
          }}>
            El final de los papeles
          </h2>
          <p style={{
            fontSize: 17,
            lineHeight: 1.6,
            color: "var(--color-text-secondary)",
            margin: 0,
            maxWidth: 580,
          }}>
            Receta electrónica con validez nacional. Certificados, indicaciones y derivaciones.
            Todo firmado, todo descargable. El paciente los recibe automáticamente.
          </p>
        </div>
      </section>

      {/* Respaldo legal */}
      <section style={{
        padding: "24px",
        background: "var(--color-bg-tertiary)",
        borderTop: "1px solid var(--color-border-default)",
        borderBottom: "1px solid var(--color-border-default)",
      }}>
        <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: "var(--color-text-secondary)",
          }}>
            <ShieldCheck size={15} style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
            Plataforma inscripta ante la AAIP (RL-2026-36086505). Opera bajo Ley 27.553 y Decreto 63/2024.
          </div>
        </div>
      </section>

      {/* Cómo empezar */}
      <section style={{ padding: "80px 24px", background: "#fff" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h2 style={{
            fontSize: "clamp(24px, 2.8vw, 34px)",
            lineHeight: 1.15,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            margin: "0 0 36px",
            color: "var(--color-text-primary)",
          }}>
            Tres pasos y ya estás
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 40 }}>
            {pasos.map((paso, i) => (
              <div key={i} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  background: "var(--color-bg-tertiary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--color-text-secondary)",
                }}>
                  {i + 1}
                </div>
                <div style={{
                  fontSize: 16,
                  lineHeight: 1.5,
                  color: "var(--color-text-primary)",
                  paddingTop: 5,
                }}>
                  {paso}
                </div>
              </div>
            ))}
          </div>

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

      <Footer />
    </div>
  );
}
