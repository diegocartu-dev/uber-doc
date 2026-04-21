export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN_EMAILS } from "@/lib/admin";
import AdminSidebar from "./AdminSidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !ADMIN_EMAILS.includes(user.email ?? "")) {
    redirect("/dashboard");
  }

  const admin = createAdminClient();

  const [{ count: pendingMedicos }, { count: pendingAlertas }] = await Promise.all([
    admin.from("medicos").select("id", { count: "exact", head: true }).eq("estado_registro", "pendiente_revision"),
    admin.from("alertas_admin").select("id", { count: "exact", head: true }).eq("estado", "pendiente"),
  ]);

  return (
    <div className="flex h-screen bg-[#F8F9FA]">
      <AdminSidebar
        pendingMedicos={pendingMedicos ?? 0}
        pendingAlertas={pendingAlertas ?? 0}
        adminEmail={user.email ?? ""}
      />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
