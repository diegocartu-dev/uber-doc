export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import AdminMedicosClient from "./AdminMedicosClient";

const ADMIN_EMAILS = ["diegocartu@gmail.com"];

export default async function AdminMedicosPendientesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !ADMIN_EMAILS.includes(user.email ?? "")) {
    redirect("/dashboard");
  }

  const admin = createAdminClient();
  const { data: pendientes } = await admin
    .from("medicos")
    .select("id, nombre_completo, email, dni, tipo_matricula, numero_matricula, provincia_matricula, especialidad, foto_credencial_url, estado_registro, created_at, cuit, user_id, domicilio")
    .eq("estado_registro", "pendiente_revision")
    .order("created_at", { ascending: true });

  return (
    <div className="min-h-full" style={{ backgroundColor: "var(--color-bg-secondary)" }}>
      <nav className="bg-white" style={{ borderBottom: "0.5px solid #e5e7eb" }}>
        <div className="mx-auto max-w-4xl px-4 py-4">
          <h1 className="text-lg font-semibold text-gray-900">
            Médicos pendientes de aprobación
          </h1>
          <p className="text-sm text-gray-500">
            {pendientes?.length ?? 0} pendiente{(pendientes?.length ?? 0) !== 1 ? "s" : ""}
          </p>
        </div>
      </nav>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <AdminMedicosClient medicosPendientes={pendientes ?? []} />
      </main>
    </div>
  );
}
