// POST /acceso/t/[token]/entrar — el minteo de la sesión del paciente.
//
// Esta es la única pieza del producto donde alguien entra SIN escribir nada.
// Por eso está sola en su propia route y con el orden de pasos explícito:
//
//   1. freno de intentos por (IP + token)     — trabajo caro detrás de un link público
//   2. validación del token contra accesos_link (sha256, vigencia, estado del turno)
//   3. minteo JIT de la sesión — patrón impersonate del admin (ver abajo)
//   4. cookies en el response + 303 al destino del acceso
//
// ── POR QUÉ EL PATRÓN IMPERSONATE Y NO OTRA COSA (decisión, spec §5.2) ───────
// El repo YA tiene este camino probado en producción: `/api/admin/impersonate`
// genera un magic link solo para quedarse con `properties.email_otp` (el mail
// nunca se envía) y `/api/admin/impersonate-session` lo canjea con `verifyOtp`
// server-side, escribiendo las cookies en el response. No hay en el repo un
// "impersonate" directo más allá de ese par, así que se replica ESE flujo —
// pero en UN SOLO request, porque acá los dos pasos ocurren del mismo lado:
// el par de rutas del admin existe partido en dos solo para poder mandarle un
// link al navegador del admin, y el código HMAC intermedio (`?code=`) es el
// sobre para ese viaje. Acá no hay viaje: no hace falta el sobre, y no tenerlo
// es una superficie menos (nada firmado con la service key viajando por URL).
//
// Lo que se conserva del patrón, que es lo que importa: `generateLink` +
// `verifyOtp` server-side, cero PKCE y cero dependencia de cookies previas —
// por eso funciona dentro del webview de WhatsApp, que es donde va a vivir.
//
// El paciente entra como un usuario REAL de `auth.users` (el que creó el alta
// provisionada): nada de sesiones invitadas. Es requisito duro del canal
// clínico — `/api/livekit/token` exige `auth.getUser()` + match con
// `pacientes.user_id`.

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase/admin";
import { esInstitucional } from "@/lib/instancia";
import {
  validarTokenAcceso,
  registrarUsoAcceso,
  permitirIntentoAcceso,
  destinoSeguro,
  hashToken,
} from "@/lib/institucional/accesos";

/** Vuelta al intersticial. Con `reintento` cuando hay que decirle "probá de nuevo". */
function volverALanding(origin: string, token: string, reintento: boolean) {
  const url = `${origin}/acceso/t/${encodeURIComponent(token)}${reintento ? "?reintento=1" : ""}`;
  // 303: el navegador tiene que seguir con GET, no repetir el POST.
  return NextResponse.redirect(url, 303);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  if (!esInstitucional()) {
    return new NextResponse(null, { status: 404 });
  }

  const { token } = await params;
  const { origin } = new URL(request.url);

  // 1. Freno de intentos. La IP sale del proxy de Vercel; sin ella, el freno
  //    queda por token solo (peor, pero nunca deja a nadie afuera).
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "sin-ip";
  if (!(await permitirIntentoAcceso(ip, hashToken(token)))) {
    console.warn("[acceso] Freno de intentos activado para un link");
    return volverALanding(origin, token, true);
  }

  // 2. Validación. Sin efectos: el token no se consume nunca.
  const validacion = await validarTokenAcceso(token);
  if (!validacion.ok) {
    // Sin `reintento`: la landing va a mostrar el estado F por su cuenta, que
    // es la MISMA pantalla para los cuatro motivos.
    console.warn("[acceso] Link no válido:", validacion.motivo);
    return volverALanding(origin, token, false);
  }
  const acceso = validacion.acceso;

  // 3. Del paciente del padrón al usuario de auth. Sin `user_id` no hay a quién
  //    loguear (un alta a medias): se trata como link que no sirve.
  const admin = createAdminClient();
  const { data: paciente } = await admin
    .from("pacientes")
    .select("user_id")
    .eq("id", acceso.pacienteId)
    .maybeSingle();
  if (!paciente?.user_id) {
    console.error("[acceso] Acceso válido apuntando a un paciente sin cuenta auth");
    return volverALanding(origin, token, true);
  }

  const { data: userData, error: errUser } = await admin.auth.admin.getUserById(paciente.user_id);
  const email = userData?.user?.email;
  if (errUser || !email) {
    console.error("[acceso] No se pudo resolver el usuario del paciente:", errUser?.message);
    return volverALanding(origin, token, true);
  }

  // Magic link SOLO para quedarse con el OTP: el mail no se envía (y en el
  // padrón sin mail real, la casilla es un alias no entregable a propósito).
  const { data: linkData, error: errLink } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const otp = linkData?.properties?.email_otp;
  if (errLink || !otp) {
    console.error("[acceso] No se pudo generar el acceso:", errLink?.message);
    return volverALanding(origin, token, true);
  }

  // 4. Destino + cookies. El response se arma ANTES del verifyOtp porque es el
  //    contenedor donde el cliente de Supabase escribe las cookies de sesión
  //    (mismo patrón que /auth/confirmar y impersonate-session).
  const destino = destinoSeguro(
    acceso.destino,
    acceso.turnoId ? `/turno/${acceso.turnoId}/acceso` : "/mis-consultas"
  );
  const response = NextResponse.redirect(`${origin}${destino}`, 303);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { error: errOtp } = await supabase.auth.verifyOtp({
    email,
    token: otp,
    type: "magiclink",
  });
  if (errOtp) {
    console.error("[acceso] verifyOtp falló:", errOtp.message);
    return volverALanding(origin, token, true);
  }

  // Telemetría del link (cuántas veces se usó, última vez). Se espera a
  // propósito: es una sola escritura y el redirect no se nota más lento.
  await registrarUsoAcceso(acceso.id);

  return response;
}
