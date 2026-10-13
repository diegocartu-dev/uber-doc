"use server";

// Acciones del término de medicamentos controlados que llaman las pantallas.
//
// DINÁMICO, sin fricción (Diego, 12/10/2026): el término se muestra solo a quien
// todavía no aceptó la versión vigente. Una vez tildado no se vuelve a pedir
// (salvo que cambie el texto y se suba la versión). Ante cualquier duda de
// lectura, NO se pide: nunca frenar una consulta por este término.

import { createClient } from "@/lib/supabase/server";
import { aceptoControlados, registrarAceptacionControlados } from "@/lib/legal/controlados";

/** ¿Hay que mostrarle el término a este usuario? `false` ante cualquier error. */
export async function necesitaAceptarControlados(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    return !(await aceptoControlados(user.id));
  } catch {
    return false;
  }
}

/** El profesional lo acepta desde el aviso de su panel. */
export async function aceptarControladosDesdeElPanel(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  return { ok: await registrarAceptacionControlados({ userId: user.id }) };
}
