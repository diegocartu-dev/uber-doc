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

  if (!email || !password || !nombre_completo || !dni || !fecha_nacimiento || !telefono) {
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

  // 2. Insertar en tabla pacientes
  const { error: dbError } = await supabase.from("pacientes").insert({
    user_id: authData.user.id,
    nombre_completo,
    email,
    dni,
    fecha_nacimiento,
    telefono,
  });

  if (dbError) {
    return { error: dbError.message };
  }

  redirect("/dashboard");
}
