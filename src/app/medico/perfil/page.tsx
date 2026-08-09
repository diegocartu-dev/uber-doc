export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import PerfilClient from "./PerfilClient";
import { parsearAreasAtencion } from "@/lib/areas-atencion";

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
      // `titulo` ("Dr."/"Dra.") es el que el médico eligió en su registro: su
      // propio perfil mostraba el nombre pelado bajo la foto. Se suma SOLO esa
      // columna — este SELECT usa el cliente RLS y `medicos` tiene columnas sin
      // GRANT que harían fallar la query entera en silencio (CLAUDE.md). `titulo`
      // tiene GRANT para `authenticated`, verificado contra producción.
      "id, nombre_completo, titulo, especialidad, numero_matricula, tipo_matricula, email, provincia, precio_consulta, duracion_consulta, modalidad_atencion, nova_evolucion_activa, telefono, domicilio_consultorio, foto_url, perfil_completo, firma_manuscrita_url"
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
  // Áreas de atención adicionales (ej: Adolescencia 10-19). Query PROPIA a propósito:
  // es una columna nueva, así que si algo fallara con ella se cae SOLO este dato y el
  // perfil sigue abriendo (regla del repo: no sumar columnas nuevas a SELECTs que ya
  // funcionan en producción). Con service role, filtrada por user_id.
  const { data: areasRow } = await admin
    .from("medicos")
    .select("areas_atencion")
    .eq("user_id", user.id)
    .maybeSingle();
  const areasAtencion = parsearAreasAtencion(areasRow?.areas_atencion);

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
        <PerfilClient
          medico={medicoConPrivado}
          mpAccount={mpAccount}
          userEmail={user.email ?? ""}
          areasAtencion={areasAtencion}
        />
      </Suspense>
    </div>
  );
}
