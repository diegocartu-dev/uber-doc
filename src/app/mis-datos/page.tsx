export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppNavbar from "@/components/AppNavbar";
import MisDatosForm from "./MisDatosForm";

export default async function MisDatosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const fullName = user.user_metadata?.full_name || user.email;
  let role = user.user_metadata?.role as "paciente" | "medico" | null;

  // Detect role from DB
  const { data: medico } = await supabase
    .from("medicos")
    .select("id, nombre_completo, especialidad, numero_matricula, tipo_matricula, domicilio, precio_consulta, duracion_consulta")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: paciente } = await supabase
    .from("pacientes")
    .select("id, nombre_completo, dni, cuil, fecha_nacimiento, telefono, obra_social, nro_afiliado")
    .eq("user_id", user.id)
    .maybeSingle();

  if (medico) role = "medico";
  else if (paciente) role = "paciente";

  return (
    <div className="min-h-full" style={{ backgroundColor: "var(--color-bg-secondary)" }}>
      <AppNavbar userName={fullName} userRole={role} />
      <main className="mx-auto max-w-lg px-4 py-8">
        <h1
          className="text-xl font-bold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Mis datos
        </h1>
        <p
          className="mt-1 text-sm"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Edita tu informacion personal
        </p>

        <MisDatosForm
          role={role ?? "paciente"}
          email={user.email ?? ""}
          paciente={paciente}
          medico={medico}
        />
      </main>
    </div>
  );
}
