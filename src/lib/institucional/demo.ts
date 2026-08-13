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
import { esInstitucional } from "@/lib/instancia";
import { normalizarTelefonoAR } from "@/lib/telefono";

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
  return (data ?? []) as ParticipanteDemo[];
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
 * Fail-safe hacia el lado seguro: ante cualquier error responde `true` SOLO si
 * la base lo dice; un error devuelve `false` y el documento sale sin marca…
 * pero eso no puede pasar en el B2C, donde el gate de modo corta antes.
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

/** Ids de los profesionales de demostración (para excluirlos de un reporte). */
export async function medicosDemo(): Promise<Set<string>> {
  if (!esInstitucional()) return new Set();
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("medicos")
      .select("id")
      .not("demo_sesion_id", "is", null);
    if (error) {
      console.error("[demo] No se pudieron listar los profesionales de demo:", error.message);
      return new Set();
    }
    return new Set((data ?? []).map((m) => m.id as string));
  } catch (err) {
    console.error("[demo] medicosDemo falló:", err);
    return new Set();
  }
}
