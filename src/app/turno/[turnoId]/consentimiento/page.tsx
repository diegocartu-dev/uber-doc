import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import ConsentimientoInformado from "@/components/ConsentimientoInformado";
import { profesionDeLaFicha } from "@/lib/medicos/profesion-ficha";
import { versionConsentimiento } from "@/lib/legal/consentimiento-version";

function sanitizeRedirect(url: string | undefined, fallback: string): string {
  if (!url) return fallback;
  if (!url.startsWith("/") || url.startsWith("//")) return fallback;
  return url;
}

export default async function ConsentimientoTurnoPage({
  params,
  searchParams,
}: {
  params: Promise<{ turnoId: string }>;
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { turnoId } = await params;
  const { redirect: redirectUrl } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const destino = sanitizeRedirect(redirectUrl, `/turno/${turnoId}/confirmacion`);

  const { data: turno } = await supabase
    .from("turnos")
    .select("paciente_id")
    .eq("id", turnoId)
    .single();

  // `turnos.paciente_id` es `pacientes.id`, NO el user_id (asimetría de esquema,
  // la misma que en toda la app). Hasta el 13/10/2026 esto comparaba contra
  // user.id, así que un paciente real con un turno pago rebotaba al inicio y
  // nunca veía ni firmaba el consentimiento del turno (en producción no había
  // ningún consentimiento con turno_id). Hallazgo conocido desde mayo (B.3).
  const { data: paciente } = await supabase.from("pacientes").select("id").eq("user_id", user.id).maybeSingle();
  if (!turno || !paciente || turno.paciente_id !== paciente.id) {
    redirect("/");
  }

  // El texto (y su versión) depende de la profesión del profesional del turno:
  // psicología tiene el suyo ("psi-v1"). Query aparte para el medico_id (el
  // SELECT de arriba no se toca) y profesión con service role.
  const { data: turnoMedico } = await supabase.from("turnos").select("medico_id").eq("id", turnoId).maybeSingle();
  const profesion = turnoMedico?.medico_id
    ? await profesionDeLaFicha(createAdminClient(), { medicoId: turnoMedico.medico_id })
    : "medico";
  const version = versionConsentimiento(profesion);

  const { data: existing } = await supabase
    .from("consentimientos_informados")
    .select("id")
    .eq("paciente_id", user.id)
    .eq("turno_id", turnoId)
    .eq("texto_version", version)
    .limit(1)
    .maybeSingle();

  if (existing) {
    redirect(destino);
  }

  return (
    <ConsentimientoInformado
      turnoId={turnoId}
      redirect={destino}
      profesion={profesion}
    />
  );
}
