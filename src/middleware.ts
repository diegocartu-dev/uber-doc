import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const BETA_COOKIE = "docto_beta_access";

// Rutas que NUNCA pasan por Beta Guard (webhooks, crons, assets, propia pantalla).
// Los assets de Next y favicon ya están excluidos por el matcher de abajo;
// estos son los que sí caen al middleware pero queremos dejar pasar.
const BETA_BYPASS = [
  "/api/webhooks",
  "/api/mp",
  "/api/cron",
  "/manifest",
  "/icons",
  "/sw.js",
  "/beta-access",
  "/api/beta-login",
];

function passesBetaGuard(request: NextRequest): boolean {
  const password = process.env.BETA_PASSWORD;

  // Sin BETA_PASSWORD seteada → guard desactivado (modo lanzamiento).
  // Cuando se quiera reactivar el guard, agregar la env var en Vercel.
  if (!password) return true;

  const { pathname } = request.nextUrl;

  if (BETA_BYPASS.some((p) => pathname.startsWith(p))) return true;

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
    "/((?!_next/static|_next/image|favicon.ico|auth/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
