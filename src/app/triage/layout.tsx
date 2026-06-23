import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { guardRutaPaciente } from "@/lib/auth/rol";

// /triage es un componente CLIENTE (no puede gatear el rol inline). Este layout server
// corre antes y aplica el guard de ruta de paciente: médico → /dashboard, admin → /admin.
// Así un médico/admin no puede iniciar el flujo de Consulta Inmediata como si fuera
// paciente entrando por URL directa.
export default async function TriageLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  await guardRutaPaciente(supabase, user.id);
  return <>{children}</>;
}
