"use server";

// Server actions de la gestión de operadores (/admin/operadores).
// SOLO instancia institucional: doble guard (flag + admin Docto) por action.
// Escritura con service role — `operadores` tiene RLS sin policies.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin-auth";
import { esInstitucional } from "@/lib/instancia";

async function guardAdminInstitucionalDocto(): Promise<string | null> {
  if (!esInstitucional()) return null; // en B2C estas actions no existen
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isAdmin(user.id))) return null;
  return user.id;
}

export async function crearOperador(input: {
  nombre: string;
  nivel: "otorgador" | "admin_institucion";
  tipo: "humano" | "ia";
  email: string; // requerido para tipo humano; ignorado para ia
}): Promise<{ ok: boolean; error?: string }> {
  const uid = await guardAdminInstitucionalDocto();
  if (!uid) return { ok: false, error: "No autorizado" };

  const nombre = input.nombre.trim();
  if (!nombre) return { ok: false, error: "Falta el nombre del operador." };
  if (!["otorgador", "admin_institucion"].includes(input.nivel))
    return { ok: false, error: "Nivel inválido." };
  if (!["humano", "ia"].includes(input.tipo)) return { ok: false, error: "Tipo inválido." };

  const admin = createAdminClient();

  let userId: string | null = null;
  if (input.tipo === "humano") {
    // El operador humano entra por el login existente: necesita cuenta en
    // auth.users ANTES del alta (se crea al provisionar la instancia — acá no
    // se crean cuentas ni se mandan invitaciones).
    const email = input.email.trim().toLowerCase();
    if (!email) return { ok: false, error: "Falta el email del operador humano." };

    // Lookup por email PAGINADO (lección de recuperar-registros: listUsers sin
    // params devuelve SOLO la primera página — 50 usuarios — y el bug es
    // silencioso: "no tiene cuenta" para cuentas que sí existen). En la
    // instancia institucional cada paciente provisionado por link también es
    // una cuenta de auth, así que auth.users supera 50 apenas entra el padrón.
    const PER_PAGE = 1000;
    let targetId: string | null = null;
    for (let page = 1; page <= 20; page++) {
      const { data: pagina, error: usersError } = await admin.auth.admin.listUsers({
        page,
        perPage: PER_PAGE,
      });
      if (usersError) {
        console.error("[admin/operadores] Error listando usuarios:", usersError);
        return { ok: false, error: "No se pudo buscar el usuario. Intentá de nuevo." };
      }
      targetId = pagina.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
      if (targetId || pagina.users.length < PER_PAGE) break;
    }
    if (!targetId)
      return {
        ok: false,
        error: "Ese email no tiene cuenta. El operador necesita cuenta creada antes del alta.",
      };
    userId = targetId;

    // Un email de PROFESIONAL no puede ser operador: la precedencia de rol
    // (admin_institucion/otorgador > medico) lo sacaría de su dashboard y no
    // podría atender más. Es el error operativo típico (cargar el email
    // equivocado) — se rechaza con mensaje claro en vez de romper en silencio.
    const { data: filaMedico } = await admin
      .from("medicos")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (filaMedico)
      return {
        ok: false,
        error:
          "Ese email pertenece a un profesional. Un profesional no puede ser operador: usá otra cuenta.",
      };

    const { data: existente } = await admin
      .from("operadores")
      .select("id")
      .eq("user_id", userId)
      .eq("activo", true)
      .limit(1);
    if (existente && existente.length > 0)
      return { ok: false, error: "Ese usuario ya es operador activo." };
  }

  const { error: dbError } = await admin.from("operadores").insert({
    user_id: userId, // null para tipo 'ia' (su identidad es la API key, Etapa 2)
    nombre,
    tipo: input.tipo,
    nivel: input.nivel,
    activo: true,
  });
  if (dbError) {
    // 23505 = índice único de operador ACTIVO por user_id (migración 006):
    // carrera entre dos altas concurrentes (o doble submit) que el check
    // previo no puede cerrar — la DB la corta y acá se traduce el mensaje.
    if (dbError.code === "23505")
      return { ok: false, error: "Ese usuario ya es operador activo." };
    console.error("[admin/operadores] Error creando operador:", dbError);
    return { ok: false, error: "No se pudo crear el operador." };
  }

  revalidatePath("/admin/operadores");
  return { ok: true };
}

export async function setOperadorActivo(
  operadorId: string,
  activo: boolean
): Promise<{ ok: boolean; error?: string }> {
  const uid = await guardAdminInstitucionalDocto();
  if (!uid) return { ok: false, error: "No autorizado" };

  const admin = createAdminClient();
  // Baja = desactivar, nunca borrar: la fila queda para la auditoría de
  // `asignaciones` (Etapa 2) y el resolver de rol ignora inactivos.
  const { error } = await admin.from("operadores").update({ activo }).eq("id", operadorId);
  if (error) {
    console.error("[admin/operadores] Error actualizando operador:", error);
    return { ok: false, error: "No se pudo actualizar." };
  }

  revalidatePath("/admin/operadores");
  return { ok: true };
}
