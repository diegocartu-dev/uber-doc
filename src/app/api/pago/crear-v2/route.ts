import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/mp-crypto";
import { getFlag } from "@/lib/feature-flags";
import { getComisionForMedico } from "@/lib/comisiones";
import { sendDoctoAlert } from "@/lib/alertas";
import { logInfo, logError, logWarn } from "@/lib/logger";
import { sanitizeMpError } from "@/lib/mp-error-sanitizer";
import { trackEvent } from "@/lib/funnel";

type TipoPago = "consulta" | "turno";

interface PagoBody {
  tipo: TipoPago;
  id: string;
}

export async function POST(req: NextRequest) {
  if (!(await getFlag("pago_marketplace"))) {
    return NextResponse.json(
      { error: "Pagos marketplace deshabilitados temporalmente.", code: "FEATURE_DISABLED" },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  let body: PagoBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const { tipo, id } = body;
  if (!tipo || !id || (tipo !== "consulta" && tipo !== "turno")) {
    return NextResponse.json(
      { error: "Se requiere tipo ('consulta' | 'turno') e id." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const recurso = await obtenerRecurso(supabase, admin, tipo, id, user.id);
  if ("error" in recurso) {
    return NextResponse.json({ error: recurso.error }, { status: recurso.status });
  }

  const { medicoId, monto, titulo, descripcion, redirectSuccess, redirectFailure, redirectPending } = recurso;

  const { data: mpAccount } = await admin
    .from("medicos_mp_accounts")
    .select("access_token_encrypted, estado, expires_at, live_mode")
    .eq("medico_id", medicoId)
    .single();

  if (!mpAccount || mpAccount.estado !== "activo") {
    return NextResponse.json(
      { error: "El médico no tiene cobros habilitados." },
      { status: 422 }
    );
  }

  // Sandbox mode: test sellers can't do OAuth with their own app in MP sandbox.
  // Use the APP's test token instead. marketplace_fee still gets sent.
  const isSandbox = mpAccount.live_mode === false;

  if (!isSandbox && new Date(mpAccount.expires_at) <= new Date()) {
    await admin
      .from("medicos_mp_accounts")
      .update({ estado: "expirado", desconectado_en: new Date().toISOString() })
      .eq("medico_id", medicoId);

    logWarn("[MP-V2]", "Token expirado al crear pago", { medicoId, tipo, recursoId: id });

    return NextResponse.json(
      { error: "El médico no tiene cobros habilitados." },
      { status: 422 }
    );
  }

  // Always use the seller's OAuth token — in both production and sandbox.
  // The OAuth callback now omits test_token:true, so the seller's token
  // authenticates as the actual seller (test or production), not the app owner.
  let accessToken: string;

  try {
    accessToken = decrypt(mpAccount.access_token_encrypted);
  } catch {
    logError("[MP-V2]", "Error desencriptando token", { medicoId });
    return NextResponse.json(
      { error: "Error interno de configuración de cobros." },
      { status: 500 }
    );
  }

  const comisionPct = await getComisionForMedico(medicoId);
  const marketplaceFee = Math.round(monto * (comisionPct / 100) * 100) / 100;

  const baseUrl = req.nextUrl.origin;

  try {
    const prefBody = {
      items: [
        {
          id,
          title: titulo,
          description: descripcion,
          quantity: 1,
          unit_price: monto,
          currency_id: "ARS",
        },
      ],
      marketplace_fee: marketplaceFee,
      back_urls: {
        success: `${baseUrl}${redirectSuccess}`,
        failure: `${baseUrl}${redirectFailure}`,
        pending: `${baseUrl}${redirectPending}`,
      },
      notification_url: `${baseUrl}/api/pago/webhook`,
      external_reference: `${tipo}:${id}`,
      metadata: {
        tipo,
        recurso_id: id,
        paciente_user_id: user.id,
        medico_id: medicoId,
        comision_pct: comisionPct,
        marketplace_fee: marketplaceFee,
      },
    };

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(prefBody),
    });

    if (mpRes.status === 401) {
      logError("[MP-V2]", "Token rechazado por MP (401)", { medicoId, tipo, recursoId: id });
      await admin
        .from("medicos_mp_accounts")
        .update({
          estado: "revocado",
          desconectado_en: new Date().toISOString(),
          last_refresh_status: "revoked",
        })
        .eq("medico_id", medicoId);

      await sendDoctoAlert(
        `[ALERTA] Token MP revocado al intentar cobrar`,
        `El token de un médico fue rechazado (401) al crear una preferencia de pago.\nSu cuenta MP fue marcada como revocada automáticamente.\n\nMédico ID: ${medicoId}\nTipo: ${tipo}\nRecurso ID: ${id}\nFecha: ${new Date().toISOString()}\n\nAcción: contactar al médico para que reconecte su cuenta de MP.`
      );

      return NextResponse.json(
        { error: "El médico no tiene cobros habilitados." },
        { status: 422 }
      );
    }

    if (!mpRes.ok) {
      let errBody: unknown = null;
      try { errBody = await mpRes.json(); } catch { errBody = { raw: "non-json response" }; }
      logError("[MP-V2]", "Error creando preferencia", { ...sanitizeMpError(mpRes.status, errBody), medico_id: medicoId });
      return NextResponse.json(
        { error: "Error al procesar el pago con Mercado Pago." },
        { status: 502 }
      );
    }

    const pref = await mpRes.json();

    if (!pref.init_point) {
      logError("[MP-V2]", "Respuesta sin init_point", { ...sanitizeMpError(mpRes.status, pref), medico_id: medicoId });
      return NextResponse.json(
        { error: "Mercado Pago no devolvió URL de pago." },
        { status: 502 }
      );
    }

    logInfo("[MP-V2]", "Preferencia creada", {
      tipo,
      recursoId: id,
      medicoId,
      monto,
      marketplaceFee,
      prefId: pref.id,
    });

    trackEvent({ evento: "pago_creado", pacienteId: user.id, medicoId, metadata: { tipo, recursoId: id, monto, marketplaceFee, prefId: pref.id } });

    return NextResponse.json({ init_point: pref.init_point });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError("[MP-V2]", "Error inesperado", { error: message });
    return NextResponse.json(
      { error: "Error interno al crear el pago." },
      { status: 500 }
    );
  }
}

type RecursoOk = {
  medicoId: string;
  monto: number;
  titulo: string;
  descripcion: string;
  redirectSuccess: string;
  redirectFailure: string;
  redirectPending: string;
};

type RecursoError = { error: string; status: number };

async function obtenerRecurso(
  supabase: Awaited<ReturnType<typeof createClient>>,
  admin: ReturnType<typeof createAdminClient>,
  tipo: TipoPago,
  id: string,
  userId: string
): Promise<RecursoOk | RecursoError> {
  if (tipo === "consulta") {
    return obtenerConsulta(supabase, admin, id, userId);
  }
  return obtenerTurno(supabase, admin, id, userId);
}

async function obtenerConsulta(
  supabase: Awaited<ReturnType<typeof createClient>>,
  admin: ReturnType<typeof createAdminClient>,
  consultaId: string,
  userId: string
): Promise<RecursoOk | RecursoError> {
  const { data: consulta } = await supabase
    .from("consultas")
    .select("id, especialidad, estado, medico_id")
    .eq("id", consultaId)
    .eq("paciente_id", userId)
    .single();

  if (!consulta) {
    return { error: "Consulta no encontrada.", status: 404 };
  }
  if (consulta.estado !== "aceptada") {
    return { error: "La consulta no está lista para pagar.", status: 400 };
  }

  const { data: medico } = await admin
    .from("medicos")
    .select("nombre_completo, precio_consulta, duracion_consulta")
    .eq("id", consulta.medico_id)
    .single();

  if (!medico || !medico.precio_consulta) {
    return { error: "El médico no tiene precio configurado.", status: 422 };
  }

  return {
    medicoId: consulta.medico_id,
    monto: medico.precio_consulta,
    titulo: `Consulta de ${consulta.especialidad} — Dr. ${medico.nombre_completo}`,
    descripcion: `Consulta virtual de ${medico.duracion_consulta} minutos`,
    redirectSuccess: `/consulta/${consultaId}/info-medica?redirect=/consulta/${consultaId}/confirmacion`,
    redirectFailure: `/sala-espera/${consultaId}?pago=error`,
    redirectPending: `/sala-espera/${consultaId}?pago=pendiente`,
  };
}

async function obtenerTurno(
  supabase: Awaited<ReturnType<typeof createClient>>,
  admin: ReturnType<typeof createAdminClient>,
  turnoId: string,
  userId: string
): Promise<RecursoOk | RecursoError> {
  const { data: paciente } = await admin
    .from("pacientes")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (!paciente) {
    return { error: "Perfil de paciente no encontrado.", status: 404 };
  }

  const { data: turno } = await admin
    .from("turnos")
    .select("id, estado, medico_id, monto, fecha, hora_inicio")
    .eq("id", turnoId)
    .eq("paciente_id", paciente.id)
    .single();

  if (!turno) {
    return { error: "Turno no encontrado.", status: 404 };
  }
  if (turno.estado !== "reservado_pendiente") {
    return { error: "El turno no está pendiente de pago.", status: 400 };
  }
  if (!turno.monto || turno.monto <= 0) {
    return { error: "El turno no tiene precio asignado.", status: 422 };
  }

  const { data: medico } = await admin
    .from("medicos")
    .select("nombre_completo, duracion_consulta")
    .eq("id", turno.medico_id)
    .single();

  const medicoNombre = medico?.nombre_completo ?? "Médico";
  const duracion = medico?.duracion_consulta ?? 20;

  return {
    medicoId: turno.medico_id,
    monto: turno.monto,
    titulo: `Turno programado — Dr. ${medicoNombre}`,
    descripcion: `Consulta virtual de ${duracion} minutos — ${turno.fecha} ${turno.hora_inicio}`,
    redirectSuccess: `/turno/${turnoId}/info-medica?redirect=/turno/${turnoId}/confirmacion`,
    redirectFailure: `/clinica/${turno.medico_id}/turnos?pago=error`,
    redirectPending: `/clinica/${turno.medico_id}/turnos?pago=pendiente`,
  };
}
