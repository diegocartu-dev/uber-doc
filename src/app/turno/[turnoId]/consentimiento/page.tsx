import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import ConsentimientoInformado from "@/components/ConsentimientoInformado";
import { versionConsentimientoDelTurno } from "@/lib/legal/consentimiento-turno";

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

  // De quién es el turno y qué texto le toca: lo mismo que lee la API al guardar
  // (versionConsentimientoDelTurno). Hasta el 13/10/2026 esta página comparaba
  // `turnos.paciente_id` (que es `pacientes.id`) contra el user_id, así que el
  // paciente de un turno pago rebotaba al inicio y nunca veía el consentimiento
  // del turno. Hallazgo conocido desde mayo (B.3).
  const { data: paciente } = await supabase.from("pacientes").select("id").eq("user_id", user.id).maybeSingle();
  if (!paciente) redirect("/");
  const delTurno = await versionConsentimientoDelTurno(createAdminClient(), turnoId, paciente.id);
  if (!delTurno.ok && delTurno.motivo === "no_es_suyo") redirect("/");
  // Si no se pudo saber qué texto le toca, no se adivina y no se lo frena: sigue
  // a la confirmación (el consentimiento del turno no bloquea la atención).
  if (!delTurno.ok) redirect(destino);
  const { version, profesion } = delTurno;

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
      // La versión como key: si el texto cambia y la página se recarga, el tilde
      // y el "leí hasta el final" arrancan de cero.
      key={version}
      turnoId={turnoId}
      redirect={destino}
      profesion={profesion}
    />
  );
}
