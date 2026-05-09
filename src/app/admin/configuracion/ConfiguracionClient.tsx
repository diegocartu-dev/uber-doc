"use client";

import { useState } from "react";
import { Settings, ToggleRight, Users, DollarSign, Plug } from "lucide-react";
import FeatureFlagsTab from "./tabs/FeatureFlagsTab";
import ComisionesTab from "./tabs/ComisionesTab";
import AdministradoresTab from "./tabs/AdministradoresTab";
import IntegracionesTab from "./tabs/IntegracionesTab";

type Tab = "flags" | "comisiones" | "admins" | "integraciones";

const TABS: { key: Tab; label: string; icon: typeof Settings }[] = [
  { key: "flags", label: "Feature Flags", icon: ToggleRight },
  { key: "comisiones", label: "Comisiones", icon: DollarSign },
  { key: "admins", label: "Administradores", icon: Users },
  { key: "integraciones", label: "Integraciones", icon: Plug },
];

export default function ConfiguracionClient() {
  const [tab, setTab] = useState<Tab>("flags");

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center gap-3">
        <Settings size={22} strokeWidth={1.75} className="text-gray-400" />
        <h1 className="text-xl font-semibold text-gray-900">Configuracion</h1>
      </div>

      {/* Tabs */}
      <div className="mt-5 flex gap-1 border-b border-gray-200">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === key
                ? "text-[#378ADD] border-b-2 border-[#378ADD]"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon size={16} strokeWidth={1.75} />
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "flags" && <FeatureFlagsTab />}
        {tab === "comisiones" && <ComisionesTab />}
        {tab === "admins" && <AdministradoresTab />}
        {tab === "integraciones" && <IntegracionesTab />}
      </div>
    </div>
  );
}
