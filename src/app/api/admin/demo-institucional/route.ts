// GET /api/admin/demo-institucional — SOLO Docto B2C (nunca en la instancia).
//
// El extremo de Docto del puente: comprueba que quien lo pide es admin de Docto
// —con la sesión que ya tiene, la de siempre— y lo manda adentro de la instancia
// institucional sin pedirle una segunda contraseña.
//
// Es una navegación, no una API para consumir: se llega tocando un botón en
// `/admin` y se sale con un 302 al pasaje. Por eso responde con redirects y no
// con JSON, incluso cuando falla: quien está del otro lado es una persona
// mirando una pantalla, no un programa.
//
// El secreto compartido vive SOLO en el servidor de Docto y viaja en un header
// hacia la instancia. Nunca llega al navegador, ni siquiera de rebote: lo que
// vuelve al navegador es la URL de un solo uso que fabricó la instancia.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin-auth";
import { esInstitucional } from "@/lib/instancia";
import { HEADER_PUENTE } from "@/lib/institucional/puente-superadmin";

export const dynamic = "force-dynamic";

/** A dónde vuelve el admin cuando algo no se puede. `motivo` lo pinta la pantalla. */
function volverAlAdmin(origin: string, motivo: string) {
  return NextResponse.redirect(`${origin}/admin?puente=${motivo}`);
}

export async function GET(request: NextRequest) {
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const origin = `${proto}://${host}`;

  // En la instancia esta ruta no tiene sentido: el puente va de Docto HACIA la
  // instancia, nunca al revés.
  if (esInstitucional()) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isAdmin(user.id))) {
    // Mismo destino que el layout de `/admin`: no se le confirma a un no-admin
    // que esta ruta existe.
    return NextResponse.redirect(`${origin}/dashboard`);
  }

  const instancia = (process.env.INSTANCIA_INSTITUCIONAL_URL ?? "").replace(/\/+$/, "");
  const secreto = process.env.PUENTE_SUPERADMIN_SECRET ?? "";
  if (!instancia || secreto.length < 32) {
    console.error("[puente] falta INSTANCIA_INSTITUCIONAL_URL o PUENTE_SUPERADMIN_SECRET");
    return volverAlAdmin(origin, "sin-configurar");
  }

  let url: string | undefined;
  try {
    const r = await fetch(`${instancia}/api/institucional/puente-superadmin`, {
      method: "POST",
      headers: { [HEADER_PUENTE]: secreto },
      cache: "no-store",
      // La instancia puede estar levantando (o caída). Sin tope, el admin de
      // Docto se queda con la pantalla colgada esperando a otro sistema.
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) {
      console.error("[puente] la instancia rechazó el pedido:", r.status);
      return volverAlAdmin(origin, r.status === 404 ? "sin-configurar" : "instancia-no-responde");
    }
    url = ((await r.json()) as { url?: string }).url;
  } catch (err) {
    console.error("[puente] la instancia no respondió:", (err as Error).message);
    return volverAlAdmin(origin, "instancia-no-responde");
  }

  // El pasaje tiene que apuntar a la instancia y a ningún otro lado: si esta
  // respuesta viniera manipulada, esto es lo único que impide usar el botón del
  // admin de Docto como redirector abierto hacia cualquier sitio.
  if (!url || !url.startsWith(`${instancia}/`)) {
    console.error("[puente] la instancia devolvió una URL fuera de su propio dominio");
    return volverAlAdmin(origin, "instancia-no-responde");
  }

  return NextResponse.redirect(url);
}
