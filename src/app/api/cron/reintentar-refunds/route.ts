import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refundPayment, refundConReversionDeFee, getPaymentState } from "@/lib/mp-refund";
import { decrypt } from "@/lib/mp-crypto";
import { pushAlMedico } from "@/lib/push";
import { sendDoctoAlert } from "@/lib/alertas";
import { logInfo, logError } from "@/lib/logger";

// Horas tras las cuales un refund sin saldo del médico se escala a cobertura
// manual por CVU (sección 2.2 de la política de reembolsos).
//
// Decisión de Diego (2026-05-31, hallazgo I2 auditoría Roberto): el cron corre
// DIARIO (vercel.json `0 4 * * *`), así que la escalada real cae entre 48h y ~71h
// según la hora de cancelación. Se acepta esa ventana (caso edge ~1%, nadie
// pierde plata, solo se demora la transferencia CVU). El TyC se ajusta para
// informar ese plazo al paciente — PENDIENTE Carolina (ver POLITICA_REEMBOLSOS).
const HORAS_ESCALADA = 48;
// Tolerancia de redondeo al comparar montos refundeados (ARS).
const EPSILON = 0.5;
// Tope de filas por corrida para no pegar contra el timeout de la serverless.
const MAX_POR_CORRIDA = 50;

type Admin = ReturnType<typeof createAdminClient>;

interface RefundPendiente {
  id: string;
  tipo: "turno" | "consulta";
  recurso_id: string;
  medico_id: string;
  pago_id: string;
  neto_medico: number;
  application_fee: number;
  estado: "pendiente" | "fee_pendiente" | "escalado" | "resuelto";
  intentos: number;
  creado_at: string;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const ahora = new Date();
  const tokenDocto = process.env.MP_ACCESS_TOKEN;

  const { data: pendientes, error } = await admin
    .from("refunds_pendientes")
    .select("id, tipo, recurso_id, medico_id, pago_id, neto_medico, application_fee, estado, intentos, creado_at")
    .in("estado", ["pendiente", "fee_pendiente"])
    .lte("proximo_intento_at", ahora.toISOString())
    .order("proximo_intento_at", { ascending: true })
    .limit(MAX_POR_CORRIDA);

  if (error) {
    logError("[CRON/REFUNDS]", "Error leyendo refunds_pendientes", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let resueltos = 0;
  let escalados = 0;
  let reintentados = 0;
  let saltados = 0;

  for (const r of (pendientes ?? []) as RefundPendiente[]) {
    const proximo = new Date(ahora.getTime() + 24 * 60 * 60 * 1000).toISOString();

    // ── I1: claim atómico de la fila ──
    // Mueve proximo_intento_at +24h e incrementa intentos en un UPDATE condicionado.
    // Si otra corrida ya la tomó (proximo_intento_at ya no es <= ahora), afecta 0
    // filas y la saltamos: nadie procesa la misma fila dos veces ni pega a MP en paralelo.
    const { data: claimed } = await admin
      .from("refunds_pendientes")
      .update({
        intentos: (r.intentos ?? 1) + 1,
        ultimo_intento_at: ahora.toISOString(),
        proximo_intento_at: proximo,
      })
      .eq("id", r.id)
      .lte("proximo_intento_at", ahora.toISOString())
      .select("id");

    if (!claimed?.length) {
      saltados++;
      continue;
    }

    const { data: mpAccount } = await admin
      .from("medicos_mp_accounts")
      .select("access_token_encrypted")
      .eq("medico_id", r.medico_id)
      .eq("estado", "activo")
      .maybeSingle();

    if (!mpAccount?.access_token_encrypted || !tokenDocto) {
      await setError(admin, r.id, "Sin token MP (médico o Docto)");
      reintentados++;
      continue;
    }

    let tokenMedico: string;
    try {
      tokenMedico = decrypt(mpAccount.access_token_encrypted);
    } catch {
      await setError(admin, r.id, "Error desencriptando token médico");
      reintentados++;
      continue;
    }

    const prefix = `refund:${r.tipo}:${r.recurso_id}`;
    const neto = Number(r.neto_medico);
    const fee = Number(r.application_fee);
    const total = neto + fee;

    // ── C1: consultar el estado REAL del pago antes de decidir ──
    // Evita re-ejecutar un refund que ya se aplicó (over-refund → deuda fantasma)
    // cuando la idempotency key de MP expiró entre reintentos.
    const estadoPago = await getPaymentState(r.pago_id, tokenMedico);
    if (!estadoPago.ok) {
      // No pudimos confirmar el estado: NO escalamos a ciegas, reintentamos luego.
      await setError(admin, r.id, `No se pudo consultar el pago en MP: ${estadoPago.error ?? "desconocido"}`);
      reintentados++;
      continue;
    }

    const refundeado = estadoPago.amountRefunded ?? 0;

    // Ya está todo refundeado (ambas patas) → resolver, no reintentar.
    if (refundeado + EPSILON >= total) {
      await marcarResuelto(admin, r, ahora);
      resueltos++;
      continue;
    }

    // La pata del médico ya se aplicó (falta solo el fee de Docto).
    if (refundeado + EPSILON >= neto) {
      const res = await refundPayment(r.pago_id, tokenDocto, {
        amount: fee,
        idempotencyKey: `${prefix}:docto`,
      });
      if (res.ok) {
        await marcarResuelto(admin, r, ahora);
        resueltos++;
      } else {
        await setEstadoError(admin, r.id, "fee_pendiente", res.error);
        reintentados++;
      }
      continue;
    }

    // La pata del médico todavía no se aplicó → reintentar el refund completo.
    const res = await refundConReversionDeFee({
      paymentId: r.pago_id,
      tokenMedico,
      tokenDocto,
      applicationFee: fee,
      netoMedico: neto,
      idempotencyPrefix: prefix,
    });

    if (res.ok) {
      await marcarResuelto(admin, r, ahora);
      resueltos++;
    } else if (res.feePendiente) {
      await setEstadoError(
        admin,
        r.id,
        "fee_pendiente",
        res.refundDocto && !res.refundDocto.ok ? res.refundDocto.error : null
      );
      reintentados++;
    } else {
      // Sigue sin saldo. ¿Pasaron 48hs desde el primer intento? → escalar.
      const edadHoras = (ahora.getTime() - new Date(r.creado_at).getTime()) / (1000 * 60 * 60);
      if (edadHoras >= HORAS_ESCALADA) {
        await escalar(admin, r, ahora);
        escalados++;
      } else {
        await setError(admin, r.id, res.refundMedico.ok ? null : res.refundMedico.error);
        reintentados++;
      }
    }
  }

  if (resueltos || escalados || reintentados || saltados) {
    logInfo("[CRON/REFUNDS]", "Reintentos procesados", {
      resueltos,
      escalados,
      reintentados,
      saltados,
      total: pendientes?.length ?? 0,
    });
  }

  return NextResponse.json({
    ok: true,
    resueltos,
    escalados,
    reintentados,
    saltados,
    total: pendientes?.length ?? 0,
  });
}

/** Solo registra el motivo del último intento (intentos/proximo ya los movió el claim). */
async function setError(admin: Admin, id: string, error: string | null): Promise<void> {
  await admin.from("refunds_pendientes").update({ ultimo_error: error }).eq("id", id);
}

async function setEstadoError(
  admin: Admin,
  id: string,
  estado: "pendiente" | "fee_pendiente",
  error: string | null
): Promise<void> {
  await admin.from("refunds_pendientes").update({ estado, ultimo_error: error }).eq("id", id);
}

async function marcarResuelto(admin: Admin, r: RefundPendiente, ahora: Date): Promise<void> {
  await admin
    .from("refunds_pendientes")
    .update({
      estado: "resuelto",
      resuelto_at: ahora.toISOString(),
      ultimo_error: null,
    })
    .eq("id", r.id);

  const tabla = r.tipo === "consulta" ? "consultas" : "turnos";
  await admin.from(tabla).update({ reintegro_estado: "reembolsado" }).eq("id", r.recurso_id);
}

async function escalar(admin: Admin, r: RefundPendiente, ahora: Date): Promise<void> {
  await admin
    .from("refunds_pendientes")
    .update({
      estado: "escalado",
      ultimo_error: "48hs sin saldo — requiere cobertura manual CVU",
    })
    .eq("id", r.id);

  // I3: reflejar en el recurso que la resolución es por cobertura manual de Docto.
  const tabla = r.tipo === "consulta" ? "consultas" : "turnos";
  await admin.from(tabla).update({ reintegro_estado: "cubierto_docto" }).eq("id", r.recurso_id);

  // El médico debe el total: Docto cubrirá al paciente el 100% por CVU manual.
  const montoTotal = Number(r.neto_medico) + Number(r.application_fee);
  await admin.from("medicos_deuda").upsert(
    {
      medico_id: r.medico_id,
      monto: montoTotal,
      origen_tipo: r.tipo,
      origen_recurso_id: r.recurso_id,
      estado: "pendiente",
    },
    { onConflict: "origen_tipo,origen_recurso_id" }
  );

  await sendDoctoAlert(
    "[REFUND] Escalado a cobertura manual CVU",
    `Un refund lleva 48hs sin resolverse (médico sin saldo).\n\n` +
      `Tipo: ${r.tipo}\nRecurso: ${r.recurso_id}\nMédico: ${r.medico_id}\n` +
      `Monto a cubrir: $${montoTotal}\n\n` +
      `Acción: transferir al paciente por CVU desde el admin. La deuda del médico ` +
      `ya quedó registrada en medicos_deuda y se recuperará vía marketplace_fee.`
  );

  pushAlMedico(r.medico_id, {
    title: "Reembolso cubierto por Docto",
    body: "No se pudo debitar un reembolso de tu cuenta MP. Docto lo cubrió y se descontará de tus próximas consultas.",
    url: "/dashboard",
    tag: `deuda-${r.recurso_id}`,
  }).catch(() => {});
}
