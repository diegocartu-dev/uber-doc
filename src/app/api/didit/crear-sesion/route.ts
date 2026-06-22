import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { crearSesionDidit } from "@/lib/didit/client";
import {
  CONSENTIMIENTO_TIPO,
  CONSENTIMIENTO_VERSION,
} from "@/lib/didit/consentimiento";

// POST /api/didit/crear-sesion
// Médico logueado → registra el consentimiento expreso → crea la sesión Didit
// → devuelve la URL a la que se redirige al médico para verificarse.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    if (body?.consentimiento !== true) {
      return NextResponse.json(
        { error: "Falta el consentimiento expreso para la verificación." },
        { status: 400 }
      );
    }

    // Médico autenticado
    const { data: medico, error: medErr } = await supabase
      .from("medicos")
      .select("id, nombre_completo, identidad_validada")
      .eq("user_id", user.id)
      .maybeSingle();
    if (medErr || !medico) {
      return NextResponse.json(
        { error: "Perfil médico no encontrado" },
        { status: 404 }
      );
    }

    if (medico.identidad_validada) {
      return NextResponse.json({ yaValidado: true });
    }

    // Versión vigente del consentimiento
    const { data: version } = await supabase
      .from("versiones_textos_legales")
      .select("id")
      .eq("tipo", CONSENTIMIENTO_TIPO)
      .eq("version", CONSENTIMIENTO_VERSION)
      .maybeSingle();
    if (!version) {
      return NextResponse.json(
        { error: "El consentimiento no está configurado todavía." },
        { status: 503 }
      );
    }

    // Registro probatorio del consentimiento ANTES de crear la sesión.
    // RLS exige user_id = auth.uid() → usamos el cliente autenticado.
    const hdrs = await headers();
    const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const ua = hdrs.get("user-agent") ?? null;
    const { error: aceptErr } = await supabase.from("aceptaciones_legales").insert({
      user_id: user.id,
      version_id: version.id,
      tipo: CONSENTIMIENTO_TIPO,
      ip_address: ip,
      user_agent: ua,
    });
    if (aceptErr) {
      console.error("[didit/crear-sesion] no se pudo registrar consentimiento:", aceptErr.message);
      return NextResponse.json(
        { error: "No se pudo registrar el consentimiento." },
        { status: 500 }
      );
    }

    // Callback consciente del origen: desde el wizard de onboarding, el médico
    // vuelve al paso 6 del caminito (no al dashboard) para ver el estado y cerrar.
    // Desde la PantallaIdentidad del dashboard (sin origin), vuelve al dashboard.
    const callbackUrl =
      body?.origin === "onboarding"
        ? "https://docto.com.ar/medico/onboarding?paso=6&identidad=verificada"
        : "https://docto.com.ar/dashboard?identidad=verificada";

    // Crear la sesión de verificación en Didit
    const sesion = await crearSesionDidit({
      vendorData: medico.id,
      callbackUrl,
      language: "es",
    });

    // Guardar referencia (admin: campos internos)
    const admin = createAdminClient();
    await admin
      .from("medicos")
      .update({
        didit_session_id: sesion.session_id,
        didit_status: sesion.status,
      })
      .eq("id", medico.id);

    return NextResponse.json({ url: sesion.url, sessionId: sesion.session_id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error interno";
    console.error("[didit/crear-sesion]", msg);
    return NextResponse.json(
      { error: "No se pudo iniciar la verificación de identidad." },
      { status: 500 }
    );
  }
}
