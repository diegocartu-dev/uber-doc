export const dynamic = "force-dynamic";

import { createAdminClient } from "@/lib/supabase/admin";
import PacientesClient from "./PacientesClient";

export default async function AdminPacientesPage() {
  const admin = createAdminClient();

  const { data: pacientes } = await admin
    .from("pacientes")
    .select("id, user_id, nombre_completo, email, dni, fecha_nacimiento, obra_social, estado_cuenta, motivo_estado, estado_hasta, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return <PacientesClient pacientes={pacientes ?? []} />;
}
