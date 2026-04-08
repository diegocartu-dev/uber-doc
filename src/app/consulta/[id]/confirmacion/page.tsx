import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Stethoscope } from "lucide-react";
import EsperaVideo from "./EsperaVideo";

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
    .select("id, especialidad, estado, medico_id, sala_video_url, created_at")
    .eq("id", consultaId)
    .eq("paciente_id", user.id)
    .single();

  if (!consulta) {
    redirect("/clinica");
  }

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
          <Link href="/dashboard" className="flex items-center gap-2">
            <Stethoscope size={24} strokeWidth={2} color="var(--color-brand)" />
            <span className="text-lg font-bold lowercase" style={{ color: "var(--color-text-primary)" }}>docto</span>
          </Link>
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
        />

        {/* "Volver al inicio" se maneja dentro de EsperaVideo para ser reactivo al polling */}
      </main>
    </div>
  );
}
