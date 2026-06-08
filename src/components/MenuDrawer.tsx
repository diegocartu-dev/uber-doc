"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { X, User, FileText, LogOut, Loader2, Shield, Users, HelpCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  open: boolean;
  onClose: () => void;
  userName: string;
  userRole: "paciente" | "medico" | null;
};

export default function MenuDrawer({ open, onClose, userName, userRole }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const drawerRef = useRef<HTMLDivElement>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [loadingHref, setLoadingHref] = useState<string | null>(null);
  const [esAdmin, setEsAdmin] = useState(false);
  const prevPathname = useRef(pathname);

  // Close drawer when pathname changes (navigation resolved)
  useEffect(() => {
    if (prevPathname.current !== pathname && loadingHref) {
      setLoadingHref(null);
      onClose();
    }
    prevPathname.current = pathname;
  }, [pathname, loadingHref, onClose]);

  // Check admin status on open
  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("admin_users")
        .select("id")
        .eq("user_id", user.id)
        .eq("activo", true)
        .maybeSingle()
        .then(({ data }) => setEsAdmin(!!data));
    });
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Prevent scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      setConfirmLogout(false);
      setLoggingOut(false);
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  async function handleLogout() {
    setLoggingOut(true);
    window.dispatchEvent(new Event("docto:voluntary-logout"));
    const supabase = createClient();
    await supabase.auth.signOut();
    onClose();
    router.push("/");
    router.refresh();
  }

  function handleNavigate(href: string) {
    if (loadingHref) return;
    setLoadingHref(href);
    router.push(href);
  }

  const initials = userName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      {/* Overlay */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.3)" }}
        onClick={loadingHref || loggingOut ? undefined : onClose}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="absolute right-0 top-0 h-full bg-white"
        style={{
          width: "min(280px, 80vw)",
          boxShadow: "var(--shadow-lg)",
          animation: "slide-in-right 200ms ease-out",
        }}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between px-5">
          <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Menú
          </span>
          <button
            onClick={onClose}
            disabled={!!loadingHref || loggingOut}
            className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] transition-colors hover:bg-[var(--color-bg-tertiary)] disabled:opacity-50"
            aria-label="Cerrar menú"
          >
            <X size={20} strokeWidth={1.75} color="var(--color-text-secondary)" />
          </button>
        </div>

        {/* Avatar + name */}
        <div className="px-5 pb-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold"
              style={{
                backgroundColor: "var(--color-bg-tertiary)",
                color: "var(--color-text-secondary)",
              }}
            >
              {initials}
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                {userName}
              </p>
              <p className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
                {userRole === "medico" ? "Profesional" : "Paciente"}
              </p>
            </div>
          </div>
        </div>

        {/* Separator */}
        <div className="mx-5 h-px" style={{ backgroundColor: "var(--color-border-subtle)" }} />

        {/* Navigation items */}
        <div className="py-2">
          <DrawerLink
            href="/mis-datos"
            icon={<User size={20} strokeWidth={1.75} />}
            label="Mis datos"
            loading={loadingHref === "/mis-datos"}
            disabled={!!loadingHref}
            onClick={() => handleNavigate("/mis-datos")}
          />

          {userRole === "paciente" && (
            <DrawerLink
              href="/mis-consultas"
              icon={<FileText size={20} strokeWidth={1.75} />}
              label="Mis consultas"
              loading={loadingHref === "/mis-consultas"}
              disabled={!!loadingHref}
              onClick={() => handleNavigate("/mis-consultas")}
            />
          )}

          {userRole === "medico" && (
            <DrawerLink
              href="/medico/historial"
              icon={<Users size={20} strokeWidth={1.75} />}
              label="Mis pacientes"
              loading={loadingHref === "/medico/historial"}
              disabled={!!loadingHref}
              onClick={() => handleNavigate("/medico/historial")}
            />
          )}

          <a
            href="mailto:soporte@docto.com.ar?subject=Ayuda Docto"
            onClick={onClose}
            className="flex w-full items-center gap-3 px-5 transition-colors hover:bg-gray-50"
            style={{ minHeight: 48, color: "var(--color-text-primary)" }}
          >
            <HelpCircle size={20} strokeWidth={1.75} />
            <span className="text-sm font-medium">Ayuda</span>
          </a>
        </div>

        {/* Admin link */}
        {esAdmin && (
          <>
            <div className="mx-5 h-px" style={{ backgroundColor: "var(--color-border-subtle)" }} />
            <div className="py-2">
              <DrawerLink
                href="/admin"
                icon={<Shield size={20} strokeWidth={1.75} />}
                label="Panel Admin"
                loading={loadingHref === "/admin"}
                disabled={!!loadingHref}
                onClick={() => handleNavigate("/admin")}
              />
            </div>
          </>
        )}

        {/* Separator */}
        <div className="mx-5 h-px" style={{ backgroundColor: "var(--color-border-subtle)" }} />

        {/* Logout */}
        <div className="py-2">
          {!confirmLogout ? (
            <button
              onClick={() => setConfirmLogout(true)}
              disabled={!!loadingHref}
              className="flex w-full items-center gap-3 px-5 transition-colors hover:bg-[var(--color-danger-soft)] disabled:opacity-50"
              style={{ minHeight: 48, color: "var(--color-danger)" }}
            >
              <LogOut size={20} strokeWidth={1.75} />
              <span className="text-sm font-medium">Cerrar sesión</span>
            </button>
          ) : (
            <div className="px-5 py-3">
              <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                ¿Seguro que querés cerrar sesión?
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] py-2 text-sm font-semibold text-white transition-colors disabled:opacity-70"
                  style={{ backgroundColor: "var(--color-danger)" }}
                >
                  {loggingOut && <Loader2 size={16} className="animate-spin" />}
                  {loggingOut ? "Saliendo..." : "Sí, salir"}
                </button>
                <button
                  onClick={() => setConfirmLogout(false)}
                  disabled={loggingOut}
                  className="flex-1 rounded-[var(--radius-md)] py-2 text-sm font-medium transition-colors disabled:opacity-50"
                  style={{
                    border: "1px solid var(--color-border-strong)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slide-in-right {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

function DrawerLink({
  href,
  icon,
  label,
  loading,
  disabled,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 px-5 transition-colors hover:bg-[var(--color-bg-tertiary)] disabled:pointer-events-none ${loading ? "opacity-70" : ""}`}
      style={{ minHeight: 48, color: "var(--color-text-secondary)" }}
    >
      {loading ? <Loader2 size={20} strokeWidth={1.75} className="animate-spin" /> : icon}
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}
