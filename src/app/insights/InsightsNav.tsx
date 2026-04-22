"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Stethoscope, Settings } from "lucide-react";

const LINKS = [
  { href: "/insights", label: "Hoy" },
  { href: "/insights/medicos", label: "Médicos" },
  { href: "/insights/especialidades", label: "Especialidades" },
  { href: "/insights/funnel", label: "Funnel" },
];

export default function InsightsNav() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/insights") return pathname === "/insights";
    return pathname.startsWith(href);
  }

  return (
    <nav className="border-b border-white/10 bg-[#0F172A]">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 lg:px-8">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Stethoscope size={20} strokeWidth={2} color="#378ADD" />
            <span className="text-base font-bold lowercase text-white">docto</span>
            <span className="ml-1 rounded bg-[#378ADD]/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#378ADD]">
              CEO
            </span>
          </div>
          <div className="flex items-center gap-1">
            {LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive(href)
                    ? "bg-white/10 text-white"
                    : "text-white/50 hover:text-white/80"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
        <Link
          href="/admin"
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white/40 transition hover:text-white/70"
        >
          <Settings size={14} />
          Admin
        </Link>
      </div>
    </nav>
  );
}
