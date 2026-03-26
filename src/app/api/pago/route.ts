import { NextRequest, NextResponse } from "next/server";
import { MercadoPagoConfig, Preference } from "mercadopago";
import { createClient } from "@/lib/supabase/server";

const mp = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN!,
});

export async function POST(req: NextRequest) {
  if (!process.env.MP_ACCESS_TOKEN) {
    console.error("[MP] MP_ACCESS_TOKEN no configurado en .env.local");
    return NextResponse.json(
      { error: "Mercado Pago no está configurado en el servidor." },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { consultaId } = await req.json();

  if (!consultaId) {
    return NextResponse.json(
      { error: "Falta consultaId." },
      { status: 400 }
    );
  }

  // Verificar que la consulta pertenece al paciente y está aceptada
  const { data: consulta } = await supabase
    .from("consultas")
    .select("id, especialidad, estado, medico_id")
    .eq("id", consultaId)
    .eq("paciente_id", user.id)
    .single();

  if (!consulta) {
    return NextResponse.json(
      { error: "Consulta no encontrada." },
      { status: 404 }
    );
  }

  if (consulta.estado !== "aceptada") {
    return NextResponse.json(
      { error: "La consulta aún no fue aceptada por el médico." },
      { status: 400 }
    );
  }

  // Traer datos del médico
  const { data: medico } = await supabase
    .from("medicos")
    .select("nombre_completo, precio_consulta, duracion_consulta")
    .eq("id", consulta.medico_id)
    .single();

  if (!medico) {
    return NextResponse.json(
      { error: "Médico no encontrado." },
      { status: 404 }
    );
  }

  const baseUrl = req.nextUrl.origin;

  try {
    const preference = new Preference(mp);
    const result = await preference.create({
      body: {
        items: [
          {
            id: consultaId,
            title: `Consulta de ${consulta.especialidad} — Dr. ${medico.nombre_completo}`,
            description: `Consulta virtual de ${medico.duracion_consulta} minutos`,
            quantity: 1,
            unit_price: medico.precio_consulta,
            currency_id: "ARS",
          },
        ],
        back_urls: {
          success: `${baseUrl}/consulta/${consultaId}/confirmacion`,
          failure: `${baseUrl}/sala-espera/${consultaId}?pago=error`,
          pending: `${baseUrl}/sala-espera/${consultaId}?pago=pendiente`,
        },
        external_reference: consultaId,
        metadata: {
          consulta_id: consultaId,
          paciente_id: user.id,
        },
      },
    });

    if (!result.init_point) {
      console.error("[MP] Respuesta sin init_point:", JSON.stringify(result));
      return NextResponse.json(
        { error: "Mercado Pago no devolvió URL de pago." },
        { status: 502 }
      );
    }

    return NextResponse.json({ init_point: result.init_point });
  } catch (err: unknown) {
    let message: string;
    if (err instanceof Error) {
      message = err.message;
    } else if (typeof err === "object" && err !== null) {
      message = JSON.stringify(err);
    } else {
      message = String(err);
    }
    console.error("[MP] Error al crear preferencia:", message);
    return NextResponse.json(
      { error: `Error de Mercado Pago: ${message}` },
      { status: 502 }
    );
  }
}
