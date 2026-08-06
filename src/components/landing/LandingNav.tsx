"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

function Logo() {
  return (
    <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
      <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
        <path
          d="M13 8 L13 18 Q13 25 20 25 Q27 25 27 18 L27 8"
          stroke="#3F7A52"
          strokeWidth="2.4"
          strokeLinecap="round"
          fill="none"
        />
        <line x1="20" y1="25" x2="20" y2="30" stroke="#3F7A52" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="13" cy="7" r="2.6" fill="#378ADD" />
        <circle cx="27" cy="7" r="2.6" fill="#378ADD" />
        <circle cx="20" cy="33" r="3.2" fill="#E88B6A" />
      </svg>
      <span style={{ fontSize: 20, fontWeight: 700, color: "#111827", letterSpacing: "-0.02em" }}>
        docto
      </span>
    </Link>
  );
}

export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "rgba(255,255,255,0.9)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: scrolled ? "1px solid var(--color-border-default)" : "1px solid transparent",
          transition: "border-color 150ms ease",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "14px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Logo />
          <div className="landing-nav-links" style={{ display: "flex", alignItems: "center", gap: 28 }}>
            <a href="#como-funciona" className="landing-nav-mid" style={{ fontSize: 14, color: "var(--color-text-secondary)", fontWeight: 500 }}>
              Cómo funciona
            </a>
            <a href="#inmediata" className="landing-nav-mid" style={{ fontSize: 14, color: "var(--color-text-secondary)", fontWeight: 500 }}>
              Consulta inmediata
            </a>
            {/* Acceso para médicos SIEMPRE visible. Se ocultaba a ≤900px y en el
                celular el único botón era "Crear cuenta" → registro de PACIENTE:
                dos médicos reales (29 y 30/07) se crearon primero una cuenta de
                paciente y recién después una de médico, con otro mail
                (auditoría 06/08). En mobile el texto se acorta a "Soy médico". */}
            <Link
              href="/medicos"
              className="landing-nav-medicos"
              style={{ fontSize: 14, color: "var(--color-text-secondary)", fontWeight: 500, whiteSpace: "nowrap" }}
            >
              <span className="landing-nav-medicos-largo">Para médicos</span>
              <span className="landing-nav-medicos-corto">Soy médico</span>
            </Link>
            <Link
              href="/auth/login"
              className="landing-nav-login"
              style={{ fontSize: 14, color: "var(--color-text-secondary)", fontWeight: 500, whiteSpace: "nowrap" }}
            >
              Iniciar sesión
            </Link>
            <Link
              href="/auth/register"
              className="landing-nav-register"
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#fff",
                background: "var(--color-primary)",
                padding: "9px 16px",
                borderRadius: 8,
                whiteSpace: "nowrap",
              }}
            >
              Crear cuenta
            </Link>
          </div>
        </div>
      </nav>

      <style>{`
        .landing-nav-medicos-corto { display: none; }
        @media (max-width: 900px) {
          .landing-nav-mid { display: none !important; }
        }
        @media (max-width: 560px) {
          .landing-nav-links { gap: 10px !important; }
          .landing-nav-login { font-size: 13px !important; }
          .landing-nav-register { font-size: 12px !important; padding: 8px 12px !important; }
          .landing-nav-medicos { font-size: 13px !important; }
          .landing-nav-medicos-largo { display: none; }
          .landing-nav-medicos-corto { display: inline; }
        }
      `}</style>
    </>
  );
}
