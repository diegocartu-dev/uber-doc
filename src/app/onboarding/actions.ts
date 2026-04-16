"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { capitalizarNombre } from "@/lib/utils/texto";

export async function completarPerfil(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const nombre_completo = capitalizarNombre((formData.get("nombre_completo") as string)?.trim());
  const dni = (formData.get("dni") as string)?.trim();
  const fecha_nacimiento = (formData.get("fecha_nacimiento") as string)?.trim();
  const telefono = (formData.get("telefono") as string)?.trim();
  const redirectTo = (formData.get("redirectTo") as string) ?? "/";

  if (!nombre_completo || !dni || !fecha_nacimiento || !telefono) {
    redirect(`/onboarding?error=campos_requeridos`);
  }

  const safeRedirect =
    redirectTo.startsWith("/") && !redirectTo.includes("://") ? redirectTo : "/";

  const { error } = await supabase
    .from("pacientes")
    .upsert(
      { user_id: user.id, nombre_completo, dni, fecha_nacimiento, telefono },
      { onConflict: "user_id" }
    );

  if (error) redirect(`/onboarding?error=server`);

  redirect(safeRedirect);
}
