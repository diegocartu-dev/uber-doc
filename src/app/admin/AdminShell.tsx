"use client";

import { useState } from "react";
import { Menu, X, Stethoscope } from "lucide-react";
import AdminSidebar from "./AdminSidebar";

interface Props {
  pendingMedicos: number;
  pendingAlertas: number;
  adminEmail: string;
  children: React.ReactNode;
}

export default function AdminShell({ pendingMedicos, pendingAlertas, adminEmail, children }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex h-screen bg-[#F8F9FA]">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex">
        <AdminSidebar
          pendingMedicos={pendingMedicos}
          pendingAlertas={pendingAlertas}
          adminEmail={adminEmail}
        />
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 lg:hidden" onClick={() => setDrawerOpen(false)} />
          <div className="fixed left-0 top-0 z-50 h-full lg:hidden">
            <AdminSidebar
              pendingMedicos={pendingMedicos}
              pendingAlertas={pendingAlertas}
              adminEmail={adminEmail}
              onNavigate={() => setDrawerOpen(false)}
            />
          </div>
        </>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <div className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 lg:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Stethoscope size={20} strokeWidth={2} color="#378ADD" />
            <span className="text-base font-bold lowercase text-gray-900">docto</span>
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Admin
            </span>
          </div>
          <div className="w-10" />
        </div>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
