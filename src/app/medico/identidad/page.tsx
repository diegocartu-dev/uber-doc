import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { identidadHabilitada } from "@/lib/perfil-medico";
import PantallaIdentidad from "@/app/dashboard/PantallaIdentidad";

export const dynamic = "force-dynamic";

// Página dedicada de verificación de identidad (gate SIN MURO, 13/07/2026).
// Antes PantallaIdentidad reemplazaba el dashboard entero cuando el gate estaba
// activo; ahora el médico llega acá desde el BannerIdentidad del dashboard (o
// del mail recordatorio) y el dashboard sigue siempre accesible.
export default async function IdentidadPage({
  searchParams,
}: {
  searchParams: Promise<{ identidad?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Fila propia vía service role (regla post-outage 19-24/06: la lectura de la
  // fila propia del médico se hace con admin client + filtro user_id, nunca con
  // el cliente RLS que puede morir por grants de columna).
  const admin = createAdminClient();
  const { data: medico } = await admin
    .from("medicos")
    .select("id, didit_status, identidad_validada, biometria_exenta, es_cuenta_test, estado_registro")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!medico) redirect("/dashboard");
  // Ya habilitado (validado o exento) → no hay nada que hacer acá.
  if (identidadHabilitada(medico)) redirect("/dashboard");

  const { identidad } = await searchParams;

  return (
    <PantallaIdentidad
      diditStatus={medico.didit_status}
      recienVolvio={identidad === "verificada"}
      userId={user.id}
    />
  );
}
