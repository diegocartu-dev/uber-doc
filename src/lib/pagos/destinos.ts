// Destinos de pago: "¿a dónde te pagamos?"
//
// Fuente de verdad de a dónde le paga Docto a una persona (reintegros al
// paciente, honorarios al profesional). Plan y decisiones:
// docs/sprints/2026-09-29-plan-pagos-desde-docto.md (Diego, 30/09/2026).
//
// Dos orígenes:
//  - Profesional con Mercado Pago conectado: el e-mail de SU cuenta de MP sale
//    de /users/me con su propio token. No se le pide nada y no hay tipeo.
//  - Paciente: alias o CVU/CBU, pedido al primer pago con el aviso "en caso de
//    cancelación, el reintegro se hará a esta cuenta". Es un dato que él
//    escribe: se valida acá y, antes de transferir a mano, quien paga compara
//    el titular que muestra la app de MP con el paciente.
//
// Fácil de guardar, difícil de cambiar a escondidas: reemplazar un destino
// declarado espera 24 h antes de poder usarse (`usable_desde`). Una
// transferencia hecha no vuelve.

import { createAdminClient } from "@/lib/supabase/admin";
import { logError, logInfo } from "@/lib/logger";

export * from "./destinos-puro";
import type { Destino, OrigenDestino, RolDestino, TipoDestino } from "./destinos-puro";
import { usableDesde, etiquetaDestino } from "./destinos-puro";
import { enviarEmailCambioDestino } from "@/lib/email";

// ── Lectura y escritura (service role) ──────────────────────────────────────

export async function destinoVigente(userId: string, rol: RolDestino): Promise<Destino | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("destinos_pago")
    .select("id, user_id, rol, tipo, valor, origen, usable_desde, verificado_en, created_at")
    .eq("user_id", userId)
    .eq("rol", rol)
    .eq("vigente", true)
    .maybeSingle();
  if (error) {
    // La tabla puede no estar migrada todavía: nadie se cae por esto.
    logError("[DESTINOS]", "No se pudo leer el destino vigente", { userId, error: error.message });
    return null;
  }
  return (data as Destino | null) ?? null;
}

export type ResultadoGuardar =
  | { ok: true; destino: Destino; cambio: "nuevo" | "sin_cambios" | "reemplazado" }
  | { ok: false; error: string };

/**
 * Guarda un destino. Idempotente: el mismo tipo+valor vigente no genera fila
 * nueva (solo refresca `verificado_en` si viene de MP). Un valor distinto
 * reemplaza: la fila vieja queda con vigente=false, la nueva apunta a la vieja.
 */
export async function guardarDestino(args: {
  userId: string;
  rol: RolDestino;
  tipo: TipoDestino;
  valor: string;
  origen: OrigenDestino;
}): Promise<ResultadoGuardar> {
  const admin = createAdminClient();
  const ahora = new Date();
  const actual = await destinoVigente(args.userId, args.rol);

  // "Reemplaza" se decide por la HISTORIA (¿hubo alguna vez un destino para
  // esta persona y rol?), no por "hay vigente": entre apagar la vieja e
  // insertar la nueva hay una ventana en la que otro pedido vería "sin
  // vigente" y entraría sin la espera de 24 h ni el aviso.
  const { data: previas, error: errPrevias } = await admin
    .from("destinos_pago")
    .select("id")
    .eq("user_id", args.userId)
    .eq("rol", args.rol)
    .limit(1);
  if (errPrevias) {
    logError("[DESTINOS]", "No se pudo leer la historia de destinos", { userId: args.userId, error: errPrevias.message });
    return { ok: false, error: "No se pudo guardar. Probá de nuevo." };
  }
  const reemplaza = (previas?.length ?? 0) > 0;

  if (actual && actual.tipo === args.tipo && actual.valor === args.valor) {
    if (args.origen === "oauth_mp") {
      await admin.from("destinos_pago").update({ verificado_en: ahora.toISOString() }).eq("id", actual.id);
    }
    return { ok: true, destino: actual, cambio: "sin_cambios" };
  }

  const fila = {
    user_id: args.userId,
    rol: args.rol,
    tipo: args.tipo,
    valor: args.valor,
    origen: args.origen,
    vigente: true,
    usable_desde: usableDesde({ reemplaza, origen: args.origen, ahora }).toISOString(),
    verificado_en: args.origen === "oauth_mp" ? ahora.toISOString() : null,
    reemplaza_a: actual?.id ?? null,
  };

  // Primero se apaga la vigente (el índice único no admite dos), después se inserta.
  if (actual) {
    const { error: errApagar } = await admin.from("destinos_pago").update({ vigente: false }).eq("id", actual.id).eq("vigente", true);
    if (errApagar) {
      logError("[DESTINOS]", "No se pudo reemplazar el destino vigente", { userId: args.userId, error: errApagar.message });
      return { ok: false, error: "No se pudo guardar. Probá de nuevo." };
    }
  }
  const { data, error } = await admin
    .from("destinos_pago")
    .insert(fila)
    .select("id, user_id, rol, tipo, valor, origen, usable_desde, verificado_en, created_at")
    .single();
  if (error || !data) {
    // 23505 = otro pedido ganó la carrera y ya dejó una vigente: esa es la
    // verdad, se devuelve. Cualquier otro error: si se apagó la vieja, vuelve
    // (mejor un destino viejo que ninguno), y si tampoco vuelve, se loguea
    // fuerte: es una historia cortada que hay que mirar a mano.
    if (error?.code === "23505") {
      const ganador = await destinoVigente(args.userId, args.rol);
      if (ganador) return { ok: true, destino: ganador, cambio: "sin_cambios" };
    }
    logError("[DESTINOS]", "No se pudo guardar el destino", { userId: args.userId, error: error?.message, code: error?.code });
    if (actual) {
      const { error: errVolver } = await admin.from("destinos_pago").update({ vigente: true }).eq("id", actual.id);
      if (errVolver) logError("[DESTINOS]", "HISTORIA CORTADA: la vigente se apagó y no volvió; revisar a mano", { userId: args.userId, destinoId: actual.id, error: errVolver.message });
    }
    return { ok: false, error: "No se pudo guardar. Probá de nuevo." };
  }
  logInfo("[DESTINOS]", reemplaza ? "Destino reemplazado" : "Destino nuevo", { userId: args.userId, rol: args.rol, tipo: args.tipo, origen: args.origen });
  // Un cambio declarado se avisa a la persona por mail: si no fue ella, tiene
  // 24 h (usable_desde) para decirlo antes de que salga plata. Best-effort.
  if (reemplaza && args.origen === "declarado") {
    const nuevo = data as Destino;
    enviarEmailCambioDestino(args.userId, etiquetaDestino(nuevo), nuevo.usable_desde).catch((e) =>
      logError("[DESTINOS]", "No se pudo avisar el cambio de destino", { userId: args.userId, error: String(e) })
    );
  }
  return { ok: true, destino: data as Destino, cambio: reemplaza ? "reemplazado" : "nuevo" };
}

/**
 * Apaga el destino vigente de una persona (por ejemplo, el e-mail de la cuenta
 * de MP que el profesional acaba de desconectar: pagarle ahí sería pagarle a
 * una cuenta que ya no usa). Si `soloOrigen` viene, apaga solo si el vigente
 * nació de ese origen. Falla suave.
 */
export async function apagarDestinoVigente(userId: string, rol: RolDestino, soloOrigen?: OrigenDestino): Promise<boolean> {
  const actual = await destinoVigente(userId, rol);
  if (!actual) return false;
  if (soloOrigen && actual.origen !== soloOrigen) return false;
  const admin = createAdminClient();
  const { error } = await admin.from("destinos_pago").update({ vigente: false }).eq("id", actual.id).eq("vigente", true);
  if (error) {
    logError("[DESTINOS]", "No se pudo apagar el destino vigente", { userId, rol, error: error.message });
    return false;
  }
  logInfo("[DESTINOS]", "Destino apagado", { userId, rol, origen: actual.origen });
  return true;
}
