// Lectura de la sala de espera para la pantalla del paciente institucional.
//
// ── POR QUÉ ESTO NO VIVE EN `actions.ts` ─────────────────────────────────────
// Porque `actions.ts` lleva `"use server"`, y su otro export se importa desde
// el cliente: eso registra el MÓDULO ENTERO como acciones invocables, cada una
// con su action id. `yaEntroALaSala` quedaba así expuesta como server action
// pública, chequeando solo el modo y leyendo `sala_espera_entradas` con service
// role filtrando SOLO por `consulta_id` — sin verificar que quien llama sea el
// paciente de esa consulta ni nadie en particular. Filtraba un booleano ("¿el
// paciente de esta consulta llegó?") de cualquier consulta a cualquiera que
// conociera el UUID.
//
// Es poco, pero es exactamente el patrón que advierte `documento-desde-db.ts`:
// service role sin gate propio. Y no hacía ninguna falta — la usa solo el
// server component, que ya hizo su propio gate. Sacándola del archivo de
// acciones deja de tener superficie invocable.

import { createAdminClient } from "@/lib/supabase/admin";
import { esInstitucional } from "@/lib/instancia";

/** ¿Ya hay una entrada registrada de este paciente en esta consulta? */
export async function yaEntroALaSala(consultaId: string): Promise<boolean> {
  if (!esInstitucional()) return false;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("sala_espera_entradas")
      .select("id")
      .eq("consulta_id", consultaId)
      .limit(1);
    return (data?.length ?? 0) > 0;
  } catch {
    // Ante la duda, se muestra el botón de entrar: repetir la entrada es
    // idempotente y barato; esconderlo dejaría al paciente sin cómo entrar.
    return false;
  }
}
