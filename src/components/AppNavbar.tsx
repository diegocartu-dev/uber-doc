"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Stethoscope, Menu } from "lucide-react";
import MenuDrawer from "./MenuDrawer";
import { getLogoHref } from "@/lib/origin-slug";

type Props = {
  userName?: string;
  userRole?: "paciente" | "medico" | null;
  showMenu?: boolean;
  /** Override explícito para el href del logo. Si no se pasa, se calcula automáticamente. */
  logoHref?: string;
};

export default function AppNavbar({ userName, userRole, showMenu = true, logoHref }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [resolvedHref, setResolvedHref] = useState(logoHref ?? (userName ? "/dashboard" : "/"));

  useEffect(() => {
    // Si hay override explícito o es médico, no tocar
    if (logoHref || userRole === "medico") return;
    // Para pacientes, resolver desde sessionStorage
    const href = userName ? getLogoHref("/dashboard") : getLogoHref("/");
    setResolvedHref(href);
  }, [logoHref, userName, userRole]);

  return (
    <>
      <nav
        className="sticky top-0 z-50 bg-[var(--color-bg-primary)]"
        style={{ borderBottom: "1px solid var(--color-border-default)", height: 56 }}
      >
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 lg:px-6">
          <Link href={resolvedHref} className="flex items-center gap-2">
            <Stethoscope size={24} strokeWidth={2} color="var(--color-brand)" />
            <span
              className="text-lg lowercase"
              style={{ fontWeight: 700, color: "var(--color-text-primary)" }}
            >
              docto
            </span>
          </Link>

          {showMenu && userName && (
            <button
              onClick={() => setDrawerOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] transition-colors hover:bg-[var(--color-bg-tertiary)]"
              aria-label="Abrir menu"
            >
              <Menu size={20} strokeWidth={1.75} color="var(--color-text-secondary)" />
            </button>
          )}

          {!userName && (
            <div className="flex items-center gap-3">
              <Link
                href="/auth/login"
                className="text-sm font-medium"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Iniciar sesion
              </Link>
              <Link
                href="/auth/register"
                className="rounded-[var(--radius-md)] px-4 py-2 text-sm font-semibold text-white transition-colors active:scale-[0.97]"
                style={{ backgroundColor: "var(--color-primary)" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-primary-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--color-primary)")}
              >
                Registrarse
              </Link>
            </div>
          )}
        </div>
      </nav>

      {showMenu && userName && (
        <MenuDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          userName={userName}
          userRole={userRole ?? null}
        />
      )}
    </>
  );
}
