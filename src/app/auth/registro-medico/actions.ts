"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function registrarMedico(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const nombre_completo = formData.get("nombre_completo") as string;
  const especialidad = formData.get("especialidad") as string;
  const tipo_matricula = formData.get("tipo_matricula") as string;
  const numero_matricula = formData.get("numero_matricula") as string;
  const provincia = formData.get("provincia") as string | null;
  const precio_consulta = parseInt(formData.get("precio_consulta") as string, 10);
  const duracion_consulta = parseInt(formData.get("duracion_consulta") as string, 10);
  const modalidad_atencion = formData.get("modalidad_atencion") as string;

  // Validaciones básicas del servidor
  if (!email || !password || !nombre_completo || !especialidad || !tipo_matricula || !numero_matricula || !precio_consulta || !duracion_consulta || !modalidad_atencion) {
    return { error: "Todos los campos son obligatorios." };
  }

  if (tipo_matricula === "MP" && !provincia) {
    return { error: "Debe seleccionar una provincia para matrícula provincial." };
  }

  if (password.length < 6) {
    return { error: "La contraseña debe tener al menos 6 caracteres." };
  }

  // 1. Crear usuario en Supabase Auth
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

  // 2. Insertar en tabla medicos
  const { error: dbError } = await supabase.from("medicos").insert({
    user_id: authData.user.id,
    nombre_completo,
    email,
    especialidad,
    tipo_matricula,
    numero_matricula,
    provincia: tipo_matricula === "MP" ? provincia : null,
    precio_consulta,
    duracion_consulta,
    modalidad_atencion,
  });

  if (dbError) {
    return { error: dbError.message };
  }

  redirect("/dashboard");
}
