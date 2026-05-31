import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refundPayment, refundConReversionDeFee } from "@/lib/mp-refund";
import { decrypt } from "@/lib/mp-crypto";
import { pushAlMedico } from "@/lib/push";
import { sendDoctoAlert } from "@/lib/alertas";
import { logInfo, logError } from "@/lib/logger";

// Horas tras las cuales un refund sin saldo del médico se escala a cobertura
// manual por CVU (sección 2.2 de la política de reembolsos).
const HORAS_ESCALADA = 48;

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
    .lte("proximo_intento_at", ahora.toISOString());

  if (error) {
    logError("[CRON/REFUNDS]", "Error leyendo refunds_pendientes", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let resueltos = 0;
  let escalados = 0;
  let reintentados = 0;

  for (const r of (pendientes ?? []) as RefundPendiente[]) {
    const proximo = new Date(ahora.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const intentos = (r.intentos ?? 1) + 1;

    const { data: mpAccount } = await admin
      .from("medicos_mp_accounts")
      .select("access_token_encrypted")
      .eq("medico_id", r.medico_id)
      .eq("estado", "activo")
      .maybeSingle();

    if (!mpAccount?.access_token_encrypted || !tokenDocto) {
      await marcarIntento(admin, r.id, intentos, ahora, proximo, "Sin token MP (médico o Docto)");
      reintentados++;
      continue;
    }

    let tokenMedico: string;
    try {
      tokenMedico = decrypt(mpAccount.access_token_encrypted);
    } catch {
      await marcarIntento(admin, r.id, intentos, ahora, proximo, "Error desencriptando token médico");
      reintentados++;
      continue;
    }

    const prefix = `refund:${r.tipo}:${r.recurso_id}`;

    // ── fee_pendiente: solo falta la pata de Docto ──
    if (r.estado === "fee_pendiente") {
      const res = await refundPayment(r.pago_id, tokenDocto, {
        amount: Number(r.application_fee),
        idempotencyKey: `${prefix}:docto`,
      });
      if (res.ok) {
        await marcarResuelto(admin, r, ahora);
        resueltos++;
      } else {
        await marcarIntento(admin, r.id, intentos, ahora, proximo, res.error);
        reintentados++;
      }
      continue;
    }

    // ── pendiente: reintentar el refund completo (idempotente) ──
    const res = await refundConReversionDeFee({
      paymentId: r.pago_id,
      tokenMedico,
      tokenDocto,
      applicationFee: Number(r.application_fee),
      netoMedico: Number(r.neto_medico),
      idempotencyPrefix: prefix,
    });

    if (res.ok) {
      await marcarResuelto(admin, r, ahora);
      resueltos++;
    } else if (res.feePendiente) {
      // El médico ya tenía saldo (pata médico OK); solo falta el fee de Docto.
      await admin
        .from("refunds_pendientes")
        .update({
          estado: "fee_pendiente",
          intentos,
          ultimo_intento_at: ahora.toISOString(),
          proximo_intento_at: proximo,
          ultimo_error: res.refundDocto && !res.refundDocto.ok ? res.refundDocto.error : null,
        })
        .eq("id", r.id);
      reintentados++;
    } else {
      // Sigue sin saldo. ¿Pasaron 48hs desde el primer intento? → escalar.
      const edadHoras = (ahora.getTime() - new Date(r.creado_at).getTime()) / (1000 * 60 * 60);
      if (edadHoras >= HORAS_ESCALADA) {
        await escalar(admin, r, ahora);
        escalados++;
      } else {
        await marcarIntento(admin, r.id, intentos, ahora, proximo, res.refundMedico.ok ? null : res.refundMedico.error);
        reintentados++;
      }
    }
  }

  if (resueltos || escalados || reintentados) {
    logInfo("[CRON/REFUNDS]", "Reintentos procesados", {
      resueltos,
      escalados,
      reintentados,
      total: pendientes?.length ?? 0,
    });
  }

  return NextResponse.json({
    ok: true,
    resueltos,
    escalados,
    reintentados,
    total: pendientes?.length ?? 0,
  });
}

async function marcarIntento(
  admin: Admin,
  id: string,
  intentos: number,
  ahora: Date,
  proximo: string,
  error: string | null
): Promise<void> {
  await admin
    .from("refunds_pendientes")
    .update({
      intentos,
      ultimo_intento_at: ahora.toISOString(),
      proximo_intento_at: proximo,
      ultimo_error: error,
    })
    .eq("id", id);
}

async function marcarResuelto(admin: Admin, r: RefundPendiente, ahora: Date): Promise<void> {
  await admin
    .from("refunds_pendientes")
    .update({
      estado: "resuelto",
      resuelto_at: ahora.toISOString(),
      ultimo_intento_at: ahora.toISOString(),
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
      ultimo_intento_at: ahora.toISOString(),
      ultimo_error: "48hs sin saldo — requiere cobertura manual CVU",
    })
    .eq("id", r.id);

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
