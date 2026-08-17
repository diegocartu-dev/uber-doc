// POST /acceso/entrar — el minteo de la sesión del paciente.
//
// Esta es la única pieza del producto donde alguien entra SIN escribir nada.
// Por eso está sola en su propia route y con el orden de pasos explícito:
//
//   0. el POST tiene que venir de NUESTRA landing              — anti login-CSRF
//   1. freno por IP (solo lee)                                 — techo del que barre tokens
//   2. validación del token contra accesos_link (sha256, vigencia, estado del turno)
//   2b. freno del martilleo de ESE enlace                      — trabajo caro detrás de un link público
//   3. minteo JIT de la sesión — patrón impersonate del admin (ver abajo)
//   4. cookies en el response + 303 al destino del acceso
//
// ── POR QUÉ EL TOKEN VIAJA EN EL CUERPO Y NO EN EL PATH ──────────────────────
// Esta route vivía en `/acceso/t/[token]/entrar`. El módulo prometía que el
// token "NUNCA se guarda ni se loguea" y eso era cierto para la DB y para
// nuestros `console.*` — pero NO a nivel plataforma: Vercel registra el path
// completo de cada request en sus logs de acceso, así que la credencial
// quedaba escrita ahí en claro, y cada fallo la devolvía además en el header
// `Location` del redirect. El GET de la landing no tiene alternativa (es un
// link: el token va en la URL sí o sí), pero el minteo sí: el form ya existía,
// así que el token pasa a ser un campo oculto y el path es fijo.
//
// Por lo mismo, un fallo NO redirige de vuelta al token: manda a
// `/acceso/invalido`, que es la misma pantalla para todos los motivos y no
// pone la llave en ningún header.
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
import { esPostDelMismoSitio } from "@/lib/institucional/origen";
import { destinoDemoPaciente, marcarParticipanteEntro } from "@/lib/institucional/demo";
import {
  validarTokenAcceso,
  registrarUsoAcceso,
  permitirIntentoAcceso,
  ipQuemadaPorFallos,
  anotarFalloDeAcceso,
  destinoSeguro,
  hashToken,
  segundosDeVida,
  COOKIE_ACCESO,
} from "@/lib/institucional/accesos";

/**
 * Cualquier final que no sea "entró": una pantalla genérica, sin el token en
 * ningún header. `reintento` distingue "probá de nuevo" (falla nuestra,
 * transitoria) de "este enlace no sirve" (definitivo) — pero ni uno ni otro
 * dicen POR QUÉ ni devuelven la llave.
 */
function aInvalido(origin: string, reintento: boolean) {
  // 303: el navegador tiene que seguir con GET, no repetir el POST.
  return NextResponse.redirect(`${origin}/acceso/invalido${reintento ? "?reintento=1" : ""}`, 303);
}

export async function POST(request: NextRequest) {
  if (!esInstitucional()) {
    return new NextResponse(null, { status: 404 });
  }

  const { origin } = new URL(request.url);

  // 0. Anti login-CSRF: esta route ESCRIBE cookies de sesión sin leer ninguna,
  //    así que SameSite no la protege. Ver src/lib/institucional/origen.ts.
  if (!esPostDelMismoSitio(request)) {
    // Qué mandó el navegador, para poder diagnosticar un rechazo sin adivinar.
    // Son headers de transporte (no PII) y solo se escriben cuando ya se rechazó.
    console.warn(
      "[acceso] POST de minteo rechazado: no salió de nuestra landing" +
        " · origin=" + (request.headers.get("origin") ?? "(ausente)") +
        " · sec-fetch-site=" + (request.headers.get("sec-fetch-site") ?? "(ausente)") +
        " · x-forwarded-host=" + (request.headers.get("x-forwarded-host") ?? "(ausente)") +
        " · host=" + (request.headers.get("host") ?? "(ausente)")
    );
    return new NextResponse(null, { status: 403 });
  }

  let token = "";
  try {
    const form = await request.formData();
    token = String(form.get("t") ?? "");
  } catch (err) {
    console.error("[acceso] Form ilegible en el minteo:", err);
    return aInvalido(origin, true);
  }

  // 1. Freno por IP: el que le pone techo al que BARRE tokens. Solo LEE — un
  //    barrido de tokens inexistentes no puede hacer crecer la tabla por el
  //    simple hecho de preguntar. La IP sale del proxy de Vercel.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "sin-ip";
  if (await ipQuemadaPorFallos(ip)) {
    console.warn("[acceso] Freno por IP: demasiados intentos fallidos");
    return aInvalido(origin, true);
  }

  // 2. Validación. Sin efectos: el token no se consume nunca. Va ANTES del
  //    bucket por enlace para que un token basura no estrene fila.
  const validacion = await validarTokenAcceso(token);
  if (!validacion.ok) {
    // Sin `reintento`: es la MISMA pantalla para los cuatro motivos.
    console.warn("[acceso] Link no válido:", validacion.motivo);
    await anotarFalloDeAcceso(ip);
    return aInvalido(origin, false);
  }
  const acceso = validacion.acceso;

  // 2b. Freno del martilleo de ESTE enlace, ya sabiendo que existe. Recién acá
  //     se escribe un bucket, y a partir de acá empieza el trabajo caro.
  if (!(await permitirIntentoAcceso(ip, hashToken(token)))) {
    console.warn("[acceso] Freno de intentos activado para un link");
    return aInvalido(origin, true);
  }

  // 3. Del sujeto del acceso al usuario de auth. Sin `user_id` no hay a quién
  //    loguear (un alta a medias): se trata como link que no sirve.
  //
  //    Dos sujetos posibles (migración 026): el PACIENTE del padrón, que es el
  //    caso de siempre, y el PROFESIONAL invitado a una demo. El mecanismo es
  //    exactamente el mismo —esa es la gracia de haber extendido la tabla y no
  //    haber inventado una segunda puerta—: cambia de qué fila sale el user_id
  //    y a dónde aterriza.
  const admin = createAdminClient();
  let userId: string | null = null;
  if (acceso.medicoId) {
    const { data: medico } = await admin
      .from("medicos")
      .select("user_id")
      .eq("id", acceso.medicoId)
      .maybeSingle();
    userId = (medico?.user_id as string | null) ?? null;
    if (!userId) {
      console.error("[acceso] Acceso válido apuntando a un profesional sin cuenta auth");
      return aInvalido(origin, true);
    }
  } else {
    const { data: paciente } = await admin
      .from("pacientes")
      .select("user_id")
      .eq("id", acceso.pacienteId!)
      .maybeSingle();
    userId = (paciente?.user_id as string | null) ?? null;
    if (!userId) {
      console.error("[acceso] Acceso válido apuntando a un paciente sin cuenta auth");
      return aInvalido(origin, true);
    }
  }

  const { data: userData, error: errUser } = await admin.auth.admin.getUserById(userId);
  const email = userData?.user?.email;
  if (errUser || !email) {
    console.error("[acceso] No se pudo resolver el usuario del paciente:", errUser?.message);
    return aInvalido(origin, true);
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
    return aInvalido(origin, true);
  }

  // 4. Destino + cookies. El response se arma ANTES del verifyOtp porque es el
  //    contenedor donde el cliente de Supabase escribe las cookies de sesión
  //    (mismo patrón que /auth/confirmar y impersonate-session).
  // El fallback es el del PROPIO encuentro: `/mis-consultas` (el listado del
  // B2C) dejó de existir en la instancia — es una de las pantallas con menú y
  // branding Docto que la Capa A ahora bloquea.
  //
  // El acceso de una DEMO sin encuentro se resuelve acá y no al emitirse: en la
  // reunión el QR se proyecta ANTES de que el call center asigne el turno, así
  // que el destino congelado en la fila apuntaría para siempre a la pantalla de
  // espera. El profesional invitado va a su dashboard, que es su lugar de
  // trabajo de siempre.
  let fallback: string;
  if (acceso.medicoId) {
    fallback = "/dashboard";
  } else if (acceso.esDemo && !acceso.turnoId && !acceso.consultaId) {
    fallback = await destinoDemoPaciente({ pacienteId: acceso.pacienteId!, userId });
  } else if (acceso.turnoId) {
    fallback = `/turno/${acceso.turnoId}/acceso`;
  } else {
    fallback = `/consulta/${acceso.consultaId}/confirmacion`;
  }
  // El `destino` guardado manda salvo en los accesos sin encuentro, donde es
  // justamente lo que no se puede saber de antemano.
  const destino =
    acceso.esDemo && !acceso.turnoId && !acceso.consultaId
      ? fallback
      : destinoSeguro(acceso.destino, fallback);
  const response = NextResponse.redirect(`${origin}${destino}`, 303);

  // Qué acceso originó esta sesión. Sin esta marca, el scoping del token
  // (encuentro + vigencia + estado) se quedaba en la puerta: adentro quedaba
  // la sesión completa del paciente, que sobrevivía a la revocación y al
  // vencimiento del enlace. Las pantallas del paciente la comprueban en cada
  // request (`accesoSigueVivo`). httpOnly: no la lee ni la escribe ningún JS.
  response.cookies.set(COOKIE_ACCESO, acceso.id, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: segundosDeVida(acceso.expiraAt),
  });

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
    return aInvalido(origin, true);
  }

  // Telemetría del link (cuántas veces se usó, última vez). Se espera a
  // propósito: es una sola escritura y el redirect no se nota más lento.
  await registrarUsoAcceso(acceso.id);

  // El semáforo de la pantalla de la reunión: "entró". Best-effort — que esto
  // falle no puede dejar afuera a nadie.
  if (acceso.esDemo) await marcarParticipanteEntro(acceso.id);

  return response;
}
