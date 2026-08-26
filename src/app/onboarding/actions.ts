"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { calcularCuilFormateado } from "@/lib/cuil";
import { normalizarNombreApellido } from "@/lib/pacientes/nombre";

export async function completarPerfil(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/");

  // Dos campos, los dos obligatorios (decisión Diego, 22/08/2026). Se guardan
  // las partes Y el compuesto: `nombre_completo` lo siguen leyendo los
  // documentos, los listados y los mails, así todos toman ambos sin tocar un
  // SELECT en producción.
  const { nombre, apellido, nombre_completo } = normalizarNombreApellido(
    (formData.get("nombre") as string) ?? "",
    (formData.get("apellido") as string) ?? ""
  );
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

  if (!nombre || !apellido || !dni || !fecha_nacimiento || !sexo_dni || !telefono || !terminosAceptados || !datosSensiblesAceptados) {
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
        nombre,
        apellido,
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
    // Los DOS índices únicos que la migración 044 dejó sobre `pacientes` (el de
    // DNI —que 058 recrea con otro nombre— y el de EMAIL) frenan el alta acá: el
    // upsert es `onConflict: "user_id"`, así que resuelve SOLO el choque por
    // user_id y cualquier colisión de dni o email llega como error.
    //
    // El clasificador viejo miraba únicamente el de DNI. Una colisión de EMAIL
    // caía en "error_guardado" → "Ocurrió un error. Intentá de nuevo.": sin
    // causa, sin salida, y sin siquiera la dirección de soporte. El paciente
    // reintenta, le vuelve a fallar igual, y de este lado queda un console.error
    // que nadie mira — un alta trabada así es indistinguible de un alta que
    // nunca se intentó. Por eso ahora se extrae el nombre del índice: el mensaje
    // suelto no alcanza para saber cuál de los dos frenó, y sin eso el caso no
    // se puede diagnosticar después.
    const constraint = /unique constraint "([^"]+)"/.exec(error.message ?? "")?.[1] ?? null;
    console.error("Onboarding upsert failed:", error.message, {
      userId: user.id,
      constraint,
      code: error.code,
    });
    const msg = constraint?.includes("pacientes_dni_unique")
      ? "dni_duplicado"
      : constraint?.includes("pacientes_email_unique")
        ? "email_duplicado"
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
