// src/lib/institucional/provisionar.ts
// Alta provisionada del paciente institucional (spec institucional §5.1).
// SOLO instancia institucional — en B2C ninguna entrada llega acá (gate por
// modo adentro, patrón resolverRolInstitucional).
//
// UNA función para las tres entradas (pantalla del panel, import CSV, API para
// operadores IA): `provisionarPaciente`. El alta ocurre UNA vez; re-importar el
// padrón no duplica (idempotencia por DNI → update de contacto).
//
// DOS ESCRITURAS, NO UNA (asimetría de schema por canal):
//   - `auth.users` (createUser SIN contraseña): sin cuenta auth el link-sesión
//     de la Etapa 3 no puede loguear al paciente.
//   - `pacientes`: sin fila no se pueden asignar turnos (turnos.paciente_id =
//     pacientes.id) ni consultas (consultas.paciente_id = auth.users.id).
//
// EMAIL SINTÉTICO (propuesta spec §5.1, pendiente #5 de Diego): auth.users
// exige email. Sin mail en el padrón → alias NO ENTREGABLE determinístico por
// DNI en un subdominio reservado del dominio de la instancia. Nunca se envía
// nada ahí (el OTP del link-sesión viaja server-side); si el paciente aporta
// mail real después, se reemplaza con auth.admin.updateUserById.

import { createAdminClient } from "@/lib/supabase/admin";
import { esInstitucional } from "@/lib/instancia";
import { getConfigInstitucion } from "@/lib/institucional/config";
import { normalizarTelefonoAR } from "@/lib/telefono";

// ─── Parte pura (testeable sin DB) ───────────────────────────────────────────

/** Datos crudos como llegan de un form / una fila de CSV / un caller de API. */
export interface DatosProvisionRaw {
  dni: string;
  nombre_completo: string;
  fecha_nacimiento: string; // YYYY-MM-DD
  sexo_dni?: string | null;
  localidad?: string | null;
  celular?: string | null;
  email?: string | null;
}

export interface DatosProvision {
  dni: string; // solo dígitos
  nombre_completo: string;
  fecha_nacimiento: string;
  sexo_dni: "masculino" | "femenino" | null;
  localidad: string | null;
  celular: string | null; // E.164 (+549…)
  email: string | null;
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Valida y normaliza una fila del padrón. Los requisitos mínimos son los del
 * guion (pendiente #10): DNI + nombre + fecha de nacimiento + sexo; localidad
 * opcional; celular O mail — sin NINGÚN canal el alta pasa igual (regla R20 de
 * 06-reglas-operativas: el turno no se puede confirmar hasta cargar uno, y la
 * pantalla del otorgador tiene la edición inline justo para eso).
 */
export function validarDatosProvision(
  raw: DatosProvisionRaw
): { ok: true; datos: DatosProvision } | { ok: false; error: string } {
  const dni = (raw.dni ?? "").replace(/\D/g, "");
  if (dni.length < 7 || dni.length > 9) {
    return { ok: false, error: "DNI inválido (esperado: 7 a 9 dígitos)." };
  }

  const nombre = (raw.nombre_completo ?? "").trim().replace(/\s+/g, " ");
  if (nombre.length < 3) {
    return { ok: false, error: "Falta el nombre completo." };
  }

  const fecha = (raw.fecha_nacimiento ?? "").trim();
  if (!FECHA_RE.test(fecha) || Number.isNaN(new Date(fecha + "T12:00:00").getTime())) {
    return { ok: false, error: "Fecha de nacimiento inválida (esperado AAAA-MM-DD)." };
  }
  if (fecha >= new Date().toISOString().slice(0, 10)) {
    return { ok: false, error: "La fecha de nacimiento debe ser pasada." };
  }

  let sexo: DatosProvision["sexo_dni"] = null;
  const sexoRaw = (raw.sexo_dni ?? "").trim().toLowerCase();
  if (sexoRaw) {
    if (sexoRaw === "m" || sexoRaw === "masculino") sexo = "masculino";
    else if (sexoRaw === "f" || sexoRaw === "femenino") sexo = "femenino";
    else return { ok: false, error: "Sexo inválido (esperado: masculino/femenino, M/F)." };
  }

  let celular: string | null = null;
  if ((raw.celular ?? "").trim()) {
    celular = normalizarTelefonoAR(raw.celular);
    if (!celular) {
      return { ok: false, error: "Celular inválido (no es un móvil argentino de 10 dígitos)." };
    }
  }

  let email: string | null = null;
  if ((raw.email ?? "").trim()) {
    email = (raw.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return { ok: false, error: "Mail inválido." };
  }

  return {
    ok: true,
    datos: {
      dni,
      nombre_completo: nombre,
      fecha_nacimiento: fecha,
      sexo_dni: sexo,
      localidad: (raw.localidad ?? "").trim() || null,
      celular,
      email,
    },
  };
}

/**
 * Alias no entregable, determinístico por DNI, en subdominio reservado del
 * dominio de la instancia. `padron.` no tiene MX: nada puede llegar ahí jamás.
 */
export function emailSinteticoPorDNI(dni: string, dominioInstancia: string): string {
  const dominio = dominioInstancia
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  return `dni-${dni}@padron.${dominio}`;
}

// ─── Provisión real ──────────────────────────────────────────────────────────

export interface OrigenProvision {
  via: "panel" | "csv" | "api";
  /** Contexto auditable: operador_id / admin user_id / archivo, etc. Sin PII extra. */
  detalle?: Record<string, unknown>;
}

export type ResultadoProvision =
  | { ok: true; accion: "creado" | "actualizado"; pacienteId: string }
  | { ok: false; error: string };

/**
 * Da de alta (o actualiza el contacto de) UN paciente del padrón.
 *
 * Idempotente por DNI: si ya existe, actualiza SOLO los datos de contacto que
 * vengan con valor (celular/mail/localidad) y no toca la identidad (nombre,
 * fecha de nacimiento, sexo) — el padrón lo gestiona la institución y una fila
 * repetida de un re-import no debe pisar identidad con typos nuevos.
 *
 * Sin contraseña JAMÁS: el usuario nace sin password utilizable; su llave es
 * el link-sesión (Etapa 3).
 */
export async function provisionarPaciente(
  raw: DatosProvisionRaw,
  origen: OrigenProvision
): Promise<ResultadoProvision> {
  if (!esInstitucional()) {
    return { ok: false, error: "Alta provisionada solo disponible en la instancia institucional." };
  }

  const val = validarDatosProvision(raw);
  if (!val.ok) return { ok: false, error: val.error };
  const datos = val.datos;

  const admin = createAdminClient();

  // 1. ¿Ya está en el padrón? → update de contacto, fin.
  const { data: existente, error: errLookup } = await admin
    .from("pacientes")
    .select("id, user_id, email")
    .eq("dni", datos.dni)
    .maybeSingle();
  if (errLookup) {
    console.error("[provisionar] Error buscando por DNI:", errLookup.message);
    return { ok: false, error: "No se pudo consultar el padrón. Probá de nuevo." };
  }

  if (existente) {
    const cambios: Record<string, unknown> = {};
    if (datos.celular) cambios.telefono = datos.celular;
    if (datos.email) cambios.email = datos.email;
    if (datos.localidad) cambios.localidad = datos.localidad;
    if (Object.keys(cambios).length > 0) {
      const { error: errUpd } = await admin.from("pacientes").update(cambios).eq("id", existente.id);
      if (errUpd) {
        console.error("[provisionar] Error actualizando contacto:", errUpd.message);
        return { ok: false, error: "No se pudo actualizar el contacto del paciente." };
      }
      // Mail real nuevo → también reemplaza el alias sintético en auth (la
      // cuenta pasa a ser alcanzable si algún día hay que mandarle algo).
      if (datos.email && existente.user_id && datos.email !== existente.email) {
        const { error: errAuth } = await admin.auth.admin.updateUserById(existente.user_id, {
          email: datos.email,
          email_confirm: true,
        });
        // Best-effort CON registro: un mail en uso por otra cuenta no debe
        // frenar la actualización del padrón, pero tampoco pasar en silencio.
        if (errAuth) console.error("[provisionar] No se pudo actualizar email en auth:", errAuth.message);
      }
    }
    return { ok: true, accion: "actualizado", pacienteId: existente.id };
  }

  // 2. Cuenta auth SIN contraseña (email real o alias sintético por DNI).
  const config = await getConfigInstitucion();
  const emailAuth = datos.email ?? emailSinteticoPorDNI(datos.dni, config.dominio);

  const { data: creado, error: errAuthCreate } = await admin.auth.admin.createUser({
    email: emailAuth,
    email_confirm: true,
    user_metadata: { origen: "provision", dni: datos.dni },
  });
  if (errAuthCreate || !creado?.user) {
    console.error("[provisionar] createUser falló:", errAuthCreate?.message);
    return {
      ok: false,
      error: datos.email
        ? "Ese mail ya tiene una cuenta. Verificá el dato o cargá el alta sin mail."
        : "No se pudo crear la cuenta del paciente. Probá de nuevo.",
    };
  }

  // 3. Fila del padrón.
  const { data: fila, error: errInsert } = await admin
    .from("pacientes")
    .insert({
      user_id: creado.user.id,
      nombre_completo: datos.nombre_completo,
      dni: datos.dni,
      fecha_nacimiento: datos.fecha_nacimiento,
      sexo_dni: datos.sexo_dni,
      localidad: datos.localidad,
      telefono: datos.celular,
      // Solo el mail REAL va al padrón; el alias sintético vive solo en auth.
      email: datos.email,
      provisionado_via: origen.via,
      provisionado_detalle: origen.detalle ?? null,
      provisionado_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (errInsert || !fila) {
    // Carrera de dos imports simultáneos del mismo DNI (23505 del índice único
    // parcial): la otra escritura ganó — se resuelve como "actualizado" sin
    // dejar la cuenta auth huérfana.
    if (errInsert?.code === "23505") {
      await admin.auth.admin.deleteUser(creado.user.id).catch(() => {});
      const { data: ganadora } = await admin
        .from("pacientes")
        .select("id")
        .eq("dni", datos.dni)
        .maybeSingle();
      if (ganadora) return { ok: true, accion: "actualizado", pacienteId: ganadora.id };
    }
    console.error("[provisionar] insert pacientes falló:", errInsert?.message);
    // Sin fila de padrón la cuenta auth no sirve para nada: rollback best-effort
    // para que el re-intento no choque con "ese mail ya tiene cuenta".
    await admin.auth.admin.deleteUser(creado.user.id).catch(() => {});
    return { ok: false, error: "No se pudo crear la fila del padrón. Probá de nuevo." };
  }

  return { ok: true, accion: "creado", pacienteId: fila.id };
}
