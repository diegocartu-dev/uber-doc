import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { elMedicoYaEstabaFinalizando, rescatarBorradorAlCerrar } from "@/lib/consultas/cerrar-con-rescate";

// El request que gana la carrera del cierre se lleva además el rescate del
// borrador: emitir + firmar + avisar es HTTP externo (Resend, web-push) y no
// entra en los 15 s por defecto de Vercel. El resto de los polls sigue
// respondiendo en milisegundos — esto es un techo, no una espera.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const consultaId = req.nextUrl.searchParams.get("consultaId");
  if (!consultaId) return NextResponse.json({ error: "Falta consultaId" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  // Determinar rol del usuario
  const { data: medico } = await supabase
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  // Filtrar por ownership: paciente_id = auth.uid() o medico_id = medico.id
  // NOTA: `desconectado_at` lo agrega la migración 20260606_resolucion_consultas_fase1.sql.
  // El código que lo selecciona NO debe desplegarse antes de aplicar esa migración
  // (PostgREST falla el SELECT si la columna no existe). Ver regla en CLAUDE.md.
  // `mp_status` (verificado en prod: existe y tiene GRANT SELECT para `authenticated`,
  // así que no rompe el SELECT con cliente RLS) lo necesitan las pantallas del
  // paciente para distinguir "aceptada SIN pagar" de "pago en camino / ya pagado".
  let query = supabase
    .from("consultas")
    .select("estado, sala_video_url, desconectado_at, mp_status")
    .eq("id", consultaId);

  if (medico) {
    query = query.eq("medico_id", medico.id);
  } else {
    query = query.eq("paciente_id", user.id);
  }

  const { data } = await query.single();

  if (!data) return NextResponse.json({ error: "No encontrada" }, { status: 403 });

  // Cierre on-demand del rejoin: si el corte (desconectado_at) lleva >= 2 min sin
  // reconexión, cerramos acá mismo en vez de depender de un cron de 1 min (que
  // requiere Vercel Pro). El que espera en "Reconectando…" hace polling cada 5s →
  // dispara el cierre a tiempo. Backstop diario: /api/cron/rejoin-expirar.
  // Idempotente: el UPDATE va condicionado por estado='en_curso'.
  //
  // Ese UPDATE condicionado es además el MUTEX del rescate del borrador: solo el
  // request que efectivamente cerró la consulta (el que recibió fila de vuelta)
  // rescata lo que el médico había escrito. Si el webhook de video y este polling
  // se disparan a la vez, uno solo cierra y uno solo emite documentos.
  let estado = data.estado;
  let desconectado_at = data.desconectado_at;
  if (
    estado === "en_curso" &&
    desconectado_at &&
    new Date(desconectado_at).getTime() < Date.now() - 2 * 60 * 1000
  ) {
    const admin = createAdminClient();

    // ¿El médico ya había apretado "Finalizar"? El overlay de corte le ofrece el
    // botón justo mientras corre este reloj de 2 minutos, así que las dos cosas
    // pueden pasar en el mismo segundo. Si él lo inició, la emisión es de SU
    // flujo: acá se cierra sin rescatar y sin pisar la firma del cierre. Mismo
    // criterio que el webhook de video.
    const finalizacionDelMedico = await elMedicoYaEstabaFinalizando("consulta", consultaId);

    const { data: cerrada } = await admin
      .from("consultas")
      .update({
        estado: "completada",
        desconectado_at: null,
        completada_at: new Date().toISOString(),
        cierre_origen: finalizacionDelMedico ? "medico" : "desconexion",
      })
      .eq("id", consultaId)
      .eq("estado", "en_curso")
      .select("id")
      .maybeSingle();
    if (cerrada) {
      estado = "completada";
      desconectado_at = null;

      // Rescate del borrador. Se ESPERA a propósito: el paciente que está
      // polleando va a ver "completada" con esta misma respuesta y en el próximo
      // paso pide sus documentos — si el rescate corriera después, la pantalla de
      // cierre le mostraría "sin documentos" durante unos segundos.
      // Nunca lanza y nunca revierte el cierre (ver el módulo).
      if (!finalizacionDelMedico) {
        await rescatarBorradorAlCerrar({
          tipo: "consulta",
          id: consultaId,
          origen: "desconexion",
        });
      }
    }
  }

  return NextResponse.json({
    estado,
    sala_video_url: data.sala_video_url,
    desconectado_at,
    mp_status: data.mp_status ?? null,
  });
}
