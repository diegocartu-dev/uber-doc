"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { capitalizarNombre } from "@/lib/utils/texto";
import { headers } from "next/headers";

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function validarDNI(dni: string): boolean {
  return /^\d{7,8}$/.test(dni);
}

function validarCUIT(cuit: string): string | null {
  const limpio = cuit.replace(/[-\s]/g, "");
  if (!/^\d{11}$/.test(limpio)) return null;
  return limpio;
}

function dniEnCUIT(dni: string, cuitLimpio: string): boolean {
  return cuitLimpio.substring(2, 10) === dni.padStart(8, "0");
}

/**
 * Guarda todos los datos del formulario en registros_borrador ANTES de
 * intentar crear la cuenta. Si algo falla después, los datos quedan
 * guardados y se pueden completar desde el admin.
 */
async function guardarBorrador(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  datos: Record<string, unknown>,
  ip: string,
  userAgent: string,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("registros_borrador")
    .insert({
      email: datos.email as string,
      nombre_completo: datos.nombre_completo as string,
      datos,
      estado: "pendiente",
      ip_address: ip,
      user_agent: userAgent,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[registro] Error guardando borrador:", error);
    return null;
  }
  return data.id;
}

async function actualizarBorrador(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  borradorId: string,
  estado: "completado" | "error",
  extra?: { error_mensaje?: string; foto_credencial_url?: string },
) {
  await supabaseAdmin
    .from("registros_borrador")
    .update({ estado, ...extra })
    .eq("id", borradorId);
}

export async function registrarMedico(formData: FormData) {
  // Feature flag: registro de médicos
  const { getFlag } = await import("@/lib/feature-flags");
  const registroAbierto = await getFlag("registro_medicos_publico");
  if (!registroAbierto) {
    return { error: "El registro de médicos está temporalmente cerrado. Volvé a intentar pronto." };
  }

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const userAgent = hdrs.get("user-agent") ?? "unknown";
  if (!checkRateLimit(ip)) {
    return { error: "Demasiados intentos de registro. Intentá de nuevo en una hora." };
  }

  const supabase = await createClient();
  const supabaseAdmin = createAdminClient();

  const email = formData.get("email") as string;

  // Whitelist de beta privada — si SIGNUP_WHITELIST_EMAILS está definida,
  // solo esos emails pueden registrarse. Vacía o ausente = registro abierto.
  const whitelist = process.env.SIGNUP_WHITELIST_EMAILS;
  if (whitelist) {
    const allowed = whitelist.split(",").map((e) => e.trim().toLowerCase());
    if (!allowed.includes(email.trim().toLowerCase())) {
      return {
        error:
          "Docto está en beta privada. Tu acceso será habilitado próximamente.",
      };
    }
  }

  const password = formData.get("password") as string;
  const titulo = formData.get("titulo") as string;
  const nombre_completo = capitalizarNombre(formData.get("nombre_completo") as string);
  const especialidad = formData.get("especialidad") as string;
  const tipo_matricula = formData.get("tipo_matricula") as string;
  const numero_matricula = formData.get("numero_matricula") as string;
  const provincia = formData.get("provincia") as string | null;
  const precio_consulta = parseInt(formData.get("precio_consulta") as string, 10);
  const duracion_consulta = parseInt(formData.get("duracion_consulta") as string, 10);
  const modalidad_atencion = formData.get("modalidad_atencion") as string;
  const cuit = formData.get("cuit") as string;
  const domicilio = formData.get("domicilio") as string;
  const dni = (formData.get("dni") as string)?.trim();
  const matricula_provincial = (formData.get("matricula_provincial") as string) || null;
  const provincia_matricula = (formData.get("provincia_matricula") as string) || null;

  const terminosAceptados = (formData.get("terminos_aceptados") as string) === "true";
  const declaracionMatricula = (formData.get("declaracion_matricula") as string) === "true";

  if (!email || !password || !titulo || !nombre_completo || !especialidad || !tipo_matricula || !numero_matricula || !precio_consulta || !duracion_consulta || !modalidad_atencion || !cuit || !domicilio || !dni) {
    return { error: "Todos los campos obligatorios deben estar completos." };
  }

  if (!terminosAceptados || !declaracionMatricula) {
    return { error: "Debés aceptar los términos y condiciones y la declaración de matrícula." };
  }

  if (titulo !== "Dr." && titulo !== "Dra.") {
    return { error: "El título profesional debe ser Dr. o Dra." };
  }

  if (tipo_matricula === "MP" && !provincia) {
    return { error: "Debe seleccionar una provincia para matrícula provincial." };
  }

  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }

  if (!validarDNI(dni)) {
    return { error: "El DNI debe tener 7 u 8 dígitos numéricos." };
  }

  const cuitLimpio = validarCUIT(cuit);
  if (!cuitLimpio) {
    return { error: "El CUIT debe tener 11 dígitos (formato: XX-XXXXXXXX-X)." };
  }

  if (!dniEnCUIT(dni, cuitLimpio)) {
    return { error: "El DNI no coincide con los dígitos centrales del CUIT." };
  }

  // ═══ BORRADOR: guardar TODO antes de intentar crear la cuenta ═══
  // Si algo falla después, los datos quedan en registros_borrador
  // y se pueden completar desde el panel admin.
  const datosBorrador = {
    email,
    titulo,
    nombre_completo,
    especialidad,
    tipo_matricula,
    numero_matricula,
    provincia,
    precio_consulta,
    duracion_consulta,
    modalidad_atencion,
    cuit: cuitLimpio,
    domicilio,
    dni,
    matricula_provincial,
    provincia_matricula,
    terminos_aceptados: terminosAceptados,
    declaracion_matricula: declaracionMatricula,
  };

  const borradorId = await guardarBorrador(supabaseAdmin, datosBorrador, ip, userAgent);

  // ═══ Verificar duplicados ═══
  let duplicateQuery = supabaseAdmin
    .from("medicos")
    .select("id")
    .eq("tipo_matricula", tipo_matricula)
    .eq("numero_matricula", numero_matricula);

  if (tipo_matricula === "MP" && provincia) {
    duplicateQuery = duplicateQuery.eq("provincia_matricula", provincia);
  } else {
    duplicateQuery = duplicateQuery.or("provincia_matricula.is.null,provincia_matricula.eq.");
  }

  const { data: existente } = await duplicateQuery.maybeSingle();

  if (existente) {
    if (borradorId) await actualizarBorrador(supabaseAdmin, borradorId, "error", { error_mensaje: "Matrícula duplicada" });
    return { error: "Esta matrícula ya está registrada en Docto." };
  }

  // ═══ Subir foto ANTES del signUp (así queda guardada pase lo que pase) ═══
  let foto_credencial_url: string | null = null;
  const fotoFile = formData.get("foto_credencial") as File | null;
  if (fotoFile && fotoFile.size > 0) {
    const ext = fotoFile.name.split(".").pop() || "jpg";
    const path = `borrador-${borradorId || "unknown"}/credencial-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("credenciales-medicos")
      .upload(path, fotoFile, { contentType: fotoFile.type });
    if (!uploadError) {
      foto_credencial_url = path;
      if (borradorId) await actualizarBorrador(supabaseAdmin, borradorId, "pendiente", { foto_credencial_url: path });
    }
  }

  // ═══ Crear cuenta en Supabase Auth ═══
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: nombre_completo, role: "medico" },
    },
  });

  if (authError) {
    if (borradorId) await actualizarBorrador(supabaseAdmin, borradorId, "error", { error_mensaje: `Auth: ${authError.message}` });
    return { error: authError.message };
  }

  if (!authData.user) {
    if (borradorId) await actualizarBorrador(supabaseAdmin, borradorId, "error", { error_mensaje: "Auth: no user returned" });
    return { error: "No se pudo crear el usuario." };
  }

  // Si la foto se subió con path temporal, moverla al path definitivo con user_id
  if (foto_credencial_url && foto_credencial_url.startsWith("borrador-")) {
    const ext = foto_credencial_url.split(".").pop() || "jpg";
    const newPath = `${authData.user.id}/credencial-${Date.now()}.${ext}`;
    const { error: moveError } = await supabaseAdmin.storage
      .from("credenciales-medicos")
      .move(foto_credencial_url, newPath);
    if (!moveError) {
      foto_credencial_url = newPath;
    }
  }

  const slug = nombre_completo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    + "-" + tipo_matricula + numero_matricula;

  const ahora = new Date().toISOString();
  let dbError = null;
  for (let i = 0; i < 3; i++) {
    const { error } = await supabaseAdmin.from("medicos").insert({
      user_id: authData.user.id,
      titulo,
      nombre_completo,
      email,
      especialidad,
      tipo_matricula,
      numero_matricula,
      provincia: tipo_matricula === "MP" ? provincia : null,
      provincia_matricula: tipo_matricula === "MP" ? provincia : null,
      precio_consulta,
      duracion_consulta,
      modalidad_atencion,
      cuit: cuitLimpio,
      domicilio,
      dni,
      matricula_provincial,
      ...(terminosAceptados ? { terminos_aceptados_at: ahora } : {}),
      ...(declaracionMatricula ? { declaracion_matricula_at: ahora } : {}),
      slug,
      foto_credencial_url,
      verificado: false,
      estado_registro: "pendiente_revision",
    });

    if (!error) { dbError = null; break; }
    dbError = error;
    if (error.code === "23505") { dbError = null; break; }
    if (i < 2) await new Promise((r) => setTimeout(r, 1000));
  }

  if (dbError) {
    if (borradorId) await actualizarBorrador(supabaseAdmin, borradorId, "error", { error_mensaje: `DB: ${dbError.message}` });
    return { error: `Error al crear el perfil: ${dbError.message}` };
  }

  // ═══ Registro exitoso — marcar borrador como completado ═══
  if (borradorId) await actualizarBorrador(supabaseAdmin, borradorId, "completado");

  redirect("/dashboard");
}
