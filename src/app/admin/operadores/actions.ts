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

    // Lookup por email DIRECTO vía RPC SECURITY DEFINER sobre auth.users
    // (migración institucional 007). Reemplaza el loop paginado de listUsers,
    // que cortaba en 20.000 usuarios: con un padrón provincial provisionado
    // (cada paciente del padrón es una cuenta de auth) ese techo se supera y
    // el alta devolvía un falso "ese email no tiene cuenta" (spec §11.10,
    // gate #402). La RPC no tiene EXECUTE para anon/authenticated: solo el
    // service role puede invocarla.
    const { data: targetId, error: usersError } = await admin.rpc("buscar_user_id_por_email", {
      p_email: email,
    });
    if (usersError) {
      console.error("[admin/operadores] Error buscando usuario por email:", usersError);
      return { ok: false, error: "No se pudo buscar el usuario. Intentá de nuevo." };
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

  // Reactivar re-chequea que el usuario no se haya vuelto MÉDICO entretanto
  // (spec §11.11, gate #402): el alta bloquea médicos, pero entre la baja y la
  // reactivación la cuenta pudo convertirse en profesional — y reactivarlo
  // como operador lo sacaría de su dashboard por precedencia de rol
  // (admin_institucion/otorgador > medico), dejándolo sin poder atender.
  if (activo) {
    const { data: fila, error: errFila } = await admin
      .from("operadores")
      .select("user_id")
      .eq("id", operadorId)
      .maybeSingle();
    if (errFila) {
      console.error("[admin/operadores] Error leyendo operador a reactivar:", errFila);
      return { ok: false, error: "No se pudo actualizar." };
    }
    if (fila?.user_id) {
      const { data: filaMedico } = await admin
        .from("medicos")
        .select("id")
        .eq("user_id", fila.user_id)
        .maybeSingle();
      if (filaMedico)
        return {
          ok: false,
          error:
            "Esa cuenta ahora pertenece a un profesional. Un profesional no puede ser operador: usá otra cuenta.",
        };
    }
  }

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
