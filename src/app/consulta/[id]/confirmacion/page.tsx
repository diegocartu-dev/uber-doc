import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EsperaVideo from "./EsperaVideo";
import DoctoLogo from "@/components/DoctoLogo";
import { getReturnUrl } from "@/lib/consultorio-url";

export default async function ConfirmacionPagoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: consultaId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Verificar consulta del paciente
  const { data: consulta } = await supabase
    .from("consultas")
    .select("id, especialidad, estado, medico_id, sala_video_url, created_at, canal_origen")
    .eq("id", consultaId)
    .eq("paciente_id", user.id)
    .single();

  if (!consulta) {
    redirect("/clinica");
  }

  const returnUrl = await getReturnUrl(consulta.medico_id, consulta.canal_origen, "/dashboard");

  // Traer datos del médico
  const { data: medico } = await supabase
    .from("medicos")
    .select("nombre_completo, especialidad, duracion_consulta, precio_consulta")
    .eq("id", consulta.medico_id)
    .single();

  return (
    <div className="min-h-full" style={{ backgroundColor: "var(--color-bg-secondary)" }}>
      <nav
        className="sticky top-0 z-50 bg-white"
        style={{ borderBottom: "1px solid var(--color-border-default)", height: 56 }}
      >
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 lg:px-6">
          <DoctoLogo />
        </div>
      </nav>

      <main className="mx-auto max-w-lg px-4 py-16">
        <EsperaVideo
          consultaId={consultaId}
          salaVideoUrlInicial={consulta.sala_video_url}
          estadoInicial={consulta.estado}
          medicoNombre={medico?.nombre_completo ?? ""}
          especialidad={consulta.especialidad}
          duracionConsulta={medico?.duracion_consulta ?? 20}
          createdAt={consulta.created_at}
          returnUrl={returnUrl}
        />

        {/* "Volver al inicio" se maneja dentro de EsperaVideo para ser reactivo al polling */}
      </main>
    </div>
  );
}
