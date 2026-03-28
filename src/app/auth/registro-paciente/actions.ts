"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function registrarPaciente(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const nombre_completo = formData.get("nombre_completo") as string;
  const dni = formData.get("dni") as string;
  const fecha_nacimiento = formData.get("fecha_nacimiento") as string;
  const telefono = formData.get("telefono") as string;
  const cuil = formData.get("cuil") as string;
  const obra_social = (formData.get("obra_social") as string) || null;
  const nro_afiliado = (formData.get("nro_afiliado") as string) || null;

  if (!email || !password || !nombre_completo || !dni || !cuil || !fecha_nacimiento || !telefono) {
    return { error: "Todos los campos son obligatorios." };
  }

  if (password.length < 6) {
    return { error: "La contraseña debe tener al menos 6 caracteres." };
  }

  // 1. Crear usuario en Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: nombre_completo, role: "paciente" },
    },
  });

  if (authError) {
    return { error: authError.message };
  }

  if (!authData.user) {
    return { error: "No se pudo crear el usuario." };
  }

  // 2. Insertar en tabla pacientes — con retry
  let dbError = null;
  for (let i = 0; i < 3; i++) {
    const { error } = await supabase.from("pacientes").insert({
      user_id: authData.user.id,
      nombre_completo,
      email,
      dni,
      cuil,
      fecha_nacimiento,
      telefono,
      obra_social,
      nro_afiliado,
      terminos_aceptados_at: new Date().toISOString(),
    });

    if (!error) {
      dbError = null;
      break;
    }

    dbError = error;

    // Si es duplicate key, el registro ya existe (quizás por el trigger)
    if (error.code === "23505") {
      dbError = null;
      break;
    }

    // Esperar antes de reintentar
    if (i < 2) await new Promise((r) => setTimeout(r, 1000));
  }

  if (dbError) {
    return { error: `Error al crear el perfil: ${dbError.message}` };
  }

  redirect("/dashboard");
}
