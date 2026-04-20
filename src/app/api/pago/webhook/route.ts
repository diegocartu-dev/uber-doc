import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createHmac, timingSafeEqual } from "crypto";

function verificarFirmaMP(req: NextRequest, body: unknown): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return false;

  const xSignature = req.headers.get("x-signature");
  const xRequestId = req.headers.get("x-request-id");
  if (!xSignature || !xRequestId) return false;

  const parts = Object.fromEntries(
    xSignature.split(",").map((p) => {
      const [k, ...v] = p.split("=");
      return [k.trim(), v.join("=")];
    })
  );

  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;

  const dataId = (body as { data?: { id?: string } })?.data?.id;
  const manifest = `id:${dataId ?? ""};request-id:${xRequestId};ts:${ts};`;

  const hmac = createHmac("sha256", secret).update(manifest).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(hmac), Buffer.from(v1));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!verificarFirmaMP(req, body)) {
      return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
    }

    const { action, data } = body;

    if (action !== "payment.created" && action !== "payment.updated") {
      return NextResponse.json({ received: true });
    }

    if (!data?.id) {
      return NextResponse.json({ received: true });
    }

    const mpToken = process.env.MP_ACCESS_TOKEN;
    if (!mpToken) {
      return NextResponse.json({ received: true });
    }

    const paymentRes = await fetch(
      `https://api.mercadopago.com/v1/payments/${data.id}`,
      {
        headers: { Authorization: `Bearer ${mpToken}` },
      }
    );

    if (!paymentRes.ok) {
      return NextResponse.json({ received: true });
    }

    const payment = await paymentRes.json();

    if (payment.status === "approved" && payment.external_reference) {
      const consultaId = payment.external_reference;
      const supabaseAdmin = createAdminClient();

      await supabaseAdmin
        .from("consultas")
        .update({ estado: "pagada" })
        .eq("id", consultaId)
        .eq("estado", "aceptada");
    }

    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ received: true });
  }
}
