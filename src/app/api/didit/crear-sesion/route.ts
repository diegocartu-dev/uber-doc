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
// Médico logueado → consentimiento cubierto (registrado ahora o verificado de
// una aceptación previa de la MISMA versión) → crea la sesión Didit → devuelve
// la URL a la que se redirige al médico para verificarse.
//
// Dictamen Carolina 20/07/2026 (docs/legal/2026-07-20-reintento-biometria-sin-reconsentimiento.md):
// el consentimiento del art. 5 Ley 25.326 cubre la FINALIDAD (verificar la
// identidad con Didit), no cada intento — un reintento puede ir directo. La
// condición obligatoria: el servidor VERIFICA la aceptación registrada de la
// versión vigente; NUNCA inserta una fila probatoria por un flag del cliente
// sin checkbox real (antes cada retry fabricaba un "consentimiento expreso"
// que no ocurrió — eso contamina el valor probatorio de toda la tabla).
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

    // ¿Ya hay aceptación registrada de ESTA versión? (admin: lectura interna
    // filtrada por user_id — un bump de CONSENTIMIENTO_VERSION invalida las
    // viejas y fuerza re-consentimiento naturalmente.)
    const admin = createAdminClient();
    const { data: aceptacionPrevia, error: prevErr } = await admin
      .from("aceptaciones_legales")
      .select("id")
      .eq("user_id", user.id)
      .eq("version_id", version.id)
      .limit(1)
      .maybeSingle();
    if (prevErr) {
      console.error("[didit/crear-sesion] no se pudo verificar consentimiento previo:", prevErr.message);
      return NextResponse.json(
        { error: "No se pudo verificar el consentimiento." },
        { status: 500 }
      );
    }

    if (!aceptacionPrevia) {
      // Sin aceptación previa: exigimos el acto real (checkbox) y lo registramos.
      if (body?.consentimiento !== true) {
        return NextResponse.json(
          {
            error: "consentimiento_requerido",
            mensaje: "Falta el consentimiento expreso para la verificación.",
          },
          { status: 400 }
        );
      }
      // Registro probatorio ANTES de crear la sesión.
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
    }
    // Con aceptación previa: la sesión nueva queda amparada en el consentimiento
    // registrado (misma finalidad, mismo proveedor, misma versión del texto).
    // No se inserta fila nueva: solo filas por actos reales del titular.

    // Callback consciente del origen: desde el wizard de onboarding vuelve al
    // paso 6; desde la página dedicada /medico/identidad (gate sin muro, 13/07)
    // vuelve ahí para ver el estado con el polling. Default legacy: dashboard.
    // (Es un redirect de BROWSER — el apex acá es tolerable porque el navegador
    // sigue el 307 a www; el que NUNCA puede ser apex es el webhook.)
    const callbackUrl =
      body?.origin === "registro"
        ? "https://www.docto.com.ar/registro-medico/identidad?identidad=verificada"
        : body?.origin === "onboarding"
          ? "https://docto.com.ar/medico/onboarding?paso=6&identidad=verificada"
          : body?.origin === "identidad"
            ? "https://docto.com.ar/medico/identidad?identidad=verificada"
            : "https://docto.com.ar/dashboard?identidad=verificada";

    // Crear la sesión de verificación en Didit
    const sesion = await crearSesionDidit({
      vendorData: medico.id,
      callbackUrl,
      language: "es",
    });

    // Guardar referencia (admin: campos internos)
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
