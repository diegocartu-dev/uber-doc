import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Stethoscope } from "lucide-react";
import SalaEsperaCliente from "./SalaEsperaCliente";

export default async function SalaEsperaPage({
  params,
}: {
  params: Promise<{ consultaId: string }>;
}) {
  const { consultaId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Traer la consulta con datos del médico
  const { data: consulta, error } = await supabase
    .from("consultas")
    .select("id, especialidad, estado, created_at, medico_id")
    .eq("id", consultaId)
    .eq("paciente_id", user.id)
    .single();

  if (error || !consulta) {
    redirect("/clinica");
  }

  // Traer datos del médico
  const { data: medico } = await supabase
    .from("medicos")
    .select("id, nombre_completo, precio_consulta, duracion_consulta")
    .eq("id", consulta.medico_id)
    .single();

  if (!medico) {
    redirect("/clinica");
  }

  // Contar posición en la cola (consultas esperando antes que esta)
  const { count } = await supabase
    .from("consultas")
    .select("id", { count: "exact", head: true })
    .eq("medico_id", consulta.medico_id)
    .eq("estado", "esperando")
    .lt("created_at", consulta.created_at);

  const posicion = (count ?? 0) + 1;
  const tiempoEstimado = posicion * medico.duracion_consulta;

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
          <Link
            href="/clinica"
            className="text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Volver a la clinica
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-lg px-4 py-16">
        <SalaEsperaCliente
          consultaId={consulta.id}
          estado={consulta.estado}
          medicoNombre={medico.nombre_completo}
          precio={medico.precio_consulta}
          duracion={medico.duracion_consulta}
          especialidad={consulta.especialidad}
          posicion={posicion}
          tiempoEstimado={tiempoEstimado}
          isDev={process.env.NODE_ENV === "development"}
        />
      </main>
    </div>
  );
}
