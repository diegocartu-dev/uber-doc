import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import ContinuarRegistro from "./ContinuarRegistro";

export const dynamic = "force-dynamic";

// FASE B del registro médico (rediseño 14/07). El médico confirmó el mail (Fase A)
// → /auth/callback lo logueó y lo mandó acá. Completa datos + credencial → se crea
// la ficha de `medicos` → biometría. Requiere sesión (si no, a login). Si ya tiene
// ficha (volvió acá por error), lo mandamos al paso siguiente (biometría).
export default async function ContinuarRegistroPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const admin = createAdminClient();
  const { data: medico } = await admin
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (medico) redirect("/registro-medico/identidad");

  const nombre = (user.user_metadata?.full_name as string) || "";

  return <ContinuarRegistro nombre={nombre} userId={user.id} />;
}
