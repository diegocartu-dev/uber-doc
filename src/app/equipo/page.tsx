import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EquipoChat from "./EquipoChat";

export default async function EquipoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  return (
    <div className="min-h-full bg-[#f8f9fa]">
      <nav className="bg-white" style={{ borderBottom: "0.5px solid #e5e7eb" }}>
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <span className="text-lg font-medium text-gray-900">Docto</span>
            <span className="text-lg text-gray-300">/</span>
            <span className="text-lg font-medium text-gray-500">Equipo AI</span>
          </div>
          <a href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">Dashboard</a>
        </div>
      </nav>
      <main className="mx-auto max-w-5xl px-6 py-6">
        <EquipoChat />
      </main>
    </div>
  );
}
