export const dynamic = "force-dynamic";

import { createAdminClient } from "@/lib/supabase/admin";
import MedicosClient from "./MedicosClient";

export default async function AdminMedicosPage() {
  const admin = createAdminClient();

  const { data: medicos } = await admin
    .from("medicos")
    .select("id, nombre_completo, email, dni, tipo_matricula, numero_matricula, provincia_matricula, especialidad, foto_credencial_url, estado_registro, created_at, cuit, user_id, domicilio, verificado, verificado_at, verificado_por, disponible, notas_admin, slug")
    .order("created_at", { ascending: true });

  return <MedicosClient medicos={medicos ?? []} />;
}
