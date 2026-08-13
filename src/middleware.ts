import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { updateSession } from "@/lib/supabase/middleware";
import { esInstitucional } from "@/lib/instancia";

const BETA_COOKIE = "docto_beta_access";
const ACTIVITY_COOKIE = "docto_last_activity";
const INACTIVITY_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 horas — Anexo I

// Solo rutas con sesión activa en curso (video, sala de espera)
const TIMEOUT_EXEMPT_SUFFIXES = [
  "/sala",          // /consulta/[id]/sala — video paciente CI
  "/video",         // /turno/[id]/video — video turno
  "/espera",        // /turno/[id]/espera — sala de espera turno
  "/workspace",     // /medico/consulta/[id]/workspace — video médico
];

const TIMEOUT_EXEMPT_PREFIXES = [
  "/medico/consulta/", // workspace médico completo
  "/sala-espera",
  "/auth/",
  "/api/",
  "/beta-access",
  "/verificar",        // verificación pública de documentos — sin auth.
                       // SIN barra final: cubre también `/verificar` a secas
                       // (el buscador por id), que si no quedaba sujeto al
                       // timeout de inactividad y podía desloguear al que solo
                       // viene a comprobar un papel.
  "/ayuda",            // pedir ayuda NUNCA puede mandarte al login: el que tiene
                       // la sesión vencida es justo el que más la necesita, y en
                       // /auth/login no hay ningún acceso a Ayuda.
  "/acceso",           // link de acceso del paciente institucional (viaja por
                       // WhatsApp/mail): es la puerta de entrada de alguien SIN
                       // sesión — jamás puede rebotar al login por inactividad.
                       // Desde la Etapa 3 el prefijo además está EXCLUIDO del
                       // matcher (ver abajo), así que esta línea ya no se
                       // evalúa; se deja porque el día que /acceso vuelva al
                       // matcher, la exención por inactividad tiene que seguir.
];

// Rutas EXACTAS de creación de cuenta que el guard protege.
// LANZAMIENTO 10/06/2026 (decisión Diego — abrir al mundo): registro ABIERTO.
// Array vacío = ninguna ruta pide la contraseña beta → registro público libre.
// IMPORTANTE: `BETA_PASSWORD` debe seguir SETEADA en prod (passesBetaGuard es
// fail-closed: vacía = sitio caído). Para re-cerrar la beta, volver a agregar
// "/auth/register" y "/auth/registro-medico" acá (reversible en 1 deploy).
const BETA_PROTECTED: string[] = [];

// ── Modo institucional — Capa A (la puerta) ──────────────────────────────────
// Rutas del B2C que NO existen en una instancia institucional: registro
// abierto (el alta es provisionada), marketplace/clínica pública, triage,
// arrepentimiento (no hay consumo pagado) e insights (mide plata de MP; el
// panel institucional es otro). Patrón calcado de BETA_PROTECTED/passesBetaGuard.
// REGLA DE ORO: en B2C (INSTITUCIONAL sin setear o ≠ "true") este bloque no
// evalúa nada — el gate por env corta primero.
const INSTITUCIONAL_BLOCKED = [
  "/auth/register",
  "/auth/registro-medico",
  "/clinica",
  "/dr",
  "/medicos",
  "/triage",
  "/arrepentimiento",
  "/insights",
];

function institucionalBloquea(pathname: string): boolean {
  return INSTITUCIONAL_BLOCKED.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

function isBetaProtected(pathname: string): boolean {
  return BETA_PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

function passesBetaGuard(request: NextRequest): boolean {
  const password = process.env.BETA_PASSWORD;

  // Sin BETA_PASSWORD seteada → BLOQUEAR (fail-closed).
  if (!password) return false;

  // Solo intercepta rutas de creación de cuenta. El resto pasa libre.
  if (!isBetaProtected(request.nextUrl.pathname)) return true;

  const cookie = request.cookies.get(BETA_COOKIE);
  return cookie?.value === password;
}

function isTimeoutExempt(pathname: string): boolean {
  if (TIMEOUT_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  const segments = pathname.split("/");
  const lastSegment = "/" + (segments[segments.length - 1] || "");
  return TIMEOUT_EXEMPT_SUFFIXES.some((s) => lastSegment === s);
}

export async function middleware(request: NextRequest) {
  // 0. Modo institucional (Capa A): estas rutas no existen en la instancia.
  //    El gate por env va PRIMERO: con el flag apagado, el hot path del B2C
  //    no evalúa ni una línea de este bloque.
  if (esInstitucional() && institucionalBloquea(request.nextUrl.pathname)) {
    return new NextResponse(null, { status: 404 });
  }

  // 1. Beta Guard
  if (!passesBetaGuard(request)) {
    const url = request.nextUrl.clone();
    url.pathname = "/beta-access";
    url.searchParams.set("from", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // 2. Inactivity timeout — cookie HttpOnly seteada por este middleware
  const pathname = request.nextUrl.pathname;
  const exempt = isTimeoutExempt(pathname);

  if (!exempt) {
    const lastActivity = request.cookies.get(ACTIVITY_COOKIE)?.value;
    const now = Date.now();

    if (lastActivity) {
      const elapsed = now - Number(lastActivity);
      if (elapsed > INACTIVITY_TIMEOUT_MS) {
        // Invalidar sesión Supabase server-side
        const supabase = createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            cookies: {
              getAll() { return request.cookies.getAll(); },
              setAll() { /* no-op for signOut */ },
            },
          }
        );
        await supabase.auth.signOut();

        const url = request.nextUrl.clone();
        url.pathname = "/auth/login";
        url.searchParams.set("reason", "inactivity");
        const response = NextResponse.redirect(url);
        response.cookies.delete(ACTIVITY_COOKIE);
        // Borrar cookies de sesión Supabase del browser
        for (const cookie of request.cookies.getAll()) {
          if (cookie.name.startsWith("sb-")) {
            response.cookies.delete(cookie.name);
          }
        }
        return response;
      }
    }
    // No hay cookie → si hay sesión Supabase, tratar como primera actividad.
    // Si no hay sesión, updateSession se encarga del redirect a login.
  }

  // 3. Refresh de sesión Supabase
  const response = await updateSession(request);

  // 4. Stamp de actividad — cookie HttpOnly, no manipulable por JS
  if (!exempt) {
    response.cookies.set(ACTIVITY_COOKIE, String(Date.now()), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24, // 24h
    });
  }

  // 5. Header noindex para rutas privadas/públicas que no deben indexarse
  if (pathname.startsWith("/dr/") || pathname.startsWith("/verificar")) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return response;
}

export const config = {
  matcher: [
    // auth/confirmar excluido igual que auth/callback: ambos setean cookies de
    // sesión en el route handler y el updateSession del middleware podría
    // pisarlas con un refresh concurrente (visto en commits 787c163/0d04628).
    //
    // REGLA: toda ruta que CREE sesión entra acá. `acceso` es la tercera —
    // /acceso/t/[token]/entrar mintea la sesión del paciente institucional
    // (link por WhatsApp) y escribe sus cookies en el response.
    // Efecto colateral buscado: el intersticial (el GET) tampoco pasa por
    // updateSession, así que el bot de preview de WhatsApp no dispara ningún
    // refresh de sesión sobre un visitante que todavía no es nadie.
    // En B2C /acceso no existe (la page es 404 por modo): sin cambio.
    "/((?!_next/static|_next/image|favicon.ico|auth/callback|auth/confirmar|acceso|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
