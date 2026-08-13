// src/lib/institucional/accesos.ts
// Emisión del LINK DE ACCESO del paciente (tabla accesos_link, migración 004).
// SOLO instancia institucional.
//
// El link que viaja por WhatsApp/mail es NUESTRO token: en DB queda solo el
// sha256; el token pelado viaja una vez en el mensaje y NUNCA se guarda ni se
// loguea. Este módulo tiene las dos mitades del link:
//   · EMISIÓN     — crearAccesoLink (Etapa 2): acuña el token y revoca el previo.
//   · VALIDACIÓN  — validarTokenAcceso (Etapa 3): la usa el POST de la landing
//                   /acceso/t/[token] antes de mintear la sesión.
//
// Regla (spec §5.4, propuesta vigente): UN token vivo por (paciente, encuentro)
// — emitir uno nuevo revoca los anteriores del mismo recurso. Expiración:
// fin del encuentro + `vigencia_documentos_dias` del config (la CI ancla en
// ahora + esos días). El número es política de la institución, no constante:
// vive en institucion_config (migración 011).

import { createHash, randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConfigInstitucion } from "@/lib/institucional/config";

const DIA_MS = 24 * 3600_000;

export interface AccesoEmitido {
  url: string; // https://<dominio>/acceso/t/<token>
  accesoId: string;
}

/** sha256 hex del token pelado — lo ÚNICO que toca la base. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function crearAccesoLink(params: {
  pacienteId: string; // pacientes.id
  turnoId?: string;
  consultaId?: string;
  destino: string; // path de aterrizaje post-login
  /** null SOLO cuando el token lo pidió el propio paciente (reenvío). */
  operadorId: string | null;
  /**
   * null = sin canal automático de envío (hallazgo revisión Etapa 2): el
   * acceso se emite IGUAL — la asignación ya está hecha y el operador necesita
   * el link como fallback manual. El envío es mejor esfuerzo; el token no.
   */
  canal: "whatsapp" | "mail" | null;
  enviadoA: string | null; // celular/mail al momento del envío (null = sin canal)
  /** Instante del encuentro (turno): ancla de la expiración. */
  encuentroMs?: number;
  /**
   * De dónde salió este token (migración 012). `reenvio_paciente` es el único
   * que puede venir SIN operador: lo pidió el paciente desde la pantalla
   * pública, no lo emitió nadie del call center.
   */
  origen?: "asignacion" | "reenvio_paciente" | "reprogramacion";
}): Promise<AccesoEmitido | null> {
  if (!params.turnoId === !params.consultaId) {
    // exactamente uno (CHECK accesos_link_un_recurso)
    console.error("[accesos] crearAccesoLink: se necesita turnoId XOR consultaId");
    return null;
  }

  const admin = createAdminClient();
  const config = await getConfigInstitucion();

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const ancla = params.encuentroMs && !Number.isNaN(params.encuentroMs) ? params.encuentroMs : Date.now();
  const expiraAt = new Date(ancla + config.vigencia_documentos_dias * DIA_MS).toISOString();

  // Un token vivo por (paciente, encuentro): revocar los previos del recurso.
  const revocacion = admin
    .from("accesos_link")
    .update({ revocado_at: new Date().toISOString() })
    .eq("paciente_id", params.pacienteId)
    .is("revocado_at", null);
  const { error: errRevocar } = params.turnoId
    ? await revocacion.eq("turno_id", params.turnoId)
    : await revocacion.eq("consulta_id", params.consultaId!);
  if (errRevocar) {
    console.error("[accesos] No se pudieron revocar tokens previos:", errRevocar.message);
    // Se sigue igual: el token nuevo es el que viaja; el viejo vence solo.
  }

  const { data, error } = await admin
    .from("accesos_link")
    .insert({
      paciente_id: params.pacienteId,
      turno_id: params.turnoId ?? null,
      consulta_id: params.consultaId ?? null,
      token_hash: tokenHash,
      destino: params.destino,
      expira_at: expiraAt,
      creado_por: params.operadorId,
      origen: params.origen ?? "asignacion",
      canal: params.canal, // nullable (migración 010: enviado_a sin NOT NULL)
      enviado_a: params.enviadoA,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[accesos] No se pudo emitir el acceso:", error?.message);
    return null;
  }

  const dominio = config.dominio.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return { url: `https://${dominio}/acceso/t/${token}`, accesoId: data.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDACIÓN — la mitad que abre la puerta (spec §5.2, Etapa 3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Por qué un link no sirve. OJO: estos motivos son para los LOGS y para decidir
 * qué pantalla mostrar del lado nuestro — NUNCA se le dicen al visitante. La
 * landing muestra SIEMPRE el mismo estado F ("Este enlace ya no está activo"),
 * exista o no el token: distinguir "no existe" de "venció" convertiría la
 * página en un oráculo que confirma tokens ajenos.
 */
export type MotivoAccesoInvalido =
  | "formato"
  | "no_existe"
  | "revocado"
  | "vencido"
  | "encuentro_terminado"; // el turno se reprogramó/canceló: el link viejo murió con él

export interface AccesoValido {
  id: string;
  pacienteId: string; // pacientes.id
  turnoId: string | null;
  consultaId: string | null;
  destino: string; // path de aterrizaje (siempre relativo — se valida al usarlo)
  expiraAt: string;
}

export type ResultadoValidacion =
  | { ok: true; acceso: AccesoValido }
  | { ok: false; motivo: MotivoAccesoInvalido };

// Token = randomBytes(32) en base64url → 43 chars del alfabeto url-safe.
const TOKEN_RE = /^[A-Za-z0-9_-]{20,200}$/;

/**
 * Estados en los que el ENCUENTRO ya no puede recibir a nadie y su link muere
 * con él, aunque `expira_at` siga en el futuro (R19: "el link vive mientras
 * viva el turno"). Reprogramado y cancelado son los dos casos: en ambos existe
 * —o va a existir— otro turno con su propio link, y mandar al paciente a un
 * turno muerto es peor que decirle que el enlace no está activo.
 *
 * Los terminales "el turno pasó" (completado, ausente_*) NO entran: ahí es
 * justamente cuando el paciente vuelve a buscar sus documentos, que es para lo
 * que existen los `vigencia_documentos_dias`.
 */
const TURNO_MUERTO = new Set(["reprogramado", "cancelado_paciente", "cancelado_medico", "disponible", "bloqueado"]);
const CONSULTA_MUERTA = new Set(["cancelada", "rechazada"]);

/**
 * Valida el token pelado que llega en la URL contra `accesos_link`.
 *
 * Orden: formato → hash → fila viva (no revocada, no vencida) → estado del
 * encuentro. Service role SIEMPRE (la tabla no tiene grants para PostgREST).
 * Nunca lanza: cualquier error de DB devuelve "no_existe" (fail-closed).
 *
 * NO tiene efectos: no consume el token (multi-click gratis, spec §5.2) ni
 * anota el uso — eso lo hace `registrarUsoAcceso` cuando la sesión SE MINTEA.
 */
export async function validarTokenAcceso(token: string): Promise<ResultadoValidacion> {
  if (!token || !TOKEN_RE.test(token)) return { ok: false, motivo: "formato" };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("accesos_link")
    .select("id, paciente_id, turno_id, consulta_id, destino, expira_at, revocado_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (error) {
    // Fail-closed: un blip de DB no abre la puerta.
    console.error("[accesos] Error validando token:", error.message);
    return { ok: false, motivo: "no_existe" };
  }
  if (!data) return { ok: false, motivo: "no_existe" };
  if (data.revocado_at) return { ok: false, motivo: "revocado" };
  if (new Date(data.expira_at).getTime() <= Date.now()) return { ok: false, motivo: "vencido" };

  // Vigencia por ESTADO del encuentro, además de por fecha (R19).
  if (data.turno_id) {
    const { data: turno } = await admin.from("turnos").select("estado").eq("id", data.turno_id).maybeSingle();
    if (!turno || TURNO_MUERTO.has(turno.estado)) return { ok: false, motivo: "encuentro_terminado" };
  } else if (data.consulta_id) {
    const { data: consulta } = await admin
      .from("consultas")
      .select("estado")
      .eq("id", data.consulta_id)
      .maybeSingle();
    if (!consulta || CONSULTA_MUERTA.has(consulta.estado)) return { ok: false, motivo: "encuentro_terminado" };
  }

  return {
    ok: true,
    acceso: {
      id: data.id,
      pacienteId: data.paciente_id,
      turnoId: data.turno_id,
      consultaId: data.consulta_id,
      destino: data.destino,
      expiraAt: data.expira_at,
    },
  };
}

/** Anota el uso del link (contador + último uso). Best-effort: nunca lanza. */
export async function registrarUsoAcceso(accesoId: string, usosPrevios?: number): Promise<void> {
  try {
    const admin = createAdminClient();
    // Sin RPC de incremento: se lee y se escribe. Perder un conteo en una
    // carrera es irrelevante (es telemetría, no un límite).
    let usos: number;
    if (usosPrevios === undefined) {
      const { data } = await admin.from("accesos_link").select("usos_count").eq("id", accesoId).maybeSingle();
      usos = data?.usos_count ?? 0;
    } else {
      usos = usosPrevios;
    }
    await admin
      .from("accesos_link")
      .update({ usos_count: usos + 1, ultimo_uso_at: new Date().toISOString() })
      .eq("id", accesoId);
  } catch (err) {
    console.error("[accesos] No se pudo registrar el uso del link:", err);
  }
}

/**
 * Destino seguro: solo paths relativos de nuestro propio sitio. `destino` sale
 * de la base, pero el que mintea la sesión es este flujo — un valor sucio
 * (o una fila escrita a mano) no puede convertir el link en un redirect
 * abierto hacia otro dominio.
 */
export function destinoSeguro(destino: string | null | undefined, fallback: string): string {
  if (!destino) return fallback;
  if (!destino.startsWith("/") || destino.startsWith("//") || destino.includes("://")) return fallback;
  return destino;
}

// ─── Freno de fuerza bruta de la landing (migración 011) ─────────────────────

/** Intentos permitidos por (IP + token) dentro de la ventana. */
const INTENTOS_MAX = 10;
const VENTANA_MIN = 15;

/**
 * Estos DOS números se quedan en el código a propósito, mientras el resto del
 * ciclo de vida se fue al config: son un techo ANTI-ABUSO, no política de la
 * institución. Un campo editable desde /admin que aflojara el freno sería un
 * botón para desactivar una defensa sin que nadie lo note.
 */
export async function permitirIntentoAcceso(ip: string, tokenHash: string): Promise<boolean> {
  const clave = createHash("sha256").update(`${ip}|${tokenHash}`, "utf8").digest("hex");
  const ahora = new Date();
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("accesos_intentos")
      .select("ventana_inicio, intentos")
      .eq("clave", clave)
      .maybeSingle();

    const venceVentana =
      !data || new Date(data.ventana_inicio).getTime() + VENTANA_MIN * 60_000 <= ahora.getTime();

    if (venceVentana) {
      await admin.from("accesos_intentos").upsert({
        clave,
        ventana_inicio: ahora.toISOString(),
        intentos: 1,
        updated_at: ahora.toISOString(),
      });
      return true;
    }

    if (data.intentos >= INTENTOS_MAX) return false;

    await admin
      .from("accesos_intentos")
      .update({ intentos: data.intentos + 1, updated_at: ahora.toISOString() })
      .eq("clave", clave);
    return true;
  } catch (err) {
    // Fail-OPEN a propósito: si el freno se cae, el paciente igual entra. El
    // riesgo de dejar afuera a alguien con un turno en curso es mayor que el
    // de un rato sin techo de intentos sobre un token de 32 bytes al azar.
    console.error("[accesos] Freno de intentos no disponible, se deja pasar:", err);
    return true;
  }
}
