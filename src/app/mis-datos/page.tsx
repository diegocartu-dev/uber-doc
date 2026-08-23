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
    .select("id, nombre_completo, especialidad, numero_matricula, tipo_matricula, domicilio, precio_consulta, duracion_consulta, slug")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: pacienteRaw } = await supabase
    .from("pacientes")
    .select("id, nombre_completo, nombre, apellido, dni, cuil, fecha_nacimiento, telefono, tiene_cobertura, obra_social, obra_social_id, obra_social_otra, nro_afiliado, plan_obra_social")
    .eq("user_id", user.id)
    .maybeSingle();

  // Resolver el nombre de la obra social desde la misma cadena que usa el resto
  // de la app: FK (obras_sociales) > obra_social_otra > legacy obra_social.
  // Sin esto, mis-datos solo leía `obra_social` (legacy) y mostraba vacío a
  // quienes eligieron de la lista (obra_social_id), pareciendo "no se guardó".
  let obraSocialResuelta: string | null = null;
  if (pacienteRaw?.obra_social_id) {
    const { data: os } = await supabase
      .from("obras_sociales")
      .select("nombre")
      .eq("id", pacienteRaw.obra_social_id)
      .maybeSingle();
    obraSocialResuelta = os?.nombre ?? null;
  }
  obraSocialResuelta =
    obraSocialResuelta ??
    pacienteRaw?.obra_social_otra ??
    pacienteRaw?.obra_social ??
    null;

  // Sexo registral en query aparte, para derivar el CUIL cuando no está cargado.
  // No se suma al SELECT principal a propósito (misma precaución que en
  // /documentos): ese SELECT funciona en producción y no se toca.
  let sexoDni: string | null = null;
  if (pacienteRaw) {
    const { data: perfil } = await supabase
      .from("pacientes")
      .select("sexo_dni")
      .eq("id", pacienteRaw.id)
      .maybeSingle();
    sexoDni = perfil?.sexo_dni ?? null;
  }

  const paciente = pacienteRaw
    ? { ...pacienteRaw, obra_social_resuelta: obraSocialResuelta, sexo_dni: sexoDni }
    : null;

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
          Edita tu información personal
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
