import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ConsentimientoInformado from "@/components/ConsentimientoInformado";

function sanitizeRedirect(url: string | undefined, fallback: string): string {
  if (!url) return fallback;
  if (!url.startsWith("/") || url.startsWith("//")) return fallback;
  return url;
}

export default async function ConsentimientoConsultaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { id: consultaId } = await params;
  const { redirect: redirectUrl } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const destino = sanitizeRedirect(redirectUrl, `/consulta/${consultaId}/confirmacion`);

  const { data: consulta } = await supabase
    .from("consultas")
    .select("paciente_id")
    .eq("id", consultaId)
    .single();

  if (!consulta || consulta.paciente_id !== user.id) {
    redirect("/");
  }

  const { data: existing } = await supabase
    .from("consentimientos_informados")
    .select("id")
    .eq("paciente_id", user.id)
    .eq("consulta_id", consultaId)
    .eq("texto_version", "v1")
    .limit(1)
    .maybeSingle();

  if (existing) {
    redirect(destino);
  }

  return (
    <ConsentimientoInformado
      consultaId={consultaId}
      redirect={destino}
    />
  );
}
