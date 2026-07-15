import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import AppNavbar from "@/components/AppNavbar";
import ConfigCI from "./ConfigCI";

export const dynamic = "force-dynamic";

// Configurar Consulta Inmediata — spec "cómo atendés" (aprobada 14/07, impl 15/07).
// Valor + duración + horario + interruptor "Disponible ahora". Nada prellenado
// para el médico nuevo; el que ya configuró ve SUS valores (son elecciones suyas,
// no defaults). Fila propia vía service role (regla post-outage: el SELECT con
// columnas sin GRANT mata la query entera con el cliente RLS).
export default async function ConfigCIPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const admin = createAdminClient();
  const { data: medico } = await admin
    .from("medicos")
    .select("id, disponible, disponible_desde, disponible_hasta, duracion_consulta, precio_consulta, es_cuenta_test, ci_en_consultorio")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!medico) redirect("/dashboard");

  // MP + firma: el hub es el paso natural DESPUÉS de la activación — si faltan,
  // la pantalla lo avisa (el server action igual re-verifica al activar).
  const [mpRes, firmaRes] = await Promise.all([
    admin.from("medicos_mp_accounts").select("estado").eq("medico_id", medico.id).eq("estado", "activo").maybeSingle(),
    admin.from("medico_claves").select("id").eq("medico_id", medico.id).maybeSingle(),
  ]);
  const activacionCompleta = medico.es_cuenta_test === true || (!!mpRes.data && !!firmaRes.data);

  const fullName = user.user_metadata?.full_name || user.email;

  return (
    <div className="flex min-h-screen flex-col bg-[#f8f9fa]">
      <AppNavbar userName={fullName} userRole="medico" />
      <ConfigCI
        inicial={{
          disponible: !!medico.disponible,
          desde: medico.disponible_desde?.slice(0, 5) ?? "",
          hasta: medico.disponible_hasta?.slice(0, 5) ?? "",
          duracion: medico.duracion_consulta ? String(medico.duracion_consulta) : "",
          precio: medico.precio_consulta ?? 0,
          ciEnConsultorio: medico.ci_en_consultorio === true,
        }}
        activacionCompleta={activacionCompleta}
      />
    </div>
  );
}
