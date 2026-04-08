"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, User, FileText, MessageCircle, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  open: boolean;
  onClose: () => void;
  userName: string;
  userRole: "paciente" | "medico" | null;
};

export default function MenuDrawer({ open, onClose, userName, userRole }: Props) {
  const router = useRouter();
  const drawerRef = useRef<HTMLDivElement>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

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
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    onClose();
    router.push("/");
    router.refresh();
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
        onClick={onClose}
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
            Menu
          </span>
          <button
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] transition-colors hover:bg-[var(--color-bg-tertiary)]"
            aria-label="Cerrar menu"
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
          <DrawerLink href="/mis-datos" icon={<User size={20} strokeWidth={1.75} />} label="Mis datos" onClick={onClose} />

          {userRole === "paciente" && (
            <>
              <DrawerLink href="/mis-consultas" icon={<FileText size={20} strokeWidth={1.75} />} label="Mis consultas" onClick={onClose} />
              <DrawerLink href="/medico/nova" icon={<MessageCircle size={20} strokeWidth={1.75} />} label="Hablar con Nova" onClick={onClose} />
            </>
          )}
        </div>

        {/* Separator */}
        <div className="mx-5 h-px" style={{ backgroundColor: "var(--color-border-subtle)" }} />

        {/* Logout */}
        <div className="py-2">
          {!confirmLogout ? (
            <button
              onClick={() => setConfirmLogout(true)}
              className="flex w-full items-center gap-3 px-5 transition-colors hover:bg-[var(--color-danger-soft)]"
              style={{ minHeight: 48, color: "var(--color-danger)" }}
            >
              <LogOut size={20} strokeWidth={1.75} />
              <span className="text-sm font-medium">Cerrar sesion</span>
            </button>
          ) : (
            <div className="px-5 py-3">
              <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                Seguro que queres cerrar sesion?
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleLogout}
                  className="flex-1 rounded-[var(--radius-md)] py-2 text-sm font-semibold text-white transition-colors"
                  style={{ backgroundColor: "var(--color-danger)" }}
                >
                  Si, salir
                </button>
                <button
                  onClick={() => setConfirmLogout(false)}
                  className="flex-1 rounded-[var(--radius-md)] py-2 text-sm font-medium transition-colors"
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
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 px-5 transition-colors hover:bg-[var(--color-bg-tertiary)]"
      style={{ minHeight: 48, color: "var(--color-text-secondary)" }}
    >
      {icon}
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}
