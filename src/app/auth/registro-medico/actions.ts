"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { capitalizarNombre } from "@/lib/utils/texto";
import { headers } from "next/headers";
import { waitUntil } from "@vercel/functions";
import { validarYPersistirRefeps } from "@/lib/refeps/persistir";

// ─── Rediseño 14/07/2026 — registro en DOS fases ─────────────────────────────
// FASE A `iniciarRegistroMedico`: crea la CUENTA con lo mínimo (nombre + email +
//   contraseña) y manda el mail de validación. NO crea la fila de `medicos`.
// FASE B `completarRegistroMedico`: el médico, YA LOGUEADO (confirmó el mail →
//   /auth/callback canjea la sesión → /registro-medico/continuar), completa sus
//   datos + credencial → recién ahí se crea la fila de `medicos` → biometría.
// Motivo: la confirmación de email rompía el flujo seamless (biometría quedaba
// del otro lado del login). Ahora el mail se valida ANTES de pedir datos pesados.

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

// ═══════════════════════════ FASE A — Crear cuenta ═══════════════════════════
export async function iniciarRegistroMedico(formData: FormData) {
  const { getFlag } = await import("@/lib/feature-flags");
  if (!(await getFlag("registro_medicos_publico"))) {
    return { error: "El registro de médicos está temporalmente cerrado. Volvé a intentar pronto." };
  }

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRateLimit(ip)) {
    return { error: "Demasiados intentos. Intentá de nuevo en una hora." };
  }

  const email = ((formData.get("email") as string) || "").trim().toLowerCase();
  const password = formData.get("password") as string;
  const nombre_completo = capitalizarNombre((formData.get("nombre_completo") as string) || "");

  const whitelist = process.env.SIGNUP_WHITELIST_EMAILS;
  if (whitelist) {
    const allowed = whitelist.split(",").map((e) => e.trim().toLowerCase());
    if (!allowed.includes(email)) {
      return { error: "Docto está en beta privada. Tu acceso será habilitado próximamente." };
    }
  }

  if (!email || !password || !nombre_completo) {
    return { error: "Completá nombre y apellido, email y contraseña." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "El email no parece válido. Revisalo." };
  }
  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: nombre_completo, role: "medico" },
      // El mail de confirmación redirige acá → /auth/callback canjea el código
      // por sesión (LOGUEA) y manda a completar el registro. Browser redirect →
      // el apex 307ea a www y el navegador lo sigue; usamos www directo igual.
      emailRedirectTo: "https://www.docto.com.ar/auth/callback?next=/registro-medico/continuar",
    },
  });

  if (error) {
    if (/already registered|already been registered/i.test(error.message)) {
      return { error: "Ese email ya tiene una cuenta en Docto. Iniciá sesión." };
    }
    return { error: error.message };
  }

  return { ok: true, email };
}

// Reenvío del mail de confirmación (por si no llegó o cayó en spam).
export async function reenviarConfirmacionMedico(email: string) {
  const limpio = (email || "").trim().toLowerCase();
  if (!limpio) return { error: "Falta el email." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: limpio,
    options: {
      emailRedirectTo: "https://www.docto.com.ar/auth/callback?next=/registro-medico/continuar",
    },
  });
  if (error) return { error: error.message };
  return { ok: true };
}

// ═══════════════════════ FASE B — Completar registro ═════════════════════════
// El médico ya está logueado (confirmó el mail). Crea la fila de `medicos`.
export async function completarRegistroMedico(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tu sesión expiró. Iniciá sesión de nuevo para continuar." };
  }

  const supabaseAdmin = createAdminClient();

  // Idempotencia: si ya tiene ficha, saltar directo a la biometría.
  const { data: yaMedico } = await supabaseAdmin
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (yaMedico) redirect("/registro-medico/identidad");

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const userAgent = hdrs.get("user-agent") ?? "unknown";

  const nombre_completo = capitalizarNombre(
    (user.user_metadata?.full_name as string) || (formData.get("nombre_completo") as string) || ""
  );
  const email = user.email ?? "";
  const titulo = formData.get("titulo") as string;
  const especialidad = formData.get("especialidad") as string;
  const tipo_matricula = formData.get("tipo_matricula") as string;
  const numero_matricula = formData.get("numero_matricula") as string;
  const provincia = formData.get("provincia") as string | null;
  const cuit = formData.get("cuit") as string;
  const domicilio_consultorio = ((formData.get("domicilio_consultorio") as string) || "").trim();
  const telefono = ((formData.get("telefono") as string) || "").trim() || null;
  const celular_personal = ((formData.get("celular_personal") as string) || "").trim() || null;
  const dni = (formData.get("dni") as string)?.trim();
  const matricula_provincial = (formData.get("matricula_provincial") as string) || null;

  const terminosAceptados = (formData.get("terminos_aceptados") as string) === "true";
  const declaracionMatricula = (formData.get("declaracion_matricula") as string) === "true";

  if (!titulo || !especialidad || !tipo_matricula || !numero_matricula || !cuit || !domicilio_consultorio || !celular_personal || !dni) {
    return { error: "Todos los campos obligatorios deben estar completos." };
  }
  if (!terminosAceptados || !declaracionMatricula) {
    return { error: "Debés aceptar los términos y la declaración de matrícula." };
  }
  if (titulo !== "Dr." && titulo !== "Dra.") {
    return { error: "El título profesional debe ser Dr. o Dra." };
  }
  if (tipo_matricula === "MP" && !provincia) {
    return { error: "Seleccioná la provincia de tu matrícula provincial." };
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

  // Duplicado de matrícula
  let dup = supabaseAdmin
    .from("medicos")
    .select("id")
    .eq("tipo_matricula", tipo_matricula)
    .eq("numero_matricula", numero_matricula);
  dup = tipo_matricula === "MP" && provincia
    ? dup.eq("provincia_matricula", provincia)
    : dup.or("provincia_matricula.is.null,provincia_matricula.eq.");
  const { data: existente } = await dup.maybeSingle();
  if (existente) {
    return { error: "Esta matrícula ya está registrada en Docto." };
  }

  // Credencial OBLIGATORIA (Diego, 15/07) → bucket credenciales-medicos, path
  // definitivo con user_id. Extensión whitelisteada + tope de tamaño server-side.
  const fotoFile = formData.get("foto_credencial") as File | null;
  if (!fotoFile || fotoFile.size === 0) {
    return { error: "Subí la foto de tu credencial médica para continuar." };
  }
  if (fotoFile.size > 5 * 1024 * 1024) {
    return { error: "La credencial no puede superar 5 MB." };
  }
  const rawExt = fotoFile.name.split(".").pop()?.toLowerCase() || "jpg";
  const ext = ["jpg", "jpeg", "png", "webp", "pdf"].includes(rawExt) ? rawExt : "jpg";
  const credencialPath = `${user.id}/credencial-${Date.now()}.${ext}`;
  const { error: upErr } = await supabaseAdmin.storage
    .from("credenciales-medicos")
    .upload(credencialPath, fotoFile, { contentType: fotoFile.type, upsert: true });
  if (upErr) {
    // Si es obligatoria, una subida fallida NO puede terminar en ficha sin
    // credencial: se corta acá y el médico reintenta (el archivo sigue elegido).
    console.error("[completarRegistro] upload credencial falló:", upErr.message);
    return { error: "No pudimos subir tu credencial. Probá de nuevo en un momento." };
  }
  const foto_credencial_url: string = credencialPath;

  // Firma manuscrita OBLIGATORIA (Diego 20/07, "todo de un tirón"): viaja en el
  // mismo FormData y se sube con service role ANTES del insert — la ficha aún no
  // existe, así que /api/medico/firma (UPDATE por user_id) sería un éxito
  // silencioso falso (hallazgo Sofía). Mismo criterio de corte que la credencial:
  // subida fallida = error y reintento, nunca ficha sin firma.
  const firmaFile = formData.get("firma_manuscrita") as File | null;
  if (!firmaFile || firmaFile.size === 0) {
    return { error: "Dibujá tu firma para continuar." };
  }
  if (firmaFile.size > 2 * 1024 * 1024) {
    return { error: "La firma no puede superar 2 MB." };
  }
  if (!["image/png", "image/jpeg"].includes(firmaFile.type)) {
    return { error: "La firma debe ser PNG o JPG." };
  }
  const firmaExt = firmaFile.type === "image/jpeg" ? "jpg" : "png";
  // Mismo path que ya espera el GET de /api/medico/firma.
  const firmaPath = `medicos/${user.id}/firma.${firmaExt}`;
  const { error: firmaUpErr } = await supabaseAdmin.storage
    .from("firmas-medicos")
    .upload(firmaPath, firmaFile, { contentType: firmaFile.type, upsert: true });
  if (firmaUpErr) {
    console.error("[completarRegistro] upload firma falló:", firmaUpErr.message);
    return { error: "No pudimos guardar tu firma. Probá de nuevo en un momento." };
  }

  // Foto de perfil (opcional) → bucket avatars (público) → foto_url.
  let foto_url: string | null = null;
  const fotoPerfilFile = formData.get("foto_perfil") as File | null;
  if (fotoPerfilFile && fotoPerfilFile.size > 0 && fotoPerfilFile.size <= 5 * 1024 * 1024) {
    const rawExt = fotoPerfilFile.name.split(".").pop()?.toLowerCase() || "jpg";
    const ext = ["jpg", "jpeg", "png", "webp"].includes(rawExt) ? rawExt : "jpg";
    const path = `medicos/${user.id}/perfil.${ext}`;
    const { error: fotoErr } = await supabaseAdmin.storage
      .from("avatars")
      .upload(path, fotoPerfilFile, { contentType: fotoPerfilFile.type, upsert: true });
    if (!fotoErr) {
      const { data: pub } = supabaseAdmin.storage.from("avatars").getPublicUrl(path);
      if (pub?.publicUrl) foto_url = `${pub.publicUrl}?v=${Date.now()}`;
    }
  }

  const slug = nombre_completo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "-") + "-" + tipo_matricula + numero_matricula;

  const ahora = new Date().toISOString();
  const nuevoMedico = {
    user_id: user.id,
    titulo,
    nombre_completo,
    email,
    especialidad,
    tipo_matricula,
    numero_matricula,
    provincia: tipo_matricula === "MP" ? provincia : null,
    provincia_matricula: tipo_matricula === "MP" ? provincia : null,
    cuit: cuitLimpio,
    domicilio: domicilio_consultorio,
    domicilio_consultorio,
    telefono,
    celular_personal,
    foto_url,
    dni,
    matricula_provincial,
    ...(terminosAceptados ? { terminos_aceptados_at: ahora } : {}),
    ...(declaracionMatricula ? { declaracion_matricula_at: ahora } : {}),
    slug,
    foto_credencial_url,
    firma_manuscrita_url: firmaPath,
    verificado: false,
    estado_registro: "pendiente_revision",
  };

  // Retry con backoff ante errores transitorios de DB (repone la robustez del
  // flujo viejo). NO reintentar violaciones de unique (23505): son determinísticas.
  let dbError = null;
  for (let intento = 0; intento < 3; intento++) {
    const res = await supabaseAdmin.from("medicos").insert(nuevoMedico);
    dbError = res.error;
    if (!dbError || dbError.code === "23505") break;
    await new Promise((r) => setTimeout(r, 300 * (intento + 1)));
  }

  if (dbError) {
    if (dbError.code === "23505") {
      // Colisión de unique. ¿Por MI user_id (doble submit → ya tengo ficha) o por
      // matrícula (carrera con otro registro)? En vez de hardcodear el nombre del
      // constraint, chequeo si ahora tengo ficha: si sí, sigo a biometría; si no,
      // la colisión fue de matrícula → devuelvo el mensaje correcto.
      const { data: miFicha } = await supabaseAdmin
        .from("medicos")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (miFicha) redirect("/registro-medico/identidad");
      return { error: "Esta matrícula ya está registrada en Docto." };
    }
    console.error("[completarRegistro] insert medico falló:", dbError.message, { ip, userAgent });
    return { error: "No se pudo crear tu perfil. Reintentá en unos segundos." };
  }

  // Validación REFEPS automática en background (waitUntil sobrevive al redirect).
  {
    const { data: creado } = await supabaseAdmin
      .from("medicos")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (creado?.id) {
      waitUntil(
        validarYPersistirRefeps(creado.id).catch((e) =>
          console.error("[completarRegistro] REFEPS background falló:", e instanceof Error ? e.message : e)
        )
      );
    }
  }

  // Ficha creada → paso final: validación biométrica.
  redirect("/registro-medico/identidad");
}
