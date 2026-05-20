import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ConsentimientoInformado from "@/components/ConsentimientoInformado";

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

  if (!turno || turno.paciente_id !== user.id) {
    redirect("/");
  }

  const { data: existing } = await supabase
    .from("consentimientos_informados")
    .select("id")
    .eq("paciente_id", user.id)
    .eq("turno_id", turnoId)
    .eq("texto_version", "v1")
    .limit(1)
    .maybeSingle();

  if (existing) {
    redirect(destino);
  }

  return (
    <ConsentimientoInformado
      turnoId={turnoId}
      redirect={destino}
    />
  );
}
