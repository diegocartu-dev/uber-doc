"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  Gauge,
  Stethoscope,
  Users,
  MessageSquare,
  Bell,
  Settings,
  LogOut,
  ShieldCheck,
  TrendingUp,
  Send,
  Inbox,
  Sparkles,
  Landmark,
  UserCog,
  CalendarDays,
  FileLock2,
  Presentation,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, badgeKey: null },
  // Tablero único (Diego, 04/09/2026): reemplaza al Dashboard y al "Hoy" de
  // Insights. Convive con los dos mientras se valida en producción.
  { href: "/admin/tablero", label: "Tablero", icon: Gauge, badgeKey: null },
  { href: "/admin/medicos", label: "Medicos", icon: Stethoscope, badgeKey: "medicos" as const },
  { href: "/admin/pacientes", label: "Pacientes", icon: Users, badgeKey: null },
  { href: "/admin/consultas", label: "Consultas", icon: MessageSquare, badgeKey: null },
  // Lo que los profesionales le piden a Nova: la lista de lo que falta, dicha
  // con sus palabras (decisión Diego 10/08).
  { href: "/admin/nova", label: "Nova", icon: Sparkles, badgeKey: null },
  // Insights vive fuera de /admin pero es admin-only (GMV, comisión Docto,
  // funnel, demanda por especialidad). Sin este link era invisible.
  { href: "/insights", label: "Insights", icon: TrendingUp, badgeKey: null },
  { href: "/admin/alertas", label: "Alertas", icon: Bell, badgeKey: "alertas" as const },
  { href: "/admin/notificaciones", label: "Notificaciones", icon: Send, badgeKey: null },
  { href: "/admin/bandeja", label: "Bandeja", icon: Inbox, badgeKey: null },
  { href: "/admin/sereno", label: "Sereno", icon: ShieldCheck, badgeKey: null },
  { href: "/admin/configuracion", label: "Configuracion", icon: Settings, badgeKey: null },
];

// Instancia INSTITUCIONAL: gestión de la institución y sus operadores. El flag
// llega por PROP desde el layout server de /admin (esInstitucional(), la misma
// env `INSTITUCIONAL` que gatea las páginas y las actions) — una sola fuente:
// links y pantallas no pueden divergir por drift de env vars de provisión
// (NEXT_PUBLIC_* se inlinea en build; ver esInstitucionalClient en instancia.ts).
const NAV_ITEMS_INSTITUCIONAL = [
  { href: "/admin/institucion", label: "Institución", icon: Landmark, badgeKey: null },
  { href: "/admin/operadores", label: "Operadores", icon: UserCog, badgeKey: null },
  { href: "/admin/padron", label: "Padrón", icon: Users, badgeKey: null },
  { href: "/admin/agendas", label: "Agendas", icon: CalendarDays, badgeKey: null },
  // Meses ya facturados: mirar el detalle sellado y —solo superadmin, con
  // motivo— corregir una clasificación dejando constancia (R33).
  // Ruta hermana y no hija de /admin/institucion a propósito: el resaltado del
  // sidebar es por prefijo, y colgarla abajo dejaba los dos links encendidos.
  { href: "/admin/periodos", label: "Períodos", icon: FileLock2, badgeKey: null },
  // La pantalla que se usa EN una reunión de venta: cargar participantes,
  // proyectarles el QR y borrar todo después.
  { href: "/admin/demo", label: "Demo", icon: Presentation, badgeKey: null },
];

interface Props {
  pendingMedicos: number;
  pendingAlertas: number;
  adminEmail: string;
  institucional?: boolean;
  onNavigate?: () => void;
}

export default function AdminSidebar({ pendingMedicos, pendingAlertas, adminEmail, institucional, onNavigate }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  const badges: Record<string, number> = {
    medicos: pendingMedicos,
    alertas: pendingAlertas,
  };

  const navItems = institucional ? [...NAV_ITEMS, ...NAV_ITEMS_INSTITUCIONAL] : NAV_ITEMS;

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
        {navItems.map(({ href, label, icon: Icon, badgeKey }) => {
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
