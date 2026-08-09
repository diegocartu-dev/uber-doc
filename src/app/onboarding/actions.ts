"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { capitalizarNombre } from "@/lib/utils/texto";
import { calcularCuilFormateado } from "@/lib/cuil";

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

  const cuil = calcularCuilFormateado(dni, sexo_dni);

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
        // Versión FIJA "v1" del texto de datos sensibles del PACIENTE. Nunca
        // "la más reciente por created_at": el texto biométrico de médicos
        // (biometria_didit_v1) comparte el tipo 'datos_sensibles' y es más
        // nuevo — elegirlo registraba al paciente aceptando un consentimiento
        // que jamás vio (664 filas contaminadas 02/06→20/07, auditoría Roberto
        // PR #289; backfill aplicado por migración). Si algún día se versiona
        // el texto del paciente, actualizar acá la versión explícita.
        const { data: version } = await supabase
          .from("versiones_textos_legales")
          .select("id")
          .eq("tipo", "datos_sensibles")
          .eq("version", "v1")
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
