// src/lib/comisiones.ts

import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/logger";

export type CategoriaMedico = "founder" | "tradicional";

/**
 * Devuelve el porcentaje de comision vigente para un medico,
 * basado en su categoria administrativa.
 */
export async function getComisionForMedico(
  medicoId: string
): Promise<number> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("get_comision_medico", {
    p_medico_id: medicoId,
  });

  if (error || data === null) {
    logError("[COMISIONES]", "Error obteniendo comision", { error: error?.message });
    return 5.0;
  }

  return Number(data);
}

/**
 * Devuelve la categoria que recibiran los nuevos medicos al aprobarse.
 */
export async function getRegimenNuevosMedicos(): Promise<CategoriaMedico> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("regimen_nuevos_medicos")
    .select("categoria_actual")
    .eq("id", 1)
    .single();

  return (data?.categoria_actual as CategoriaMedico) || "founder";
}

export async function getComisionesGlobales(): Promise<{
  founder: number;
  tradicional: number;
}> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("comisiones_config")
    .select("categoria, porcentaje");

  const result = { founder: 5.0, tradicional: 10.0 };
  (data || []).forEach((row) => {
    if (row.categoria === "founder") result.founder = Number(row.porcentaje);
    if (row.categoria === "tradicional")
      result.tradicional = Number(row.porcentaje);
  });

  return result;
}
