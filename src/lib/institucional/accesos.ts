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

  // ── PRIMERO INSERTAR, DESPUÉS REVOCAR ──────────────────────────────────────
  // El orden era el inverso: se revocaban los tokens vivos y recién ahí se
  // insertaba el nuevo. Si el insert fallaba (constraint, blip de PostgREST),
  // esta función devolvía null y el paciente quedaba con CERO enlaces vivos:
  // perdió el que tenía y no recibió ninguno. Era la mitad cara de la operación
  // ejecutándose después de la barata e irreversible.
  //
  // Al revés, el peor caso es que convivan dos tokens vivos unos milisegundos
  // (o hasta que alguien mire los logs, si la revocación falla) — visible,
  // arreglable, y ninguno de los dos lleva a un lugar equivocado.
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

  // Un token vivo por (paciente, encuentro): revocar los previos del recurso,
  // todos menos el que se acaba de emitir.
  const revocacion = admin
    .from("accesos_link")
    .update({ revocado_at: new Date().toISOString() })
    .eq("paciente_id", params.pacienteId)
    .is("revocado_at", null)
    .neq("id", data.id);
  const { error: errRevocar } = params.turnoId
    ? await revocacion.eq("turno_id", params.turnoId)
    : await revocacion.eq("consulta_id", params.consultaId!);
  if (errRevocar) {
    console.error("[accesos] No se pudieron revocar tokens previos:", errRevocar.message);
    // Se sigue igual: el token nuevo es el que viaja; el viejo vence solo.
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

// ─── Frenos de la landing (migración 011) ────────────────────────────────────
//
// Son DOS frenos con trabajos distintos, y confundirlos era el bug:
//
//   · POR ENLACE (IP + token_hash) — le pone techo al martilleo de UN link
//     legítimo. Es el que ya estaba y para lo suyo funciona.
//   · POR IP (la IP sola, contando FALLOS) — le pone techo al que BARRE
//     tokens. Faltaba: como el token formaba parte de la clave, cada intento
//     con un token distinto estrenaba bucket, el contador arrancaba en 1 y el
//     techo no se disparaba NUNCA. El único a quien el freno alcanzaba era el
//     paciente legítimo, que sí repite el mismo token.
//
// El de IP cuenta SOLO intentos fallidos, a propósito: un paciente de verdad
// nunca falla (su token existe), así que ni con media provincia detrás de la
// misma IP de la operadora se puede dejar a nadie afuera.
//
// Y el ORDEN importa tanto como los frenos. El bucket por enlace se toca
// DESPUÉS de validar el token: antes se escribía una fila por request, o sea
// que un loop anónimo con basura en el campo era, literalmente, un INSERT por
// request en la base de la instancia — lo contrario de lo que promete el
// comentario de la migración ("un bucket por clave, no una fila por intento").
// Ahora la cardinalidad está acotada: una fila por IP que falla, una por enlace
// real, y las viejas se barren.

const VENTANA_MIN = 15;
/** Intentos permitidos sobre UN mismo enlace desde una misma IP. */
const INTENTOS_MAX_POR_ENLACE = 10;
/** Intentos FALLIDOS permitidos por IP: el techo del que enumera. */
const FALLOS_MAX_POR_IP = 30;
/** Los buckets se olvidan al día: la ventana es de 15 minutos. */
const BUCKET_VIVE_MS = DIA_MS;

/**
 * Estos números se quedan en el código a propósito, mientras el resto del
 * ciclo de vida se fue al config: son un techo ANTI-ABUSO, no política de la
 * institución. Un campo editable desde /admin que aflojara el freno sería un
 * botón para desactivar una defensa sin que nadie lo note.
 */
function claveBucket(partes: string): string {
  return createHash("sha256").update(partes, "utf8").digest("hex");
}

/**
 * Barrido de buckets viejos. La migración 011 crea el índice
 * `idx_accesos_intentos_updated` "para que los limpie el propio código, de a
 * poco" — y ese código no existía: la tabla solo crecía. Se hace acá, en una de
 * cada cincuenta llamadas, para no sumar un cron por una tabla de juguete.
 * Fire-and-forget: que el barrido falle no puede demorar a nadie.
 */
function barrerBucketsViejos(admin: ReturnType<typeof createAdminClient>): void {
  if (Math.random() > 0.02) return;
  const corte = new Date(Date.now() - BUCKET_VIVE_MS).toISOString();
  void admin
    .from("accesos_intentos")
    .delete()
    .lt("updated_at", corte)
    .then(({ error }) => {
      if (error) console.error("[accesos] No se pudieron barrer los buckets viejos:", error.message);
    });
}

/**
 * Suma uno al bucket y dice si todavía está por debajo del techo.
 *
 * Fail-OPEN a propósito: si el freno se cae, el paciente igual entra. El riesgo
 * de dejar afuera a alguien con un turno en curso es mayor que el de un rato
 * sin techo de intentos sobre un token de 32 bytes al azar.
 */
async function tocarBucket(clave: string, max: number): Promise<boolean> {
  const ahora = new Date();
  try {
    const admin = createAdminClient();
    barrerBucketsViejos(admin);

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

    if (data.intentos >= max) return false;

    await admin
      .from("accesos_intentos")
      .update({ intentos: data.intentos + 1, updated_at: ahora.toISOString() })
      .eq("clave", clave);
    return true;
  } catch (err) {
    console.error("[accesos] Freno de intentos no disponible, se deja pasar:", err);
    return true;
  }
}

/**
 * Freno del martilleo de UN enlace desde UNA IP. Se llama con un token que YA
 * validó: así el bucket solo existe para enlaces reales.
 */
export async function permitirIntentoAcceso(ip: string, tokenHash: string): Promise<boolean> {
  return tocarBucket(claveBucket(`enlace|${ip}|${tokenHash}`), INTENTOS_MAX_POR_ENLACE);
}

/**
 * ¿Esta IP ya quemó su cupo de intentos FALLIDOS? SOLO LEE: no crea ninguna
 * fila, así que un barrido de tokens inexistentes no puede hacer crecer la
 * tabla por el simple hecho de preguntar.
 */
export async function ipQuemadaPorFallos(ip: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("accesos_intentos")
      .select("ventana_inicio, intentos")
      .eq("clave", claveBucket(`ip|${ip}`))
      .maybeSingle();
    if (!data) return false;
    if (new Date(data.ventana_inicio).getTime() + VENTANA_MIN * 60_000 <= Date.now()) return false;
    return data.intentos >= FALLOS_MAX_POR_IP;
  } catch (err) {
    console.error("[accesos] Freno por IP no disponible, se deja pasar:", err);
    return false;
  }
}

/** Anota un intento FALLIDO de esa IP (token que no existe, venció o murió). */
export async function anotarFalloDeAcceso(ip: string): Promise<void> {
  // Sin techo acá: el techo lo aplica `ipQuemadaPorFallos` al leer. Esta
  // función solo cuenta.
  await tocarBucket(claveBucket(`ip|${ip}`), Number.MAX_SAFE_INTEGER);
}

// ─── Revocación (spec §5.4, matriz de revocación) ────────────────────────────

/**
 * Motivos en los que revocar NO alcanza con apagar el token: hay que echar
 * también a quien YA entró con él.
 *
 * Son los dos casos de seguridad que el propio comentario de abajo dice
 * cubrir. En los dos, el link está en manos de alguien que no corresponde
 * —teléfono robado, fila equivocada del padrón— y esa persona muy
 * probablemente ya tocó "Entrar": apagar el token solo le cierra la puerta por
 * la que no piensa volver a pasar.
 *
 * `reprogramacion` NO entra a propósito: matar la sesión ahí echaría al
 * paciente de una llamada en curso, y el link viejo apagado + el nuevo en su
 * WhatsApp ya resuelven el caso. `cancelacion` tampoco: la pantalla del
 * paciente pasa sola al estado F cuando el turno cambia de estado.
 */
const MOTIVOS_DE_SEGURIDAD = new Set(["manual", "cambio_contacto"]);

/**
 * Cierra las sesiones abiertas de estos pacientes. Best-effort: nunca lanza.
 *
 * ── POR QUÉ VÍA RPC Y NO CON EL SDK ──────────────────────────────────────────
 * `auth.admin.signOut()` de @supabase/supabase-js pide el JWT del usuario, que
 * es justo lo que no tenemos (la sesión vive en el teléfono del otro). No hay
 * en el SDK ninguna forma de revocar por user_id, así que la revocación baja a
 * SQL: la función `cerrar_sesiones_de_usuario` de la migración 013 borra las
 * filas de `auth.sessions` y `auth.refresh_tokens` del usuario.
 *
 * ⚠ VENTANA CONOCIDA: el access token que ese navegador ya tiene sigue siendo
 * válido hasta que expira (una hora, el default de Supabase). Después no puede
 * renovarlo y queda afuera. Para el intervalo intermedio está la otra mitad de
 * la defensa: la cookie del acceso (`accesoSigueVivo`), que las pantallas del
 * paciente miran en CADA request y que se apaga en el mismo instante que el
 * token.
 */
async function cerrarSesionesDe(pacienteIds: string[]): Promise<void> {
  const unicos = [...new Set(pacienteIds.filter(Boolean))];
  if (unicos.length === 0) return;
  try {
    const admin = createAdminClient();
    const { data: pacientes } = await admin.from("pacientes").select("user_id").in("id", unicos);
    for (const p of pacientes ?? []) {
      if (!p.user_id) continue;
      const { error } = await admin.rpc("cerrar_sesiones_de_usuario", { p_user_id: p.user_id });
      if (error) {
        console.error("[accesos] No se pudo cerrar la sesión del paciente:", error.message);
      }
    }
  } catch (err) {
    console.error("[accesos] cerrarSesionesDe falló:", err);
  }
}

/**
 * Apaga TODOS los tokens vivos de un encuentro. Después de esto, el link que
 * el paciente tiene en su WhatsApp muestra "este enlace ya no está activo".
 *
 * Se llama cuando el encuentro deja de existir como tal: reprogramación
 * (llega otro link con el turno nuevo), cancelación, o una revocación manual
 * del admin institucional (teléfono robado, error de padrón).
 *
 * En los motivos de seguridad, además, cierra la sesión que ese link ya haya
 * minteado: sin eso, revocar apagaba el enlace y dejaba adentro —con acceso a
 * los documentos clínicos del paciente— a quien tuviera el teléfono.
 *
 * Devuelve cuántos apagó. Nunca lanza: la revocación es la mitad barata de la
 * operación —la cara es re-acuñar y avisar— y no puede voltear lo que ya se
 * hizo. Si falla, queda en los logs y el token viejo vence solo.
 */
export async function revocarAccesosDe(params: {
  turnoId?: string;
  consultaId?: string;
  motivo: "reprogramacion" | "cancelacion" | "manual" | "cambio_contacto";
}): Promise<number> {
  if (!params.turnoId && !params.consultaId) return 0;
  try {
    const admin = createAdminClient();
    const query = admin
      .from("accesos_link")
      .update({ revocado_at: new Date().toISOString() })
      .is("revocado_at", null);
    const { data, error } = params.turnoId
      ? await query.eq("turno_id", params.turnoId).select("id, paciente_id")
      : await query.eq("consulta_id", params.consultaId!).select("id, paciente_id");
    if (error) {
      console.error("[accesos] No se pudieron revocar los tokens:", error.message, params.motivo);
      return 0;
    }
    if (MOTIVOS_DE_SEGURIDAD.has(params.motivo)) {
      await cerrarSesionesDe((data ?? []).map((f) => f.paciente_id as string));
    }
    return data?.length ?? 0;
  } catch (err) {
    console.error("[accesos] revocarAccesosDe falló:", err);
    return 0;
  }
}

// ─── La cookie del acceso: el token también acota lo que ya minteó ───────────
//
// El scoping de R18/R19 (turno, vigencia, estado del encuentro) vivía SOLO en
// la puerta: pasado el verifyOtp, lo que quedaba en el navegador era la sesión
// completa del paciente, sin ninguna marca de qué acceso la originó. Dos
// efectos: un link reenviado a un tercero —o abierto en un teléfono
// compartido, escenario probable en un padrón provincial— servía para TODOS
// los encuentros del paciente y no solo para el del token; y cuando el token
// vencía a los 30 días, la sesión seguía viva.
//
// El arreglo es una cookie httpOnly con el id del acceso que minteó la sesión.
// Las pantallas del paciente la miran en cada request: si ese acceso se revocó,
// venció o no corresponde al encuentro que se está pidiendo, se ve el estado F.
// Con esto `revocado_at` y `expira_at` pasan a valer también DESPUÉS del
// minteo, que es donde no valían.

export const COOKIE_ACCESO = "docto_acceso";

/** Segundos que puede vivir la cookie: nunca más que el token que la creó. */
export function segundosDeVida(expiraAt: string): number {
  const restante = Math.floor((new Date(expiraAt).getTime() - Date.now()) / 1000);
  return Math.max(60, Math.min(restante, 400 * 24 * 3600));
}

/**
 * ¿El acceso que abrió esta sesión sigue vivo y es el de ESTE encuentro?
 *
 * Fail-closed: sin cookie, con una fila que no existe, revocada, vencida, de
 * otro paciente o de otro encuentro → false, y la pantalla muestra "este
 * enlace ya no está activo" con el camino para pedir uno nuevo. Un paciente
 * legítimo que perdió la cookie vuelve a tocar su link y entra igual.
 */
export async function accesoSigueVivo(params: {
  accesoId: string | undefined;
  pacienteId: string;
  turnoId?: string;
  consultaId?: string;
}): Promise<boolean> {
  if (!params.accesoId) return false;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("accesos_link")
      .select("paciente_id, turno_id, consulta_id, expira_at, revocado_at")
      .eq("id", params.accesoId)
      .maybeSingle();
    if (!data) return false;
    if (data.revocado_at) return false;
    if (new Date(data.expira_at).getTime() <= Date.now()) return false;
    if (data.paciente_id !== params.pacienteId) return false;
    if (params.turnoId && data.turno_id !== params.turnoId) return false;
    if (params.consultaId && data.consulta_id !== params.consultaId) return false;
    return true;
  } catch (err) {
    console.error("[accesos] No se pudo comprobar el acceso de la sesión:", err);
    return false;
  }
}
