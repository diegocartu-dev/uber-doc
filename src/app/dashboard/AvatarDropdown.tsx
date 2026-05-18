"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
interface Props {
  initials: string;
  fullName: string;
  email: string;
  perfilCompleto: boolean;
}

export default function AvatarDropdown({ initials, fullName, email, perfilCompleto }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      document.addEventListener("keydown", handleKey);
    }
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  async function handleLogout() {
    window.dispatchEvent(new Event("docto:voluntary-logout"));
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div ref={ref} className="relative">
      {/* Avatar button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative flex h-8 w-8 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600 transition hover:bg-gray-200"
      >
        {initials}
        {!perfilCompleto && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#E24B4A]" />
        )}
      </button>

      {/* Dropdown desktop / Bottom sheet mobile */}
      {open && (
        <>
          {/* Mobile overlay */}
          <div className="fixed inset-0 z-[9998] bg-black/50 lg:hidden" onClick={() => setOpen(false)} />

          {/* Desktop dropdown */}
          <div className="fixed bottom-0 left-0 right-0 z-[9999] rounded-t-2xl bg-white p-4 shadow-lg lg:absolute lg:bottom-auto lg:left-auto lg:right-0 lg:top-10 lg:w-60 lg:rounded-xl lg:p-0" style={{ border: "0.5px solid #e5e7eb" }}>
            {/* Header */}
            <div className="px-4 py-3 lg:border-b lg:border-gray-100">
              <p className="text-sm font-semibold text-gray-900 truncate">{fullName}</p>
              <p className="text-xs text-gray-500 truncate">{email}</p>
            </div>

            {/* Items */}
            <div className="mt-2 lg:mt-0">
              <button
                onClick={() => { setOpen(false); router.push("/medico/perfil"); }}
                className="flex w-full items-center px-4 py-3.5 text-sm text-gray-700 transition hover:bg-gray-50 lg:py-2.5"
              >
                Mi perfil
                {!perfilCompleto && (
                  <span className="ml-auto inline-block h-2 w-2 rounded-full bg-[#D85A30]" />
                )}
              </button>

              <div className="border-t border-gray-100" />

              <button
                onClick={() => { setOpen(false); handleLogout(); }}
                className="flex w-full items-center px-4 py-3.5 text-sm text-gray-700 transition hover:bg-gray-50 lg:py-2.5"
              >
                Cerrar sesión
              </button>

            </div>

            {/* Safe area spacer for iOS */}
            <div className="h-[env(safe-area-inset-bottom)] lg:hidden" />
          </div>
        </>
      )}

    </div>
  );
}
