import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generarOTP } from "@/lib/firma/otp";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: medico } = await supabase
    .from("medicos")
    .select("id, nombre_completo")
    .eq("user_id", user.id)
    .single();

  if (!medico) {
    return NextResponse.json({ error: "No es médico" }, { status: 403 });
  }

  const body = await req.json();
  const { consultaId, turnoId } = body;

  // Scope obligatorio — consistente con /api/2fa/validar
  if (!consultaId && !turnoId) {
    return NextResponse.json(
      { error: "Debe especificar consultaId o turnoId" },
      { status: 400 }
    );
  }

  const result = await generarOTP(medico.id, consultaId, turnoId);

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        cooldown_restante: result.cooldown_restante,
        bloqueado_hasta: result.bloqueado_hasta,
      },
      { status: 429 }
    );
  }

  try {
    await resend.emails.send({
      from: "Docto <no-reply@docto.com.ar>",
      to: user.email!,
      subject: "Código de verificación para firma — Docto",
      html: `
        <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:24px;">
          <h2 style="color:#378ADD;margin:0 0 16px;">Código de verificación</h2>
          <p style="color:#374151;font-size:15px;">
            Tu código para firmar la receta es:
          </p>
          <div style="background:#f3f4f6;border-radius:8px;padding:20px;text-align:center;margin:16px 0;">
            <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#374151;">
              ${result.codigo}
            </span>
          </div>
          <p style="color:#6b7280;font-size:13px;">
            Este código expira en 5 minutos. No lo compartas con nadie.
          </p>
          <p style="color:#9ca3af;font-size:12px;margin-top:24px;">— Docto</p>
        </div>
      `,
    });
  } catch (emailErr) {
    console.error("[2fa] error enviando email OTP:", emailErr instanceof Error ? emailErr.message : "unknown error");
    return NextResponse.json(
      { error: "Error enviando código" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
