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

  // Cuenta de cobros: país verificado contra Mercado Pago (caso 07/08/2026 — una
  // cuenta de otro país cobra en otra moneda y ningún paciente argentino puede
  // pagarle). Query APARTE del select de médicos, y con las columnas nuevas
  // aisladas: `site_id` puede no estar migrada todavía y PostgREST falla la query
  // ENTERA si se nombra una columna inexistente — mezclarla dejaría el panel sin
  // médicos. Si falla, cae a "sin dato" y el panel se ve igual que hoy.
  const { data: cuentasMp } = await admin
    .from("medicos_mp_accounts")
    .select("medico_id, estado, site_id, site_verificado_at");
  const cuentaPorMedico = new Map(
    (cuentasMp ?? []).map((c) => [c.medico_id as string, c])
  );

  const medicosConCobros = (medicos ?? []).map((m) => {
    const cuenta = cuentaPorMedico.get(m.id);
    return {
      ...m,
      mpConectado: cuenta?.estado === "activo",
      mpSiteId: (cuenta?.site_id as string | null) ?? null,
      mpSiteVerificadoAt: (cuenta?.site_verificado_at as string | null) ?? null,
    };
  });

  return <MedicosClient medicos={medicosConCobros} gateIdentidadActiva={gateIdentidadActiva} />;
}
