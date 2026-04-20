"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { capitalizarNombre } from "@/lib/utils/texto";

function calcularCuil(dni: string, sexo: "masculino" | "femenino"): string | null {
  const dniClean = dni.replace(/\D/g, "");
  if (dniClean.length < 7 || dniClean.length > 8) return null;
  const dniPadded = dniClean.padStart(8, "0");
  const prefijo = sexo === "masculino" ? "20" : "27";
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const digitos = (prefijo + dniPadded).split("").map(Number);
  const suma = digitos.reduce((acc, d, i) => acc + d * pesos[i], 0);
  const resto = suma % 11;
  let verificador: number;
  if (resto === 0) {
    verificador = 0;
  } else if (resto === 1) {
    if (sexo === "masculino") {
      const digitos23 = ("23" + dniPadded).split("").map(Number);
      const suma23 = digitos23.reduce((acc, d, i) => acc + d * pesos[i], 0);
      verificador = 11 - (suma23 % 11);
      return `23-${dniPadded}-${verificador}`;
    }
    verificador = 4;
    return `27-${dniPadded}-${verificador}`;
  } else {
    verificador = 11 - resto;
  }
  return `${prefijo}-${dniPadded}-${verificador}`;
}

export async function completarPerfil(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const nombre_completo = capitalizarNombre((formData.get("nombre_completo") as string)?.trim());
  const dni = (formData.get("dni") as string)?.trim();
  const fecha_nacimiento = (formData.get("fecha_nacimiento") as string)?.trim();
  const sexo_dni = (formData.get("sexo_dni") as string)?.trim() || null;
  const redirectTo = (formData.get("redirectTo") as string) ?? "/";

  const tieneCobertura = (formData.get("tiene_cobertura") as string) === "true";
  const obra_social = (formData.get("obra_social") as string)?.trim() || null;
  const nro_afiliado = (formData.get("nro_afiliado") as string)?.trim() || null;

  if (!nombre_completo || !dni || !fecha_nacimiento || !sexo_dni) {
    redirect(`/onboarding?error=campos_requeridos&redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  const safeRedirect =
    redirectTo.startsWith("/") && !redirectTo.includes("://") ? redirectTo : "/";

  const cuil = calcularCuil(dni, sexo_dni as "masculino" | "femenino");

  const { error } = await supabase
    .from("pacientes")
    .upsert(
      {
        user_id: user.id,
        nombre_completo,
        dni,
        fecha_nacimiento,
        sexo_dni,
        tiene_cobertura: tieneCobertura,
        obra_social: tieneCobertura ? obra_social : null,
        nro_afiliado: tieneCobertura ? nro_afiliado : null,
        cuil,
        perfil_medico_completado: true,
      },
      { onConflict: "user_id" }
    );

  if (error) redirect(`/onboarding?error=server&redirectTo=${encodeURIComponent(redirectTo)}`);

  redirect(safeRedirect);
}
