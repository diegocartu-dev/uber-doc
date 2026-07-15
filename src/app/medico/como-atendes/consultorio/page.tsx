import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import AppNavbar from "@/components/AppNavbar";
import { getComisionForMedico } from "@/lib/comisiones";
import ConsultorioParticular from "./ConsultorioParticular";

export const dynamic = "force-dynamic";

// Consultorio particular (canal privado) — spec aprobada 14/07 (impl 15/07).
// El link es el protagonista: UN solo link a nivel consultorio (no por agenda),
// Copiar + WhatsApp, y las agendas privadas con su interruptor de pausa.
export default async function ConsultorioParticularPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const admin = createAdminClient();
  const { data: medico } = await admin
    .from("medicos")
    .select("id, slug, visible_consultorio_particular, categoria")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!medico) redirect("/dashboard");

  // Agendas del canal privado, con franjas (para la lista con pausa).
  const { data: modelos } = await admin
    .from("agenda_modelos")
    .select("id, nombre, fecha_inicio, fecha_fin, activo, prioridad, canal_origen, duracion_turno, precio, created_at")
    .eq("medico_id", medico.id)
    .eq("canal_origen", "consultorio_privado")
    .order("created_at", { ascending: false });

  const modeloIds = (modelos ?? []).map((m) => m.id);
  const { data: franjas } = modeloIds.length > 0
    ? await admin.from("agenda_franjas").select("id, modelo_id, dia_semana, hora_inicio, hora_fin").in("modelo_id", modeloIds)
    : { data: [] };

  type FranjaRow = { id: string; modelo_id: string; dia_semana: number; hora_inicio: string; hora_fin: string };
  const franjasPorModelo = new Map<string, FranjaRow[]>();
  for (const f of (franjas ?? []) as FranjaRow[]) {
    if (!franjasPorModelo.has(f.modelo_id)) franjasPorModelo.set(f.modelo_id, []);
    franjasPorModelo.get(f.modelo_id)!.push(f);
  }
  const modelosCompletos = (modelos ?? []).map((m) => ({ ...m, franjas: franjasPorModelo.get(m.id) ?? [] }));

  const fullName = user.user_metadata?.full_name || user.email;
  // Transparencia de comisión (Martín): acá quema más — el paciente lo trae el médico.
  const comisionPct = await getComisionForMedico(medico.id);

  return (
    <div className="flex min-h-screen flex-col bg-[#f8f9fa]">
      <AppNavbar userName={fullName} userRole="medico" />
      <ConsultorioParticular
        slug={medico.slug}
        modelos={modelosCompletos}
        comisionPct={comisionPct}
        visibleInicial={medico.visible_consultorio_particular !== false}
        esFounder={medico.categoria === "founder"}
      />
    </div>
  );
}
