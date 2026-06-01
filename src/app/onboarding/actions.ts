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
  const telefono = (formData.get("telefono") as string)?.trim() || null;
  const redirectTo = (formData.get("redirectTo") as string) ?? "/";

  const safeRedirect =
    redirectTo.startsWith("/") && !redirectTo.startsWith("//") && !redirectTo.includes("://") ? redirectTo : "/";

  const tieneCobertura = (formData.get("tiene_cobertura") as string) === "true";
  const obra_social_id = (formData.get("obra_social_id") as string)?.trim() || null;
  const obra_social_otra = (formData.get("obra_social_otra") as string)?.trim() || null;
  const nro_afiliado = (formData.get("nro_afiliado") as string)?.trim() || null;
  const plan_obra_social = (formData.get("plan_obra_social") as string)?.trim() || null;
  const terminosAceptados = (formData.get("terminos_aceptados") as string) === "true";
  const datosSensiblesAceptados = (formData.get("datos_sensibles_aceptados") as string) === "true";

  // Derive legacy obra_social field for backward compat (deprecated, 1 month fallback)
  const obra_social = obra_social_id
    ? null // Will be resolved from FK in PDF route
    : obra_social_otra ?? null;

  if (!nombre_completo || !dni || !fecha_nacimiento || !sexo_dni || !telefono || !terminosAceptados || !datosSensiblesAceptados) {
    redirect(`/onboarding?error=campos_requeridos&redirectTo=${encodeURIComponent(safeRedirect)}`);
  }

  if (!/^\d{7,8}$/.test(dni)) {
    redirect(`/onboarding?error=campos_requeridos&redirectTo=${encodeURIComponent(safeRedirect)}`);
  }

  if (telefono.replace(/\D/g, "").length < 8) {
    redirect(`/onboarding?error=campos_requeridos&redirectTo=${encodeURIComponent(safeRedirect)}`);
  }

  if (sexo_dni !== "masculino" && sexo_dni !== "femenino") {
    redirect(`/onboarding?error=campos_requeridos&redirectTo=${encodeURIComponent(safeRedirect)}`);
  }

  // Si declaró cobertura, el nro de afiliado es obligatorio (server-side, no bypasseable).
  if (tieneCobertura && !nro_afiliado) {
    redirect(`/onboarding?error=campos_requeridos&redirectTo=${encodeURIComponent(safeRedirect)}`);
  }

  const cuil = calcularCuil(dni, sexo_dni);

  const { error } = await supabase
    .from("pacientes")
    .upsert(
      {
        user_id: user.id,
        nombre_completo,
        email: user.email ?? null,
        dni,
        fecha_nacimiento,
        sexo_dni,
        telefono,
        tiene_cobertura: tieneCobertura,
        obra_social: tieneCobertura ? obra_social : null,
        obra_social_id: tieneCobertura ? obra_social_id : null,
        obra_social_otra: tieneCobertura ? obra_social_otra : null,
        nro_afiliado: tieneCobertura ? nro_afiliado : null,
        plan_obra_social: tieneCobertura ? plan_obra_social : null,
        cobertura_validada_en: tieneCobertura ? new Date().toISOString() : null,
        cuil,
        perfil_medico_completado: true,
        ...(terminosAceptados ? { terminos_aceptados_at: new Date().toISOString() } : {}),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    console.error("Onboarding upsert failed:", error.message, { userId: user.id });
    const msg = error.message?.includes("pacientes_dni_unique")
      ? "dni_duplicado"
      : "error_guardado";
    redirect(`/onboarding?error=${msg}&redirectTo=${encodeURIComponent(safeRedirect)}`);
  }

  // Registrar aceptación de datos sensibles (Ley 25.326) — fire-and-forget
  if (datosSensiblesAceptados) {
    (async () => {
      try {
        const { data: version } = await supabase
          .from("versiones_textos_legales")
          .select("id")
          .eq("tipo", "datos_sensibles")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (version) {
          await supabase.from("aceptaciones_legales").insert({
            user_id: user.id,
            tipo: "datos_sensibles",
            version_id: version.id,
          });
        }
      } catch (err) {
        // Fire-and-forget: no bloquear onboarding
        console.error("Fallo registro aceptacion datos sensibles:", err);
      }
    })();
  }

  redirect(safeRedirect);
}
