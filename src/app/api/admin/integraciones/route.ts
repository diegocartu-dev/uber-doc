import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin-auth";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !(await isAdmin(user.id))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const integraciones = [
    {
      nombre: "Supabase",
      icon: "Database",
      estado: process.env.NEXT_PUBLIC_SUPABASE_URL ? "ok" : "error",
      detalle: "Base de datos + Auth + Storage",
    },
    {
      nombre: "Daily.co",
      icon: "Video",
      estado: process.env.DAILY_API_KEY ? "ok" : "no_configurado",
      detalle: process.env.DAILY_API_KEY
        ? "Videollamadas activas"
        : "DAILY_API_KEY no configurada",
    },
    {
      nombre: "Mercado Pago",
      icon: "CreditCard",
      estado: process.env.MP_ACCESS_TOKEN ? "ok" : "no_configurado",
      detalle: process.env.MP_ACCESS_TOKEN
        ? "Procesamiento de pagos activo"
        : "MP_ACCESS_TOKEN no configurada",
    },
    {
      nombre: "Resend",
      icon: "Mail",
      estado:
        process.env.RESEND_API_KEY &&
        !process.env.RESEND_API_KEY.includes("placeholder")
          ? "ok"
          : "warning",
      detalle:
        process.env.RESEND_API_KEY &&
        !process.env.RESEND_API_KEY.includes("placeholder")
          ? "Email transaccional activo"
          : "RESEND_API_KEY placeholder — emails no se envian",
    },
    {
      nombre: "Anthropic (Nova)",
      icon: "Brain",
      estado: process.env.ANTHROPIC_API_KEY ? "ok" : "no_configurado",
      detalle: process.env.ANTHROPIC_API_KEY
        ? "Asistente IA activo"
        : "ANTHROPIC_API_KEY no configurada",
    },
    {
      nombre: "Web Push",
      icon: "Bell",
      estado: process.env.VAPID_PRIVATE_KEY ? "ok" : "warning",
      detalle: process.env.VAPID_PRIVATE_KEY
        ? "Push notifications activas"
        : "VAPID keys no configuradas",
    },
  ];

  return NextResponse.json({ integraciones });
}
