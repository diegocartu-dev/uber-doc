"use server";

// Server action de la corrección de un período sellado (/admin/periodos).
// SOLO instancia institucional, SOLO superadmin de Docto (R33).
//
// El guard está pegado al dato, no delegado al layout: es la acción que puede
// mover un número ya facturado. Y NO es el único guard — la función
// `corregir_encuentro_sellado` de la 021 vuelve a verificar contra
// `admin_users` que quien firma sea superadmin activo, porque un guard de
// aplicación se saltea llamando a la RPC con la service role key y este es
// justo el lugar donde eso importaría.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminUser } from "@/lib/admin-auth";
import { esInstitucional } from "@/lib/instancia";
import { corregirEncuentroSellado } from "@/lib/metering/correcciones";

interface Firmante {
  userId: string;
  email: string | null;
}

/** Superadmin de Docto en la instancia institucional, o null. */
async function superadminDeDocto(): Promise<Firmante | null> {
  if (!esInstitucional()) return null; // en B2C esta pantalla no existe
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = await getAdminUser(user.id);
  if (!admin || admin.nivel !== "super_admin") return null;
  return { userId: user.id, email: user.email ?? null };
}

export interface ResultadoCorreccionAction {
  ok: boolean;
  error?: string;
}

export async function corregirClasificacionSellada(entrada: {
  encuentroId: string;
  clasificacion: string;
  motivo: string;
  /** La clasificación que la pantalla mostraba (evita la corrección vacía). */
  actual?: string | null;
  periodo: string;
}): Promise<ResultadoCorreccionAction> {
  const firmante = await superadminDeDocto();
  if (!firmante) {
    // Mismo texto para "no sos admin" y "sos admin pero no superadmin": la
    // pantalla no es el lugar para explicarle a alguien qué le falta para
    // poder tocar una factura emitida.
    return { ok: false, error: "Solo un superadministrador de Docto puede corregir un período sellado." };
  }

  const res = await corregirEncuentroSellado({
    encuentroId: entrada.encuentroId,
    clasificacion: entrada.clasificacion,
    motivo: entrada.motivo,
    adminUserId: firmante.userId,
    adminEmail: firmante.email,
    actual: entrada.actual,
  });
  if (!res.ok) return { ok: false, error: res.error };

  revalidatePath("/admin/periodos");
  return { ok: true };
}
