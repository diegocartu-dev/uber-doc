export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import PerfilClient from "./PerfilClient";

export default async function PerfilMedicoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  // Step 1: Query NON-private fields via authenticated client (respects RLS)
  const { data: medico } = await supabase
    .from("medicos")
    .select(
      "id, nombre_completo, especialidad, numero_matricula, tipo_matricula, email, provincia, precio_consulta, duracion_consulta, modalidad_atencion, nova_evolucion_activa, telefono, domicilio_consultorio, foto_url, perfil_completo, firma_manuscrita_url"
    )
    .eq("user_id", user.id)
    .single();

  if (!medico) redirect("/dashboard");

  // Step 2: Query PRIVATE fields via adminClient (bypasses column-level REVOKE).
  // Session already validated above (user exists + is a médico). The adminClient
  // query is explicitly filtered by user.id — never exposes other médicos' data.
  const admin = createAdminClient();
  const { data: contactoPrivado } = await admin
    .from("medicos")
    .select("celular_personal, email_personal")
    .eq("user_id", user.id)
    .single();

  // Merge private fields into medico object for PerfilClient
  const medicoConPrivado = {
    ...medico,
    celular_personal: contactoPrivado?.celular_personal ?? null,
    email_personal: contactoPrivado?.email_personal ?? null,
  };
  const { data: mpAccount } = await admin
    .from("medicos_mp_accounts")
    .select(
      "mp_user_id, estado, conectado_en, expires_at, public_key"
    )
    .eq("medico_id", medico.id)
    .maybeSingle();

  return (
    <div className="min-h-full bg-[#f8f9fa]">
      <Suspense fallback={<div className="mx-auto max-w-2xl px-6 py-8" />}>
        <PerfilClient medico={medicoConPrivado} mpAccount={mpAccount} userEmail={user.email ?? ""} />
      </Suspense>
    </div>
  );
}
