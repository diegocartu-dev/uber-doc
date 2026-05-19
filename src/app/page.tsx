import type { Metadata } from "next";
import Link from "next/link";
import { Stethoscope, User } from "lucide-react";
import DoctoLogo from "@/components/DoctoLogo";

export const metadata: Metadata = {
  title: "Docto — Medicina sin barreras",
  description: "Plataforma de telemedicina argentina. Conectamos pacientes con médicos para consultas virtuales.",
};

export default function EntradaGeneral() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        background: "#FFFFFF",
        fontFamily: "var(--font-inter), Inter, sans-serif",
      }}
    >
      {/* Navbar */}
      <nav
        style={{
          height: 56,
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          borderBottom: "1px solid #E5E7EB",
        }}
      >
        <DoctoLogo />
      </nav>

      {/* Hero */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "0 24px",
        }}
      >
        <h1
          className="entrada-headline"
          style={{
            fontSize: 52,
            fontWeight: 700,
            color: "var(--color-text-primary)",
            textAlign: "center",
            margin: 0,
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
          }}
        >
          Medicina sin barreras.
        </h1>
        <p
          style={{
            fontSize: 19,
            color: "#6B7280",
            textAlign: "center",
            margin: "16px 0 0",
            maxWidth: 480,
            lineHeight: 1.5,
          }}
        >
          El médico que necesitás. El paciente que te necesita.
        </p>

        <div
          className="entrada-botones"
          style={{
            display: "flex",
            gap: 16,
            marginTop: 48,
          }}
        >
          <Link
            href="/medicos"
            className="entrada-btn"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              padding: "16px 32px",
              borderRadius: 8,
              backgroundColor: "#D85A30",
              color: "#FFFFFF",
              fontSize: 16,
              fontWeight: 600,
              textDecoration: "none",
              transition: "opacity 0.15s",
              minWidth: 200,
            }}
          >
            <Stethoscope size={20} strokeWidth={2} />
            Soy médico
          </Link>
          <Link
            href="/pacientes"
            className="entrada-btn"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              padding: "16px 32px",
              borderRadius: 8,
              backgroundColor: "#378ADD",
              color: "#FFFFFF",
              fontSize: 16,
              fontWeight: 600,
              textDecoration: "none",
              transition: "opacity 0.15s",
              minWidth: 200,
            }}
          >
            <User size={20} strokeWidth={2} />
            Soy paciente
          </Link>
        </div>
      </main>

      {/* Footer compacto */}
      <footer
        style={{
          minHeight: 48,
          background: "#F8F9FA",
          borderTop: "1px solid #E5E7EB",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "8px 24px",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <DoctoLogo size={16} textClass="text-sm" />
        <Link href="/terminos" style={{ fontSize: 12, color: "#6B7280", textDecoration: "none" }}>
          Términos
        </Link>
        <Link href="/privacidad" style={{ fontSize: 12, color: "#6B7280", textDecoration: "none" }}>
          Privacidad
        </Link>
        <span style={{ fontSize: 12, color: "#9CA3AF" }}>AAIP RL-2026-36086505</span>
        <a
          href="mailto:soporte@docto.com.ar"
          style={{ fontSize: 12, color: "#6B7280", textDecoration: "none" }}
        >
          soporte@docto.com.ar
        </a>
      </footer>

      <style>{`
        .entrada-btn:hover { opacity: 0.9; }
        .entrada-btn:active { transform: scale(0.97); }
        @media (max-width: 640px) {
          .entrada-headline { font-size: 36px !important; }
          .entrada-botones {
            flex-direction: column !important;
            width: 100%;
            max-width: 320px;
          }
          .entrada-btn {
            width: 100% !important;
            min-width: unset !important;
          }
        }
      `}</style>
    </div>
  );
}
