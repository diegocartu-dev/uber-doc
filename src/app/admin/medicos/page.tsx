export const dynamic = "force-dynamic";

import { createAdminClient } from "@/lib/supabase/admin";
import { getFlag } from "@/lib/feature-flags";
import MedicosClient from "./MedicosClient";
import { estadoCuentaMp } from "@/lib/mp-cuenta";

export default async function AdminMedicosPage() {
  const admin = createAdminClient();

  const [{ data: medicos }, gateIdentidadActiva] = await Promise.all([
    admin
      .from("medicos")
      .select("id, nombre_completo, email, dni, tipo_matricula, numero_matricula, provincia_matricula, especialidad, foto_credencial_url, estado_registro, created_at, cuit, user_id, domicilio, verificado, verificado_at, verificado_por, disponible, notas_admin, slug, categoria, telefono, celular_personal, refeps_validado, refeps_data, refeps_validado_at, jurisdicciones, identidad_validada, biometria_exenta, didit_status, identidad_revision_motivo")
      .eq("es_cuenta_test", false)
      .order("created_at", { ascending: true }),
    // Estado REAL del gate de identidad — la ficha lo muestra en vez de
    // afirmar un estado fijo (el cartel decía "apagado" con el gate prendido).
    getFlag("identidad_gate_activa"),
  ]);

  // Cuenta de cobros: país verificado contra Mercado Pago (caso 07/08/2026 — una
  // cuenta de otro país cobra en otra moneda y ningún paciente argentino puede
  // pagarle). Query APARTE del select de médicos: `site_id` puede no estar
  // migrada todavía y PostgREST falla la query ENTERA si se nombra una columna
  // inexistente — mezclarla dejaría el panel sin médicos.
  //
  // Y con el MISMO reintento sin columnas que hace el cron. Sin él, antes de la
  // migración la query fallaba entera, `cuentasMp` quedaba vacío y TODOS los
  // médicos con cuenta activa aparecían como "Sin cuenta conectada" — justo lo
  // contrario de lo que la ficha tiene que contar cuando llega la alerta.
  type CuentaMpFila = {
    medico_id: string;
    estado: string | null;
    expires_at?: string | null;
    site_id?: string | null;
    site_verificado_at?: string | null;
  };
  let cuentasMp: CuentaMpFila[] = [];
  const conSite = await admin
    .from("medicos_mp_accounts")
    .select("medico_id, estado, expires_at, site_id, site_verificado_at");
  if (conSite.error) {
    // Sin las columnas del país seguimos sabiendo QUIÉN tiene cuenta conectada
    // (el dato que ya existe hoy); el país queda "sin verificar todavía".
    const base = await admin.from("medicos_mp_accounts").select("medico_id, estado, expires_at");
    cuentasMp = (base.data ?? []) as CuentaMpFila[];
  } else {
    cuentasMp = (conSite.data ?? []) as CuentaMpFila[];
  }
  const cuentaPorMedico = new Map(cuentasMp.map((c) => [c.medico_id, c]));

  const medicosConCobros = (medicos ?? []).map((m) => {
    const cuenta = cuentaPorMedico.get(m.id);
    // Una sola regla para "puede cobrar", en `@/lib/mp-cuenta`: `estado` solo
    // miente hasta que alguien intenta pagar (ver la nota de ese archivo).
    const cobros = estadoCuentaMp(cuenta);
    return {
      ...m,
      mpConectado: cobros === "conectado",
      mpVencido: cobros === "expirado",
      mpSinCuenta: cobros === "no_conectado",
      mpExpiraAt: cuenta?.expires_at ?? null,
      mpSiteId: cuenta?.site_id ?? null,
      mpSiteVerificadoAt: cuenta?.site_verificado_at ?? null,
    };
  });

  return <MedicosClient medicos={medicosConCobros} gateIdentidadActiva={gateIdentidadActiva} />;
}
