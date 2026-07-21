import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import RegistroIdentidad from "../RegistroIdentidad";

export const dynamic = "force-dynamic";

// Paso 3 del registro médico (rediseño 14/07): validación biométrica, DENTRO del
// registro y PRE-aprobación. El médico llega acá recién creada su cuenta (ya
// logueado) desde el formulario de registro. Fila propia vía service role (regla
// post-outage: el cliente RLS puede morir por grants de columna).
export default async function RegistroIdentidadPage({
  searchParams,
}: {
  searchParams: Promise<{ identidad?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const admin = createAdminClient();
  const { data: medico } = await admin
    .from("medicos")
    .select("id, didit_status, identidad_validada, biometria_exenta, didit_session_id")
    .eq("user_id", user.id)
    .maybeSingle();
  // Sin ficha todavía = confirmó el mail pero no completó datos (Fase B). Lo
  // mandamos a completar, no al dashboard (que asume médico con ficha).
  if (!medico) redirect("/registro-medico/continuar");

  const { identidad } = await searchParams;

  return (
    <RegistroIdentidad
      diditStatus={medico.didit_status}
      yaHabilitado={!!medico.identidad_validada || !!medico.biometria_exenta}
      // El callback ?identidad=verificada solo cuenta si HAY una sesión Didit real:
      // una URL vieja del historial (o un typo) no puede fabricar un "completo"
      // fantasma con la cuenta reseteada (caso Diego 20/07).
      recienVolvio={identidad === "verificada" && !!medico.didit_session_id}
    />
  );
}
