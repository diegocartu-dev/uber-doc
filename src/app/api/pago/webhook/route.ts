import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, data } = body;

    // Solo procesar eventos de pago relevantes
    if (action !== "payment.created" && action !== "payment.updated") {
      return NextResponse.json({ received: true });
    }

    if (!data?.id) {
      return NextResponse.json({ received: true });
    }

    // Verificar estado del pago con Mercado Pago
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

      // Solo transicionar de "aceptada" a "pagada" — evitar reprocessing
      await supabaseAdmin
        .from("consultas")
        .update({ estado: "pagada" })
        .eq("id", consultaId)
        .eq("estado", "aceptada");
    }

    return NextResponse.json({ received: true });
  } catch {
    // Siempre responder 200 para que MP no reintente indefinidamente
    return NextResponse.json({ received: true });
  }
}
