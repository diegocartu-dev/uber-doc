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

export async function registrarMedico(formData: FormData) {
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRateLimit(ip)) {
    return { error: "Demasiados intentos de registro. Intentá de nuevo en una hora." };
  }

  const supabase = await createClient();

  const email = formData.get("email") as string;
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

  if (!email || !password || !titulo || !nombre_completo || !especialidad || !tipo_matricula || !numero_matricula || !precio_consulta || !duracion_consulta || !modalidad_atencion || !cuit || !domicilio || !dni) {
    return { error: "Todos los campos obligatorios deben estar completos." };
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

  const supabaseAdmin = createAdminClient();
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
    return { error: "Esta matrícula ya está registrada en Docto." };
  }

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: nombre_completo, role: "medico" },
    },
  });

  if (authError) {
    return { error: authError.message };
  }

  if (!authData.user) {
    return { error: "No se pudo crear el usuario." };
  }

  // Upload foto credencial si existe
  let foto_credencial_url: string | null = null;
  const fotoFile = formData.get("foto_credencial") as File | null;
  if (fotoFile && fotoFile.size > 0) {
    const ext = fotoFile.name.split(".").pop() || "jpg";
    const path = `${authData.user.id}/credencial-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("credenciales-medicos")
      .upload(path, fotoFile, { contentType: fotoFile.type });
    if (!uploadError) {
      foto_credencial_url = path;
    }
  }

  const slug = nombre_completo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    + "-" + tipo_matricula + numero_matricula;

  const ahora = new Date().toISOString();
  let dbError = null;
  for (let i = 0; i < 3; i++) {
    const { error } = await supabase.from("medicos").insert({
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
      cuit,
      domicilio,
      dni,
      matricula_provincial,
      terminos_aceptados_at: ahora,
      declaracion_matricula_at: ahora,
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
    return { error: `Error al crear el perfil: ${dbError.message}` };
  }

  redirect("/dashboard");
}
