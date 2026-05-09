export const dynamic = "force-dynamic";

import { createAdminClient } from "@/lib/supabase/admin";
import PacientesClient from "./PacientesClient";

export default async function AdminPacientesPage() {
  const admin = createAdminClient();

  const { data: pacientes, count } = await admin
    .from("pacientes")
    .select("id, user_id, nombre_completo, email, dni, fecha_nacimiento, obra_social, estado_cuenta, motivo_estado, estado_hasta, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(0, 49);

  return (
    <PacientesClient
      pacientes={pacientes ?? []}
      totalInicial={count ?? 0}
    />
  );
}
