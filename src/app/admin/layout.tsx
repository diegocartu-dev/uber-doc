export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin-auth";
import AdminShell from "./AdminShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !(await isAdmin(user.id))) {
    redirect("/dashboard");
  }

  const admin = createAdminClient();

  const [{ count: pendingMedicos }, { count: pendingAlertas }] = await Promise.all([
    admin.from("medicos").select("id", { count: "exact", head: true }).eq("estado_registro", "pendiente_revision").eq("es_cuenta_test", false),
    admin.from("alertas_admin").select("id", { count: "exact", head: true }).eq("estado", "pendiente"),
  ]);

  return (
    <AdminShell
      pendingMedicos={pendingMedicos ?? 0}
      pendingAlertas={pendingAlertas ?? 0}
      adminEmail={user.email ?? ""}
    >
      {children}
    </AdminShell>
  );
}
