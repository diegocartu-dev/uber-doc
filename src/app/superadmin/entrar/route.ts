// GET /superadmin/entrar?th=… — SOLO instancia institucional.
//
// La otra punta del puente: canjea el pasaje de un solo uso por una sesión y
// deja al superadmin adentro de `/admin/demo`.
//
// ── POR QUÉ ACÁ Y NO EN /auth/callback ───────────────────────────────────────
// `/auth/callback` lee `?code=`, que es el flujo PKCE del cliente del navegador.
// Un enlace generado desde el panel de administración NO trae `code`: trae el
// token en el FRAGMENTO (`#access_token=…`), que no llega al servidor. Por eso
// esos enlaces rebotaban al login con cara de "el link no anda" — el servidor
// veía la petición vacía y hacía lo correcto para el caso equivocado.
//
// Acá el token nunca pasa por el fragmento: llega como `th` (el `hashed_token`
// que devolvió `generateLink`), se canjea server-side con `verifyOtp`, y lo
// único que vuelve al navegador es la cookie de sesión. Un `hashed_token` no es
// una sesión: es el derecho a pedir una, de un solo uso y de vida corta.

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { DESTINO_PUENTE } from "@/lib/institucional/puente-superadmin";
import { esInstitucional } from "@/lib/instancia";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const origin = `${proto}://${host}`;

  if (!esInstitucional()) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const th = request.nextUrl.searchParams.get("th");
  // Sin pasaje (o con uno vacío) se manda al login normal, no a un error: el
  // caso típico es un botón atrás o un enlace que ya se usó, y el login es el
  // lugar del que igual va a salir.
  if (!th) return NextResponse.redirect(`${origin}/auth/login`);

  const response = NextResponse.redirect(`${origin}${DESTINO_PUENTE}`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          const cookieHeader = request.headers.get("cookie") ?? "";
          if (!cookieHeader) return [];
          return cookieHeader.split("; ").map((c) => {
            const [name, ...rest] = c.split("=");
            return { name, value: rest.join("=") };
          });
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { error } = await supabase.auth.verifyOtp({ token_hash: th, type: "magiclink" });
  if (error) {
    // Pasaje vencido o ya usado. No se filtra el motivo: desde afuera, un
    // pasaje inválido y uno inexistente tienen que verse igual.
    console.warn("[puente] pasaje rechazado al canjearlo:", error.message);
    return NextResponse.redirect(`${origin}/auth/login`);
  }

  return response;
}
