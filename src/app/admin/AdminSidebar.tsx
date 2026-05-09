"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  Stethoscope,
  Users,
  MessageSquare,
  Bell,
  Settings,
  LogOut,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, badgeKey: null },
  { href: "/admin/medicos", label: "Medicos", icon: Stethoscope, badgeKey: "medicos" as const },
  { href: "/admin/pacientes", label: "Pacientes", icon: Users, badgeKey: null },
  { href: "/admin/consultas", label: "Consultas", icon: MessageSquare, badgeKey: null },
  { href: "/admin/alertas", label: "Alertas", icon: Bell, badgeKey: "alertas" as const },
  { href: "/admin/configuracion", label: "Configuracion", icon: Settings, badgeKey: null },
];

interface Props {
  pendingMedicos: number;
  pendingAlertas: number;
  adminEmail: string;
  onNavigate?: () => void;
}

export default function AdminSidebar({ pendingMedicos, pendingAlertas, adminEmail, onNavigate }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  const badges: Record<string, number> = {
    medicos: pendingMedicos,
    alertas: pendingAlertas,
  };

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <aside className="flex w-60 flex-col border-r border-gray-200 bg-white">
      <div className="flex h-14 items-center gap-2 px-5">
        <Stethoscope size={22} strokeWidth={2} color="#378ADD" />
        <span className="text-lg font-bold lowercase text-gray-900">docto</span>
        <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          Admin
        </span>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {NAV_ITEMS.map(({ href, label, icon: Icon, badgeKey }) => {
          const active = isActive(href);
          const badge = badgeKey ? badges[badgeKey] : 0;
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-[#378ADD]/10 text-[#378ADD]"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <Icon size={18} strokeWidth={1.75} />
              <span className="flex-1">{label}</span>
              {badge > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#E24B4A] px-1.5 text-[11px] font-semibold text-white">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-100 px-3 py-4">
        <p className="truncate px-3 text-xs text-gray-400">{adminEmail}</p>
        <button
          onClick={handleLogout}
          className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
        >
          <LogOut size={18} strokeWidth={1.75} />
          Salir
        </button>
      </div>
    </aside>
  );
}
