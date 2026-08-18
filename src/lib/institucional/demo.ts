// src/lib/institucional/demo.ts
// EL MODO DEMO de la instancia institucional (migración 025).
// SOLO instancia institucional — en B2C nada de esto existe y las funciones
// cortan por el gate de modo antes de tocar la base.
//
// ── QUÉ RESUELVE ─────────────────────────────────────────────────────────────
// En la reunión de venta, los participantes SON los actores: uno entra como
// profesional, otro como paciente, y el circuito ocurre en vivo. Este módulo es
// el registro de esa reunión — quién fue invitado, con qué rol, qué le creó el
// sistema y en qué estado está — y la puerta para borrarlo todo después.
//
// ── LA REGLA QUE MANDA ACÁ ADENTRO ───────────────────────────────────────────
// Los participantes son PERSONAS REALES. Su nombre y su celular viven en la
// base de la instancia y en ningún otro lado: ni en el repo (que es público),
// ni en un log, ni en un mensaje de commit, ni en un fixture de test. Todo lo
// que se loguea desde acá va sin PII: ids y contadores, nunca nombres.

import { createAdminClient } from "@/lib/supabase/admin";
import { getConfigInstitucion, dominioLimpio } from "@/lib/institucional/config";
import { esInstitucional } from "@/lib/instancia";
import { normalizarTelefonoAR } from "@/lib/telefono";
import { accesoSigueVivo } from "@/lib/institucional/accesos";

export type RolDemo = "profesional" | "paciente";
export type EstadoDemo = "invitado" | "entro" | "atendiendo";

export interface SesionDemo {
  id: string;
  nombre: string;
  fecha: string;
  notas: string | null;
  cerrada_at: string | null;
  created_at: string;
}

export interface ParticipanteDemo {
  id: string;
  sesion_id: string;
  nombre: string;
  celular: string | null;
  rol: RolDemo;
  estado: EstadoDemo;
  user_id: string | null;
  medico_id: string | null;
  paciente_id: string | null;
  acceso_id: string | null;
  entro_at: string | null;
  created_at: string;
}

// ─── Parte pura (testeable sin DB) ───────────────────────────────────────────

export interface DatosParticipanteRaw {
  nombre: string;
  celular?: string | null;
  rol: string;
  /** Opcional: si se carga, sale impreso en los documentos de la demo. */
  dni?: string | null;
  /** Opcional (AAAA-MM-DD): mismo criterio que el DNI. */
  fecha_nacimiento?: string | null;
  especialidad?: string | null;
}

export interface DatosParticipante {
  nombre: string;
  celular: string | null;
  rol: RolDemo;
  dni: string | null;
  fecha_nacimiento: string | null;
  especialidad: string | null;
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida la carga de un participante. Los ÚNICOS requisitos son nombre y rol:
 * el celular es opcional a propósito porque el camino garantizado de entrega es
 * el QR proyectado en la sala, no WhatsApp (que depende de que Meta tenga la
 * plantilla aprobada). Un participante sin celular igual entra escaneando.
 *
 * El DNI y la fecha de nacimiento son opcionales y existen por una sola razón:
 * un documento clínico sin DNI del paciente se ve pobre proyectado. Si no se
 * cargan, el papel sale igual — con la marca de demostración, que es lo que
 * importa.
 */
export function validarParticipante(
  raw: DatosParticipanteRaw
): { ok: true; datos: DatosParticipante } | { ok: false; error: string } {
  const nombre = (raw.nombre ?? "").trim().replace(/\s+/g, " ");
  if (nombre.length < 3) return { ok: false, error: "Cargá el nombre y el apellido." };
  if (nombre.length > 80) return { ok: false, error: "El nombre es demasiado largo." };

  if (raw.rol !== "profesional" && raw.rol !== "paciente") {
    return { ok: false, error: "Elegí si entra como profesional o como paciente." };
  }

  let celular: string | null = null;
  if ((raw.celular ?? "").trim()) {
    celular = normalizarTelefonoAR(raw.celular);
    if (!celular) {
      return { ok: false, error: "Ese celular no parece un móvil argentino de 10 dígitos." };
    }
  }

  let dni: string | null = null;
  if ((raw.dni ?? "").trim()) {
    dni = (raw.dni ?? "").replace(/\D/g, "");
    if (dni.length < 7 || dni.length > 9) {
      return { ok: false, error: "El DNI tiene que tener entre 7 y 9 dígitos (o dejalo vacío)." };
    }
  }

  let fechaNacimiento: string | null = null;
  if ((raw.fecha_nacimiento ?? "").trim()) {
    fechaNacimiento = (raw.fecha_nacimiento ?? "").trim();
    if (!FECHA_RE.test(fechaNacimiento) || Number.isNaN(new Date(fechaNacimiento + "T12:00:00").getTime())) {
      return { ok: false, error: "Fecha de nacimiento inválida (AAAA-MM-DD)." };
    }
    if (fechaNacimiento >= new Date().toISOString().slice(0, 10)) {
      return { ok: false, error: "La fecha de nacimiento tiene que ser pasada." };
    }
  }

  return {
    ok: true,
    datos: {
      nombre,
      celular,
      rol: raw.rol,
      dni,
      fecha_nacimiento: fechaNacimiento,
      especialidad: (raw.especialidad ?? "").trim() || null,
    },
  };
}

/**
 * Alias de correo NO ENTREGABLE para las cuentas de la demo, en un subdominio
 * reservado (`demo.`) que no tiene MX: nada puede llegar ahí jamás.
 *
 * Lleva un sufijo al azar y NO el nombre de la persona: es la casilla de una
 * cuenta descartable, no un dato de identidad. Que sea aleatorio además evita
 * que dos reuniones distintas colisionen sobre el mismo alias cuando la primera
 * ya se limpió.
 */
export function emailDemo(sufijo: string, dominioInstancia: string): string {
  const dominio = dominioInstancia
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  return `demo-${sufijo}@demo.${dominio}`;
}

/**
 * ¿Este mail es el alias no entregable de una cuenta de demostración?
 *
 * Existe porque ese alias se guarda en `pacientes.email` —es lo que hace que el
 * call center pueda asignarle un turno a un participante que entró sin celular
 * (el guard del otorgador exige `telefono || email`)— y NO tiene que usarse
 * jamás como canal de envío: el subdominio `demo.` no tiene MX, así que un mail
 * ahí es un rebote garantizado. El enlace de la reunión viaja por QR.
 */
export function esAliasDemo(email: string | null | undefined): boolean {
  return /^demo-[0-9a-f]+@demo\./i.test((email ?? "").trim());
}

/** Nombre por defecto de una reunión nueva: la fecha argentina, sin PII. */
export function nombreSesionPorDefecto(ahora: Date = new Date()): string {
  const ar = new Date(ahora.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const dd = String(ar.getDate()).padStart(2, "0");
  const mm = String(ar.getMonth() + 1).padStart(2, "0");
  return `Reunión ${dd}/${mm}`;
}

// ─── Sesiones ────────────────────────────────────────────────────────────────

const CAMPOS_SESION = "id, nombre, fecha, notas, cerrada_at, created_at";
const CAMPOS_PARTICIPANTE =
  "id, sesion_id, nombre, celular, rol, estado, user_id, medico_id, paciente_id, acceso_id, entro_at, created_at";

export async function crearSesionDemo(params: {
  nombre?: string | null;
  notas?: string | null;
  adminUserId: string;
}): Promise<{ ok: true; sesion: SesionDemo } | { ok: false; error: string }> {
  if (!esInstitucional()) return { ok: false, error: "El modo demo solo existe en la instancia institucional." };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("demo_sesiones")
    .insert({
      nombre: (params.nombre ?? "").trim() || nombreSesionPorDefecto(),
      notas: (params.notas ?? "").trim() || null,
      creada_por: params.adminUserId,
    })
    .select(CAMPOS_SESION)
    .single();
  if (error || !data) {
    console.error("[demo] No se pudo crear la sesión:", error?.message);
    return { ok: false, error: "No se pudo crear la reunión. Probá de nuevo." };
  }
  return { ok: true, sesion: data as SesionDemo };
}

export async function listarSesionesDemo(limite = 20): Promise<SesionDemo[]> {
  if (!esInstitucional()) return [];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("demo_sesiones")
    .select(CAMPOS_SESION)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) {
    console.error("[demo] No se pudieron listar las reuniones:", error.message);
    return [];
  }
  return (data ?? []) as SesionDemo[];
}

/**
 * El enlace de cada participante, para volver a dibujar su QR.
 *
 * Existe por la queja más justa que recibió esta pantalla (Diego, 18/08/2026):
 * *"Escaneá el QR y viví. No entiendo por qué regenerar y todo eso."*
 *
 * Antes de la migración 029 la base guardaba solo el hash del token, así que el
 * enlace vivía un instante —en la respuesta que lo creó— y recargar la pantalla
 * lo perdía para siempre. La única salida era emitir otro, que dejaba afuera a
 * quien ya había entrado: de ahí salían el botón "Regenerar", su diálogo de
 * advertencia, y un operador obligado a entender el modelo de tokens.
 *
 * Con el token guardado (SOLO en filas de demo — lo exige un CHECK), "Ver QR"
 * vuelve a ser lo que cualquiera espera: mostrar el mismo QR las veces que haga
 * falta.
 *
 * Devuelve un mapa `acceso_id → url`. Los accesos revocados quedan afuera: si
 * alguien fue sacado de la demo, su QR no se vuelve a mostrar.
 */
export async function enlacesDeSesion(
  accesoIds: (string | null | undefined)[]
): Promise<Record<string, string>> {
  const ids = accesoIds.filter((id): id is string => !!id);
  if (!esInstitucional() || ids.length === 0) return {};

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("accesos_link")
    .select("id, token_demo, revocado_at")
    .in("id", ids)
    .is("revocado_at", null);
  if (error) {
    // Best-effort: sin enlaces la pantalla sigue siendo usable (se puede cargar
    // gente); lo que se pierde es volver a mostrar un QR ya emitido.
    console.error("[demo] No se pudieron leer los enlaces:", error.message);
    return {};
  }

  const config = await getConfigInstitucion();
  const base = `https://${dominioLimpio(config.dominio)}/acceso/t/`;
  const mapa: Record<string, string> = {};
  for (const fila of data ?? []) {
    const token = fila.token_demo as string | null;
    if (token) mapa[fila.id as string] = `${base}${token}`;
  }
  return mapa;
}

export async function participantesDeSesion(sesionId: string): Promise<ParticipanteDemo[]> {
  if (!esInstitucional()) return [];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("demo_participantes")
    .select(CAMPOS_PARTICIPANTE)
    .eq("sesion_id", sesionId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[demo] No se pudieron listar los participantes:", error.message);
    return [];
  }
  const filas = (data ?? []) as ParticipanteDemo[];
  return conEstadoAtendiendo(filas);
}

/**
 * Sube a `atendiendo` a los que están adentro de un encuentro en curso.
 *
 * ── POR QUÉ SE DERIVA Y NO SE GUARDA ─────────────────────────────────────────
 * Lo dice la propia migración 025: "atendiendo — está en un encuentro (lo deriva
 * la pantalla, no se guarda acá)". El CHECK admitía el valor y el chip verde
 * estaba listo en la pantalla… pero nadie lo derivaba: `marcarParticipanteEntro`
 * es lo único que escribe estado, y solo hace invitado → entro. En la reunión,
 * el semáforo de Diego se quedaba en "Entró" para todos, incluso con la
 * videollamada en curso — justo la pieza que le dice de un vistazo si el
 * circuito arrancó.
 *
 * Best-effort: si la lectura falla, se devuelven los estados crudos. Un semáforo
 * que no late es lo que había; uno que rompe la pantalla de la reunión es peor.
 */
async function conEstadoAtendiendo(filas: ParticipanteDemo[]): Promise<ParticipanteDemo[]> {
  const medicoIds = filas.map((p) => p.medico_id).filter((x): x is string => !!x);
  const pacienteIds = filas.map((p) => p.paciente_id).filter((x): x is string => !!x);
  const userIds = filas.map((p) => p.user_id).filter((x): x is string => !!x);
  if (medicoIds.length === 0 && pacienteIds.length === 0) return filas;

  const enCurso = { medicos: new Set<string>(), pacientes: new Set<string>(), usuarios: new Set<string>() };
  try {
    const admin = createAdminClient();
    // ⚠ ASIMETRÍA HEREDADA DEL B2C: `turnos.paciente_id` apunta a `pacientes.id`
    // y `consultas.paciente_id`, a `auth.users.id`. Las dos consultas de abajo
    // existen por eso y no por gusto (mismo motivo que el trigger de la 025).
    const [ct, cc, tt, tp] = await Promise.all([
      medicoIds.length
        ? admin.from("consultas").select("medico_id").eq("estado", "en_curso").in("medico_id", medicoIds)
        : Promise.resolve({ data: [] as { medico_id: string }[] }),
      userIds.length
        ? admin.from("consultas").select("paciente_id").eq("estado", "en_curso").in("paciente_id", userIds)
        : Promise.resolve({ data: [] as { paciente_id: string }[] }),
      medicoIds.length
        ? admin.from("turnos").select("medico_id").eq("estado", "en_curso").in("medico_id", medicoIds)
        : Promise.resolve({ data: [] as { medico_id: string }[] }),
      pacienteIds.length
        ? admin.from("turnos").select("paciente_id").eq("estado", "en_curso").in("paciente_id", pacienteIds)
        : Promise.resolve({ data: [] as { paciente_id: string }[] }),
    ]);
    for (const f of ct.data ?? []) enCurso.medicos.add(f.medico_id as string);
    for (const f of tt.data ?? []) enCurso.medicos.add(f.medico_id as string);
    for (const f of cc.data ?? []) enCurso.usuarios.add(f.paciente_id as string);
    for (const f of tp.data ?? []) enCurso.pacientes.add(f.paciente_id as string);
  } catch (err) {
    console.error("[demo] No se pudo derivar quién está atendiendo:", err);
    return filas;
  }

  return filas.map((p) => {
    const adentro =
      (p.medico_id && enCurso.medicos.has(p.medico_id)) ||
      (p.paciente_id && enCurso.pacientes.has(p.paciente_id)) ||
      (p.user_id && enCurso.usuarios.has(p.user_id));
    return adentro ? { ...p, estado: "atendiendo" as const } : p;
  });
}

/**
 * Anota que un participante tocó su enlace y entró. Best-effort: nunca lanza y
 * nunca puede frenar el minteo de la sesión — es el semáforo de la pantalla de
 * Diego, no una condición de acceso.
 */
export async function marcarParticipanteEntro(accesoId: string): Promise<void> {
  if (!esInstitucional()) return;
  try {
    const admin = createAdminClient();
    await admin
      .from("demo_participantes")
      .update({ estado: "entro", entro_at: new Date().toISOString() })
      .eq("acceso_id", accesoId)
      .eq("estado", "invitado");
  } catch (err) {
    console.error("[demo] No se pudo anotar la entrada del participante:", err);
  }
}

// ─── A dónde entra el participante ───────────────────────────────────────────

/** Pantalla de espera del paciente de demo mientras no le asignaron nada. */
export const ESPERA_DEMO = "/acceso/espera";

/**
 * El destino del enlace de un paciente de la demo, resuelto EN EL MOMENTO en
 * que toca "Entrar" y no cuando se emitió el enlace.
 *
 * Es la diferencia entre el orden real de una reunión y el del producto: en el
 * producto, el turno existe antes que el enlace (el aviso sale de la
 * asignación). En la reunión es al revés — Diego carga al participante y
 * proyecta su QR, y recién después el call center le asigna el turno. Si el
 * destino se congelara al emitir, el enlace apuntaría para siempre a una
 * pantalla de espera.
 *
 * Prioridad: la consulta inmediata primero (es "ahora"), después el turno más
 * cercano. Sin nada, la pantalla de espera, que se refresca sola.
 */
export async function destinoDemoPaciente(params: {
  pacienteId: string; // pacientes.id
  userId: string; // auth.users.id — consultas.paciente_id (asimetría §3)
}): Promise<string> {
  if (!esInstitucional()) return ESPERA_DEMO;
  try {
    const admin = createAdminClient();
    const { data: consultas } = await admin
      .from("consultas")
      .select("id")
      .eq("paciente_id", params.userId)
      .in("estado", ["pagada", "en_curso"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (consultas && consultas.length > 0) return `/consulta/${consultas[0].id}/acceso`;

    const { data: turnos } = await admin
      .from("turnos")
      .select("id, fecha, hora_inicio")
      .eq("paciente_id", params.pacienteId)
      .in("estado", ["confirmado", "en_espera", "en_curso"])
      .order("fecha", { ascending: true })
      .order("hora_inicio", { ascending: true })
      .limit(1);
    if (turnos && turnos.length > 0) return `/turno/${turnos[0].id}/acceso`;
  } catch (err) {
    console.error("[demo] No se pudo resolver el destino del paciente:", err);
  }
  return ESPERA_DEMO;
}

// ─── La marca de demostración sobre el producto ──────────────────────────────

/**
 * ¿Este documento salió de una cuenta de demostración?
 *
 * Es la pregunta que decide la marca de agua del PDF y el cartel de la página
 * pública de verificación. Se lee con SERVICE ROLE y en una query aparte, a
 * propósito: `documentos.es_demo` es una columna que solo existe en la base de
 * la instancia, y sumarla al SELECT de `armarDocumentoParaPDF` —que en el B2C
 * corre con el cliente RLS contra una base donde la columna NO existe— rompería
 * la generación de TODOS los PDF del B2C.
 *
 * ── QUÉ PASA ANTE UN ERROR, Y POR QUÉ ────────────────────────────────────────
 * Devuelve `false`, o sea que el documento saldría sin marca. NO es un
 * "fail-safe hacia el lado seguro" —el lado seguro de esta pregunta es marcar de
 * más— y decía serlo: se corrige el texto, no la decisión, porque la decisión es
 * la correcta y la razón es asimétrica. Marcar de menos afecta a los documentos
 * de UNA reunión de venta, que dura horas y en la que además está el equipo
 * mirando. Marcar de más, ante un blip de la base, le estampa "SIN VALIDEZ
 * LEGAL" a la receta de un paciente real de la provincia, que la lleva a una
 * farmacia y se la rechazan.
 *
 * Lo que sí se arregló es el camino por el que esto pasaba DE VERDAD: no un
 * error de esta query (un SELECT por PK con service role), sino la falla blanda
 * de `brandingParaPDF`, que se tragaba la marca junto con el isologo. Ver allá.
 */
export async function documentoEsDemo(documentoId: string | null | undefined): Promise<boolean> {
  if (!esInstitucional() || !documentoId) return false;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("documentos")
      .select("es_demo")
      .eq("id", documentoId)
      .maybeSingle();
    if (error) {
      console.error("[demo] No se pudo leer la marca de demostración del documento:", error.message);
      return false;
    }
    return data?.es_demo === true;
  } catch (err) {
    console.error("[demo] documentoEsDemo falló:", err);
    return false;
  }
}

/**
 * Nombres de utilería que se congelan en TODO registro inmutable de la demo:
 * el snapshot de identidad del documento firmado y el log de no-repudio.
 *
 * ── POR QUÉ ACÁ Y NO EN LA LIMPIEZA ──────────────────────────────────────────
 * Porque esos dos registros NO SE PUEDEN LIMPIAR. `firma_logs` es append-only
 * por trigger, y mientras esa fila exista retiene por FK al `documento` que la
 * originó: el DELETE de la limpieza rebota con 23503. O sea que el nombre real
 * del participante que jugó a ser médico se quedaba para siempre adentro de
 * `documentos.firma_digital.identidad.medico_nombre` — y ese campo es el que
 * sirve `/verificar/{id}`, una página PÚBLICA Y SIN AUTH, con el mismo UUID que
 * quedó impreso en el papel proyectado y adentro del QR que la sala fotografió.
 *
 * Lo que no se escribe no hay que anonimizarlo después. El participante sigue
 * viendo su nombre en la pantalla (las tablas vivas no se tocan); lo que se
 * congela con nombre de utilería es únicamente lo inmutable.
 */
export const NOMBRE_UTILERIA = {
  profesional: "Profesional de demostración",
  paciente: "Paciente de demostración",
} as const;

/**
 * ¿Estas fichas son de una cuenta de demostración?
 *
 * Service role y query aparte, por el motivo de siempre: `demo_sesion_id` es una
 * columna que SOLO existe en la base de la instancia, y sumarla al SELECT de
 * `construirIdentidadDocumento` —que en el B2C corre contra una base donde no
 * existe— rompería la firma de TODOS los documentos del B2C.
 *
 * ── ANTE UN ERROR DE LECTURA: `null`, Y LA FIRMA SE ABORTA ───────────────────
 * Esto devolvía `{medico:false, paciente:false}` ante cualquier error, con el
 * argumento de que responder "sí" de más congelaría el nombre de un profesional
 * REAL como "Profesional de demostración" adentro de un papel válido.
 *
 * El argumento estaba bien planteado y la conclusión mal: las dos respuestas
 * inventadas son daños permanentes, así que la salida no era elegir una sino no
 * inventar ninguna. Reproducido interceptando el SELECT: el snapshot quedaba con
 * el nombre real del participante y su DNI, congelados para siempre en una fila
 * que no se puede borrar y que sirve una página pública — y el incidente entero
 * vivía en un `console.error` que nadie mira.
 *
 * `null` significa "no se pudo saber", y el caller de la firma
 * (`construirIdentidadDocumento`) ya sabe qué hacer con eso: devuelve `null` y
 * NO se firma. El trade-off es explícito y es el correcto para PII: es mejor no
 * emitir un documento —el profesional reintenta y se emite treinta segundos
 * después— que emitir uno con datos personales que después no hay forma de
 * sacar.
 *
 * En B2C el gate de modo corta antes de tocar la base y esto NUNCA devuelve
 * `null`: el camino de la firma del B2C es byte a byte el de siempre.
 */
export async function cuentasDeDemostracion(params: {
  medicoId?: string | null;
  pacienteId?: string | null;
}): Promise<{ medico: boolean; paciente: boolean } | null> {
  if (!esInstitucional()) return { medico: false, paciente: false };
  try {
    const admin = createAdminClient();
    const [m, p] = await Promise.all([
      params.medicoId
        ? admin.from("medicos").select("demo_sesion_id").eq("id", params.medicoId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      params.pacienteId
        ? admin.from("pacientes").select("demo_sesion_id").eq("id", params.pacienteId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (m.error || p.error) {
      // El rastro accionable: dice qué se abortó, sobre qué ficha y por qué, con
      // ids y ningún nombre (el repo es público y los logs también se leen).
      console.error(
        "[demo][FIRMA-ABORTADA] No se pudo determinar si las fichas son de demostración; " +
          "no se firma para no congelar datos personales:",
        JSON.stringify({
          medico_id: params.medicoId ?? null,
          paciente_id: params.pacienteId ?? null,
          error_medico: m.error?.message ?? null,
          error_paciente: p.error?.message ?? null,
        })
      );
      return null;
    }
    return {
      medico: Boolean((m.data as { demo_sesion_id?: string | null } | null)?.demo_sesion_id),
      paciente: Boolean((p.data as { demo_sesion_id?: string | null } | null)?.demo_sesion_id),
    };
  } catch (err) {
    console.error(
      "[demo][FIRMA-ABORTADA] cuentasDeDemostracion falló; no se firma:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

/**
 * De estos profesionales de la reunión, ¿cuáles NO tienen claves de firma?
 *
 * Es lo que la pantalla necesita para poder decirlo ANTES de la Escena 4: sin
 * claves, `firmarDocumentoPorSesion` corta con "Médico sin claves de firma
 * activas", el documento queda sin `firma_digital` y `/verificar/{id}` muestra
 * el ámbar "documento sin sello electrónico" — proyectado, encima del cartel de
 * demostración.
 */
export async function medicosSinFirma(medicoIds: string[]): Promise<Set<string>> {
  const sinFirma = new Set(medicoIds);
  if (!esInstitucional() || medicoIds.length === 0) return new Set();
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("medico_claves")
      .select("medico_id")
      .in("medico_id", medicoIds)
      .eq("activa", true);
    if (error) {
      console.error("[demo] No se pudo leer qué profesionales tienen firma:", error.message);
      // Ante la duda NO se acusa: un chip rojo falso en la pantalla de la
      // reunión manda a Diego a resolver un problema que no existe.
      return new Set();
    }
    for (const fila of data ?? []) sinFirma.delete(fila.medico_id as string);
    return sinFirma;
  } catch (err) {
    console.error("[demo] medicosSinFirma falló:", err);
    return new Set();
  }
}

// ─── El profesional invitado, después de haber entrado ───────────────────────

/**
 * ¿El acceso que abrió esta sesión de profesional sigue vivo?
 *
 * El enlace del participante es una credencial bearer: quien lo tiene, entra —
 * y se proyecta en la pared de una sala de reuniones, donde cualquiera lo
 * fotografía. Revocar el token (lo que hacen "mostrar QR" y "limpiar reunión")
 * apagaba la puerta pero no echaba a quien ya estaba adentro: esa sesión se
 * renovaba sola por refresh token y no vencía nunca.
 *
 * Esta es la mitad que faltaba, y la miran las pantallas del profesional en cada
 * request, igual que las del paciente.
 *
 * ── FAIL-OPEN A PROPÓSITO PARA TODOS LOS DEMÁS ───────────────────────────────
 * Solo se le exige la cookie a un profesional CON `demo_sesion_id`. Un
 * profesional real de la institución (y cualquiera del B2C) entra por login con
 * contraseña y no tiene ninguna cookie de acceso: exigírsela lo dejaría afuera
 * de su propio dashboard. El gate es de la demo y de nadie más.
 */
export async function profesionalDemoSigueAdentro(params: {
  medicoId: string;
  accesoId: string | undefined;
}): Promise<boolean> {
  if (!esInstitucional()) return true;
  let esDemo = false;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("medicos")
      .select("demo_sesion_id")
      .eq("id", params.medicoId)
      .maybeSingle();
    if (error) {
      // No se pudo saber si es de demo. Se deja pasar: cerrarle el dashboard a
      // un profesional real por un blip de la base es el error caro de este
      // lado, y el token en sí ya vence en horas.
      console.error("[demo] No se pudo leer si el profesional es de demostración:", error.message);
      return true;
    }
    esDemo = Boolean(data?.demo_sesion_id);
  } catch (err) {
    console.error("[demo] profesionalDemoSigueAdentro falló:", err);
    return true;
  }
  if (!esDemo) return true;
  return accesoSigueVivo({ accesoId: params.accesoId, medicoId: params.medicoId });
}
