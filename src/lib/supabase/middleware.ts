import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { destinoSinSesion } from "@/lib/instancia";
import { origenDispositivo, esRobotDeVistaPrevia } from "@/lib/pagos/origen-dispositivo";

/**
 * Registra que alguien llegó SIN sesión a una sala de espera (06/10/2026): el
 * caso "leyó el WhatsApp de que lo aceptaron y no volvió" podía ser esto —
 * tocar el link en un navegador sin sesión y toparse con el login—, y no
 * quedaba ningún rastro. Con un tope de tiempo corto: nunca demora de verdad
 * la respuesta, y si falla no pasa nada.
 */
async function registrarLlegadaSinSesion(request: NextRequest): Promise<void> {
  const m = request.nextUrl.pathname.match(/^\/sala-espera\/([0-9a-f-]{36})/i);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!m || !url || !key) return;
  const ua = request.headers.get("user-agent") ?? "";
  const origen = origenDispositivo(ua, false);
  try {
    await fetch(`${url}/rest/v1/eventos_funnel`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        evento: "sala_llegada",
        metadata: { consultaId: m[1], sesion: false, robot: esRobotDeVistaPrevia(ua), plataforma: origen.plataforma, navegador: origen.navegador },
      }),
      signal: AbortSignal.timeout(800),
    });
  } catch {
    // Medir nunca puede trabar la entrada.
  }
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect unauthenticated users away from protected routes
  const protectedPrefixes = [
    "/dashboard",
    "/mis-datos",
    "/mis-consultas",
    "/medico/",
    "/consulta",
    "/turno",
    "/clinica",
    "/sala-espera",
    "/documentos",
    "/nova",
    "/triage",
    "/admin",
    "/insights",
  ];

  if (
    !user &&
    protectedPrefixes.some((prefix) => request.nextUrl.pathname.startsWith(prefix))
  ) {
    const url = request.nextUrl.clone();
    // En B2C esto es "/auth/login" y no cambia nada. En la instancia, el
    // paciente no tiene login (su cuenta no tiene contraseña) y el login es un
    // callejón: se lo manda a pedir el enlace de nuevo. Ver `destinoSinSesion`.
    url.pathname = destinoSinSesion(request.nextUrl.pathname);
    // A dónde iba (06/10/2026): antes el login mandaba siempre al inicio y el
    // paciente que tocaba el link de su sala desde un navegador sin sesión,
    // después de entrar, no volvía a la sala.
    if (url.pathname === "/auth/login" && request.nextUrl.pathname !== "/dashboard") {
      url.search = `?volver=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
    }
    await registrarLlegadaSinSesion(request);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
