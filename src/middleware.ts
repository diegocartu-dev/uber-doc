import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const BETA_COOKIE = "docto_beta_access";

// Rutas EXACTAS de creación de cuenta que el guard protege.
// Todo lo demás queda público (home, login, dashboards privados con su propia
// auth, /api/webhooks, crons, etc).
const BETA_PROTECTED = [
  "/auth/register",         // registro paciente
  "/auth/registro-medico",  // registro médico
];

function isBetaProtected(pathname: string): boolean {
  return BETA_PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

function passesBetaGuard(request: NextRequest): boolean {
  const password = process.env.BETA_PASSWORD;

  // Sin BETA_PASSWORD seteada → guard desactivado (modo lanzamiento).
  if (!password) return true;

  // Solo intercepta rutas de creación de cuenta. El resto pasa libre.
  if (!isBetaProtected(request.nextUrl.pathname)) return true;

  const cookie = request.cookies.get(BETA_COOKIE);
  return cookie?.value === password;
}

export async function middleware(request: NextRequest) {
  // 1. Beta Guard — si no pasa, redirigir a /beta-access antes de cualquier cosa
  if (!passesBetaGuard(request)) {
    const url = request.nextUrl.clone();
    url.pathname = "/beta-access";
    url.searchParams.set("from", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // 2. Refresh de sesión Supabase
  const response = await updateSession(request);

  // 3. Header noindex para /dr/* (consultorio privado)
  if (request.nextUrl.pathname.startsWith("/dr/")) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return response;
}

export const config = {
  matcher: [
    // auth/callback excluido para no interferir con PKCE flow de Supabase.
    // auth/register y auth/registro-medico DEBEN pasar por el middleware
    // para que el beta guard los intercepte.
    "/((?!_next/static|_next/image|favicon.ico|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
