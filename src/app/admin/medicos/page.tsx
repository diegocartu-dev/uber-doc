export const dynamic = "force-dynamic";

import { createAdminClient } from "@/lib/supabase/admin";
import { getFlag } from "@/lib/feature-flags";
import MedicosClient from "./MedicosClient";

export default async function AdminMedicosPage() {
  const admin = createAdminClient();

  const [{ data: medicos }, gateIdentidadActiva] = await Promise.all([
    admin
      .from("medicos")
      .select("id, nombre_completo, email, dni, tipo_matricula, numero_matricula, provincia_matricula, especialidad, foto_credencial_url, estado_registro, created_at, cuit, user_id, domicilio, verificado, verificado_at, verificado_por, disponible, notas_admin, slug, categoria, refeps_validado, refeps_data, refeps_validado_at, jurisdicciones, identidad_validada, biometria_exenta, didit_status, identidad_revision_motivo")
      .eq("es_cuenta_test", false)
      .order("created_at", { ascending: true }),
    // Estado REAL del gate de identidad — la ficha lo muestra en vez de
    // afirmar un estado fijo (el cartel decía "apagado" con el gate prendido).
    getFlag("identidad_gate_activa"),
  ]);

  return <MedicosClient medicos={medicos ?? []} gateIdentidadActiva={gateIdentidadActiva} />;
}
