import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { elMedicoYaEstabaFinalizando, rescatarBorradorAlCerrar } from "@/lib/consultas/cerrar-con-rescate";

// Ver /api/consulta-estado: el request que cierra se lleva el rescate del
// borrador (emitir + firmar + avisar, con HTTP externo) y no entra en los 15 s
// por defecto de Vercel.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const turnoId = req.nextUrl.searchParams.get("turnoId");
  if (!turnoId) return NextResponse.json({ error: "Falta turnoId" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: medico } = await supabase
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  // NOTA: `desconectado_at` lo agrega la migración 20260606_resolucion_consultas_fase1.sql.
  // No desplegar este SELECT antes de aplicar la migración. Ver regla en CLAUDE.md.
  let query = supabase
    .from("turnos")
    .select("estado, sala_video_url, desconectado_at, medico_id")
    .eq("id", turnoId);

  if (medico) {
    query = query.eq("medico_id", medico.id);
  } else {
    const { data: paciente } = await supabase
      .from("pacientes").select("id").eq("user_id", user.id).maybeSingle();
    if (!paciente) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    query = query.eq("paciente_id", paciente.id);
  }

  const { data } = await query.single();

  if (!data) return NextResponse.json({ error: "No encontrado" }, { status: 403 });

  // Cierre on-demand del rejoin (mismo criterio que consulta-estado): 2 min sin
  // reconexión → cerramos acá. Sin dependencia del cron de 1 min (Vercel Pro).
  // Backstop diario: /api/cron/rejoin-expirar. Idempotente por estado='en_curso'.
  let estado = data.estado;
  let desconectado_at = data.desconectado_at;
  if (
    estado === "en_curso" &&
    desconectado_at &&
    new Date(desconectado_at).getTime() < Date.now() - 2 * 60 * 1000
  ) {
    const admin = createAdminClient();

    // Igual que en /api/consulta-estado: si el médico ya había apretado
    // "Finalizar" (el DELETE de la sala deja la marca), la emisión es de su
    // flujo y acá NO se rescata — rescatar sería duplicar documentos firmados.
    const finalizacionDelMedico = await elMedicoYaEstabaFinalizando("turno", turnoId);

    // `completada_at` + `cierre_origen` igual que en /api/consulta-estado: sin
    // ellos no hay duración del encuentro ni forma de saber quién lo cerró (el
    // camino de turnos los venía omitiendo).
    const { data: cerrado } = await admin
      .from("turnos")
      .update({
        estado: "completado",
        desconectado_at: null,
        completada_at: new Date().toISOString(),
        cierre_origen: finalizacionDelMedico ? "medico" : "desconexion",
      })
      .eq("id", turnoId)
      .eq("estado", "en_curso")
      .select("id")
      .maybeSingle();
    if (cerrado) {
      estado = "completado";
      desconectado_at = null;

      // El UPDATE condicionado de arriba es el mutex: solo el request que cerró
      // el turno rescata el borrador. Se espera a propósito (ver consulta-estado).
      if (!finalizacionDelMedico) {
        await rescatarBorradorAlCerrar({ tipo: "turno", id: turnoId, origen: "desconexion" });
      }
    }
  }

  // ¿El médico está atendiendo a OTRO paciente ahora? (CI o turno en_curso). La sala de
  // espera lo muestra para que una demora >20 min se entienda como legítima (decisión
  // Diego 08/07: el motor de no-show no resuelve mientras el médico esté atendiendo).
  // Solo se computa para el paciente esperando — con admin client (agregado, sin PII).
  let medico_ocupado = false;
  if (!medico && estado === "en_espera" && data.medico_id) {
    const admin = createAdminClient();
    const [{ count: cis }, { count: tns }] = await Promise.all([
      admin.from("consultas").select("id", { count: "exact", head: true }).eq("medico_id", data.medico_id).eq("estado", "en_curso"),
      admin.from("turnos").select("id", { count: "exact", head: true }).eq("medico_id", data.medico_id).eq("estado", "en_curso"),
    ]);
    medico_ocupado = (cis ?? 0) > 0 || (tns ?? 0) > 0;
  }

  return NextResponse.json({ estado, sala_video_url: data.sala_video_url, desconectado_at, medico_ocupado });
}
