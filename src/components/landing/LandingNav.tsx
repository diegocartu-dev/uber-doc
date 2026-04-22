"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Stethoscope } from "lucide-react";

export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(255,255,255,0.9)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: scrolled ? "1px solid var(--color-border-default)" : "1px solid transparent",
        transition: "border-color 150ms ease",
      }}
    >
      <div
        style={{
          maxWidth: 1200, margin: "0 auto", padding: "14px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}
      >
        <Link href="/" className="flex items-center gap-2">
          <Stethoscope size={24} strokeWidth={2} color="var(--color-brand)" />
          <span style={{ fontSize: 20, fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.02em" }} className="lowercase">
            docto
          </span>
        </Link>

        <div className="landing-nav-links" style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <a href="#como-funciona" className="landing-nav-link" style={{ fontSize: 14, color: "var(--color-text-secondary)", fontWeight: 500 }}>
            Cómo funciona
          </a>
          <a href="#inmediata" className="landing-nav-link" style={{ fontSize: 14, color: "var(--color-text-secondary)", fontWeight: 500 }}>
            Consulta inmediata
          </a>
          <a href="#medicos" className="landing-nav-link" style={{ fontSize: 14, color: "var(--color-text-secondary)", fontWeight: 500 }}>
            Para médicos
          </a>
          <Link href="/auth/login" style={{ fontSize: 14, color: "var(--color-text-secondary)", fontWeight: 500 }}>
            Iniciar sesión
          </Link>
          <Link
            href="/auth/register"
            style={{
              fontSize: 13, fontWeight: 600, color: "#fff",
              background: "var(--color-primary)",
              padding: "9px 16px", borderRadius: 8,
              textDecoration: "none",
            }}
          >
            Crear cuenta
          </Link>
        </div>
      </div>
    </nav>
  );
}
