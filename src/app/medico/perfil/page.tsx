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

  const { data: medico } = await supabase
    .from("medicos")
    .select(
      "id, nombre_completo, especialidad, numero_matricula, tipo_matricula, email, provincia, precio_consulta, duracion_consulta, modalidad_atencion, nova_evolucion_activa, telefono, domicilio_consultorio, foto_url, perfil_completo, firma_manuscrita_url"
    )
    .eq("user_id", user.id)
    .single();

  if (!medico) redirect("/dashboard");

  const admin = createAdminClient();
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
        <PerfilClient medico={medico} mpAccount={mpAccount} userEmail={user.email ?? ""} />
      </Suspense>
    </div>
  );
}
