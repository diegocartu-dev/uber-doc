// src/lib/metering/correcciones.ts
// CORREGIR UN MES YA FACTURADO — la única puerta, y su rastro (R33).
// SOLO instancia institucional.
//
// ── LA REGLA (Diego, 13/08) ──────────────────────────────────────────────────
// "Congelado para todos menos para uno." Un mes sellado es inmutable para la
// institución, para los operadores y para el sistema. Solo el
// superadministrador de Docto puede corregirlo —para eso está: errores
// existen— y toda corrección queda registrada: quién, cuándo, qué fila, qué
// cambió y por qué.
//
// ── DÓNDE VIVE CADA MITAD ────────────────────────────────────────────────────
// La ley está en la DB (migración 021), no acá: la función
// `corregir_encuentro_sellado` escribe la constancia y aplica el cambio en la
// misma transacción, y el trigger de `encuentros_metering` solo deja pasar el
// UPDATE si viene señalada esa constancia. O sea que corregir sin dejar rastro
// es imposible incluso desde el SQL Editor.
//
// Este módulo es la mitad de aplicación: valida lo mismo ANTES de ir a la base
// —para que el usuario lea un error en castellano y no un `RAISE EXCEPTION`—,
// llama a la RPC con service role y lee el historial para la pantalla. Si las
// dos mitades divergieran, manda la DB.

import { createAdminClient } from "@/lib/supabase/admin";
import { leerTodo } from "@/lib/metering/db";
import { rangoDePeriodo } from "@/lib/metering/facturacion";
import type { Motor } from "@/lib/metering/clasificar";

/** Las cinco del CHECK de `encuentros_metering` (migración 014). */
export const CLASIFICACIONES = [
  "facturable",
  "no_facturable_corta",
  "ausente_paciente",
  "ausente_profesional",
  "falla_tecnica",
] as const;

export type Clasificacion = (typeof CLASIFICACIONES)[number];

/** Cómo se lee cada clasificación en la pantalla. */
export const ETIQUETA_CLASIFICACION: Record<Clasificacion, string> = {
  facturable: "Facturable",
  no_facturable_corta: "No facturable (duró menos de un minuto)",
  ausente_paciente: "Faltó el paciente",
  ausente_profesional: "Faltó el profesional",
  falla_tecnica: "Falla técnica de la plataforma",
};

/**
 * Largo mínimo del motivo. El MISMO número está en el CHECK de la tabla y en el
 * `RAISE` de la función (021): acá para que el error se lea, allá para que la
 * regla valga aunque alguien llame a la RPC por afuera de esta pantalla.
 *
 * Por qué un mínimo y no solo "obligatorio": "ok", "fix" y "-" son motivos que
 * pasan cualquier `NOT NULL` y no explican nada. Este texto es lo único que va
 * a quedar cuando alguien lea el registro dentro de dos años.
 */
export const MOTIVO_MIN = 10;

export type ValidacionCorreccion =
  | { ok: true; clasificacion: Clasificacion; motivo: string }
  | { ok: false; error: string };

/**
 * La validación pura: qué se puede corregir y con qué explicación.
 * `actual` (opcional) es la clasificación que la fila tiene hoy — corregir algo
 * a lo que ya está no es una corrección, es una fila de auditoría vacía.
 */
export function validarCorreccion(entrada: {
  clasificacion?: string | null;
  motivo?: string | null;
  actual?: string | null;
}): ValidacionCorreccion {
  const clasificacion = (entrada.clasificacion ?? "").trim();
  if (!(CLASIFICACIONES as readonly string[]).includes(clasificacion)) {
    return { ok: false, error: "Elegí una clasificación válida." };
  }
  const motivo = (entrada.motivo ?? "").trim();
  if (motivo.length < MOTIVO_MIN) {
    return {
      ok: false,
      error: `Escribí el motivo de la corrección (al menos ${MOTIVO_MIN} caracteres): queda en la auditoría del período.`,
    };
  }
  if (entrada.actual && entrada.actual === clasificacion) {
    return { ok: false, error: "Esa ya es la clasificación de la consulta: no hay nada que corregir." };
  }
  return { ok: true, clasificacion: clasificacion as Clasificacion, motivo };
}

// ─── Lectura: qué hay sellado y qué se corrigió ──────────────────────────────

export interface EncuentroSellado {
  id: string;
  tipo: "consulta" | "turno";
  recurso_id: string;
  fecha_ar: string;
  motor: Motor;
  especialidad: string | null;
  medico_id: string;
  profesional: string;
  clasificacion: Clasificacion;
  clasificacion_origen: string;
  clasificacion_motivo: string | null;
  segundos_ambos_en_sala: number;
  documentos_emitidos: number;
  precio_centavos: number;
  /** `null` = la fila apareció DESPUÉS del cierre y no está sellada. */
  facturado_periodo: string | null;
  /**
   * La fila es de este mes pero no lleva su sello: entró a la base después del
   * cierre. No está congelada, no entró a la factura que se emitió, y la puerta
   * de R33 no la alcanza (la RPC exige que la fila esté sellada). Se muestra
   * igual —marcada— porque el modo de falla peor es que no la vea nadie.
   */
  llego_tarde: boolean;
  /** Cuántas veces se corrigió esta fila (0 = intacta desde el sello). */
  correcciones: number;
}

export interface CorreccionRegistrada {
  id: string;
  encuentro_id: string;
  periodo: string;
  admin_email: string | null;
  motivo: string;
  de: string | null;
  a: string | null;
  corregido_at: string;
}

/**
 * Las filas de un período facturado, con el nombre del profesional y cuántas
 * veces se corrigió cada una.
 *
 * Se listan TODAS las clasificaciones, no solo las facturables: una corrección
 * típica es justamente sacar de la factura algo que no correspondía —o volver a
 * meter algo que se marcó como ausencia y en realidad se atendió—, y para poder
 * revertir un error hay que poder verlo.
 *
 * ── POR QUÉ SE LISTA POR MES Y NO POR SELLO ──────────────────────────────────
 * El listado acota por `fecha_ar` (el mes calendario) y no por
 * `facturado_periodo`. La diferencia entre los dos conjuntos es exactamente lo
 * que hay que ver: una fila del mes SIN sello es una que entró a la base
 * después del cierre (un webhook muy tardío). No está congelada y no entró a la
 * factura emitida, así que si el listado la escondiera, el auditor vería N
 * filas y el sistema tendría N+1 — la divergencia silenciosa que todo este
 * módulo existe para evitar. Se muestra marcada con `llego_tarde`.
 *
 * TIRA si la base falla: una pantalla de auditoría que muestra menos de lo que
 * hay es peor que una que no abre.
 */
export async function encuentrosSelladosDePeriodo(periodo: string): Promise<EncuentroSellado[]> {
  const admin = createAdminClient();
  const { desde: primerDia, hasta: ultimoDia } = rangoDePeriodo(periodo);
  const filas = await leerTodo<Record<string, unknown>>(
    `encuentros de ${periodo}`,
    (desde, hasta) =>
      admin
        .from("encuentros_metering")
        .select(
          "id, tipo, recurso_id, fecha_ar, motor, especialidad, medico_id, clasificacion, clasificacion_origen, clasificacion_motivo, segundos_ambos_en_sala, documentos_emitidos, precio_centavos, facturado_periodo"
        )
        .gte("fecha_ar", primerDia)
        .lte("fecha_ar", ultimoDia)
        .order("fecha_ar", { ascending: true })
        .order("id", { ascending: true })
        .range(desde, hasta)
  );
  if (filas.length === 0) return [];

  const medicoIds = [...new Set(filas.map((f) => f.medico_id as string).filter(Boolean))];
  const nombres = new Map<string, string>();
  const { data: medicos } = await admin
    .from("medicos")
    .select("id, nombre_completo, titulo")
    .in("id", medicoIds);
  for (const m of medicos ?? []) {
    nombres.set(
      m.id as string,
      `${((m.titulo as string | null) ?? "").trim()} ${((m.nombre_completo as string | null) ?? "").trim()}`.trim()
    );
  }

  const { data: correcciones } = await admin
    .from("metering_correcciones")
    .select("encuentro_id")
    .eq("periodo", periodo);
  const cuenta = new Map<string, number>();
  for (const c of correcciones ?? []) {
    const id = c.encuentro_id as string;
    cuenta.set(id, (cuenta.get(id) ?? 0) + 1);
  }

  return filas.map((f) => ({
    id: f.id as string,
    tipo: f.tipo as "consulta" | "turno",
    recurso_id: f.recurso_id as string,
    fecha_ar: f.fecha_ar as string,
    motor: f.motor as Motor,
    especialidad: (f.especialidad as string | null) ?? null,
    medico_id: f.medico_id as string,
    profesional: nombres.get(f.medico_id as string) ?? "",
    clasificacion: f.clasificacion as Clasificacion,
    clasificacion_origen: f.clasificacion_origen as string,
    clasificacion_motivo: (f.clasificacion_motivo as string | null) ?? null,
    segundos_ambos_en_sala: Number(f.segundos_ambos_en_sala ?? 0),
    documentos_emitidos: Number(f.documentos_emitidos ?? 0),
    precio_centavos: Number(f.precio_centavos ?? 0),
    facturado_periodo: (f.facturado_periodo as string | null) ?? null,
    llego_tarde: !f.facturado_periodo,
    correcciones: cuenta.get(f.id as string) ?? 0,
  }));
}

/** El historial de correcciones del período — parte de su auditoría (R33). */
export async function historialDePeriodo(periodo: string): Promise<CorreccionRegistrada[]> {
  const admin = createAdminClient();
  const filas = await leerTodo<Record<string, unknown>>(
    `historial de correcciones de ${periodo}`,
    (desde, hasta) =>
      admin
        .from("metering_correcciones")
        .select("id, encuentro_id, periodo, admin_email, motivo, valores_antes, valores_despues, corregido_at")
        .eq("periodo", periodo)
        .order("corregido_at", { ascending: false })
        .order("id", { ascending: false })
        .range(desde, hasta)
  );
  return filas.map((f) => {
    const antes = (f.valores_antes ?? {}) as Record<string, unknown>;
    const despues = (f.valores_despues ?? {}) as Record<string, unknown>;
    return {
      id: f.id as string,
      encuentro_id: f.encuentro_id as string,
      periodo: f.periodo as string,
      admin_email: (f.admin_email as string | null) ?? null,
      motivo: f.motivo as string,
      de: (antes.clasificacion as string | null) ?? null,
      a: (despues.clasificacion as string | null) ?? null,
      corregido_at: f.corregido_at as string,
    };
  });
}

/** Meses que tienen filas selladas — el selector de la pantalla. */
export async function periodosSellados(): Promise<string[]> {
  const admin = createAdminClient();
  const filas = await leerTodo<Record<string, unknown>>("períodos sellados", (desde, hasta) =>
    admin
      .from("encuentros_metering")
      .select("facturado_periodo")
      .not("facturado_periodo", "is", null)
      .order("facturado_periodo", { ascending: false })
      .order("id", { ascending: true })
      .range(desde, hasta)
  );
  return [...new Set(filas.map((f) => f.facturado_periodo as string))].sort().reverse();
}

// ─── Escritura: la corrección auditada ───────────────────────────────────────

export interface ResultadoCorreccion {
  ok: boolean;
  error?: string;
  correccionId?: string;
}

/**
 * La llamada a la RPC, inyectable. En producción es siempre la de abajo; el
 * parámetro existe para que el contrato con la 021 —qué argumentos viajan, qué
 * se hace con el error— se pueda testear sin una base.
 */
export type LlamadaRPC = (
  nombre: string,
  args: Record<string, unknown>
) => Promise<{ data: unknown; error: { message: string } | null }>;

const rpcConServiceRole: LlamadaRPC = async (nombre, args) => {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc(nombre, args);
  return { data, error: error ? { message: error.message } : null };
};

/**
 * Aplica una corrección sobre una fila sellada, vía la RPC de la 021.
 *
 * Todo lo que importa pasa adentro de esa función y en UNA transacción: se
 * verifica que quien firma sea superadmin ACTIVO (el guard de la pantalla se
 * puede saltear llamando a la RPC; el de la DB no), se escribe la constancia y
 * recién con la constancia escrita el trigger deja aplicar el cambio.
 *
 * Acá no hay ningún UPDATE sobre `encuentros_metering`, y no lo puede haber:
 * cualquier otro camino rebota contra el trigger. Esa es la idea.
 */
export async function corregirEncuentroSellado(
  params: {
    encuentroId: string;
    clasificacion: string;
    motivo: string;
    adminUserId: string;
    adminEmail?: string | null;
    /** La clasificación actual, si la pantalla la tenía a mano. */
    actual?: string | null;
  },
  rpc: LlamadaRPC = rpcConServiceRole
): Promise<ResultadoCorreccion> {
  const validado = validarCorreccion({
    clasificacion: params.clasificacion,
    motivo: params.motivo,
    actual: params.actual,
  });
  if (!validado.ok) return { ok: false, error: validado.error };

  const { data, error } = await rpc("corregir_encuentro_sellado", {
    p_encuentro_id: params.encuentroId,
    p_clasificacion: validado.clasificacion,
    p_motivo: validado.motivo,
    p_admin_user_id: params.adminUserId,
    p_admin_email: params.adminEmail ?? null,
  });

  if (error) {
    // El mensaje de la DB viaja tal cual: son los `RAISE EXCEPTION` de la 021,
    // escritos para que los lea un humano (y son la única fuente de verdad de
    // por qué una corrección no se pudo aplicar).
    console.error("[correcciones] La corrección no se aplicó:", error.message);
    return { ok: false, error: error.message };
  }
  const fila = (Array.isArray(data) ? data[0] : data) as { id?: string } | null;
  return { ok: true, correccionId: fila?.id };
}

/** "2026-10" → "Octubre 2026" para los títulos de la pantalla. */
export function etiquetaPeriodo(periodo: string): string {
  const { desde } = rangoDePeriodo(periodo);
  const nombre = new Date(`${desde}T12:00:00Z`).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}
