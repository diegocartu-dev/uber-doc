import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esInstitucional } from "@/lib/instancia";
import { logWarn } from "@/lib/logger";
import {
  BUCKET_CAPACITACION,
  SEGUNDOS_LINK_FIRMADO,
  puedeVerCapacitacion,
  videoPorId,
} from "@/lib/capacitacion";

// ─── La puerta de los videos de capacitación ─────────────────────────────────
//
// El reproductor de "Configurá cómo atendés" NO tiene la dirección del video:
// pide esta ruta. Acá se vuelve a comprobar todo desde cero —sesión, ficha de
// profesional, cuenta aprobada— y recién entonces se redirige a una dirección
// firmada del bucket privado.
//
// POR QUÉ EL GATE SE REPITE ACÁ Y NO ALCANZA CON LA PANTALLA: esconder el
// bloque en la página esconde el botón, no el archivo. Si la firma se emitiera
// sin mirar, cualquiera con sesión —un paciente, un profesional pendiente—
// llegaría al video tipeando esta URL.
//
// Todo corte es CERRADO: si una lectura de la base falla, no hay prueba de que
// la cuenta esté aprobada, y un video privado no se entrega "por las dudas".
//
// Detalle completo y límites honestos: src/lib/capacitacion.ts.

export const dynamic = "force-dynamic";

const SIN_CACHE = { "Cache-Control": "private, no-store" };

export async function GET(_req: NextRequest, { params }: { params: Promise<{ video: string }> }) {
  // Los videos explican el flujo del B2C (Mercado Pago, clínica virtual). En una
  // instancia institucional no aplican, y además el bucket no existe ahí.
  if (esInstitucional()) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: SIN_CACHE });
  }

  const { video: id } = await params;
  const video = videoPorId(id);
  if (!video) {
    return NextResponse.json({ error: "Video inexistente" }, { status: 404, headers: SIN_CACHE });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401, headers: SIN_CACHE });
  }

  // Service role filtrando por user_id: la fila propia, sin depender de los
  // grants de columna de `medicos` (ver CLAUDE.md, outage del 24/06).
  const admin = createAdminClient();
  const { data: medico, error } = await admin
    .from("medicos")
    .select("verificado, estado_registro, dado_de_baja")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    logWarn("[capacitacion]", "No se pudo leer la ficha para el gate", { video: id });
    return NextResponse.json({ error: "No se pudo verificar la cuenta" }, { status: 502, headers: SIN_CACHE });
  }
  if (!puedeVerCapacitacion(medico)) {
    return NextResponse.json({ error: "No disponible para esta cuenta" }, { status: 403, headers: SIN_CACHE });
  }

  const { data: firmado, error: errFirma } = await admin.storage
    .from(BUCKET_CAPACITACION)
    .createSignedUrl(video.archivo, SEGUNDOS_LINK_FIRMADO);

  if (errFirma || !firmado?.signedUrl) {
    logWarn("[capacitacion]", "No se pudo firmar el video", { video: id });
    return NextResponse.json({ error: "No se pudo abrir el video" }, { status: 502, headers: SIN_CACHE });
  }

  // 302 y sin caché: si el navegador reintenta la carga, vuelve a pasar por
  // acá y recibe una firma nueva en vez de reusar una vieja.
  return NextResponse.redirect(firmado.signedUrl, { status: 302, headers: SIN_CACHE });
}
