import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendDoctoAlertThrottled } from "@/lib/alertas";
import { withCron } from "@/lib/cron-guard";
import { esInstitucional } from "@/lib/instancia";
import { decrypt } from "@/lib/mp-crypto";
import { consultarSiteMp, paisDeSite, MP_SITE_ARGENTINA } from "@/lib/mp-site";
import { logWarn } from "@/lib/logger";
import { horaArgentina } from "@/lib/crons-meta";

/**
 * Cron diario (08:00 AR): red de seguridad del país de la cuenta de cobros.
 *
 * Caso real 07/08/2026: un médico tenía conectada una cuenta de Mercado Pago de
 * otro país. Todas sus preferencias salían en la moneda y el checkout de ese
 * país, así que ningún paciente argentino podía pagarle — y nadie se enteraba:
 * ni el médico, ni el paciente, ni el panel. Siguió apareciendo disponible y
 * aceptando consultas incobrables hasta que una paciente esperó 20 minutos
 * intentando pagar.
 *
 * El gate del callback de OAuth ya impide conectar una cuenta extranjera nueva.
 * Esto cubre lo que ese gate no ve: las cuentas conectadas ANTES del gate, y
 * cualquier cambio posterior del lado de Mercado Pago.
 *
 * Reglas:
 * - Marcar SOLO con certeza. `users/me` respondió y el sitio no es MLA → se
 *   guarda el site_id (queda visible en el panel de médicos) y sale la alerta.
 * - Un timeout, un 5xx o un token vencido NO son "cuenta extranjera": caen en
 *   "no pude verificar" y no marcan a nadie.
 * - NO se suspende ni se desconecta a nadie automáticamente. La cuenta queda
 *   igual y la decisión la toma una persona (pedido explícito): un falso
 *   positivo que apague los cobros de un médico sano es peor que el problema.
 */

// Holgado a propósito. Si esta función muere a mitad de camino, withCron nunca
// registra el latido y el watchdog recién lo nota 36 h después — o sea que la
// red de seguridad se apaga en silencio justo el día que Mercado Pago anda mal,
// que es cuando más se la necesita. Con LOTE=10 y 8 s por cuenta, 120 s aguantan
// >130 cuentas en el peor caso (hoy hay ~20). Plan Vercel PRO: el techo es 300.
export const maxDuration = 120;

// Cada cuenta pega una vez a la API de MP; de a 10 en paralelo.
const LOTE = 10;
// Días sin poder verificar una cuenta antes de avisar. Un hipo puntual de la API
// no merece un mail; tres días seguidos sin poder mirar, sí.
const DIAS_SIN_VERIFICAR_PARA_AVISAR = 3;
// Cadencia del 🔴. La fatiga de alertas es el modo de falla que enterró el
// incidente Didit (ver comentario en cron-guard.ts): un mail rojo por día para
// siempre se vuelve parte del paisaje y deja de leerse. Un caso nuevo avisa todos
// los días; uno que ya lleva más de 3 días sin resolverse pasa a semanal.
const HORAS_ALERTA_CASO_NUEVO = 20;
const HORAS_ALERTA_CASO_VIEJO = 24 * 7 - 4;
const DIAS_CASO_NUEVO = 3;

type CuentaMp = {
  medico_id: string;
  mp_user_id: string;
  access_token_encrypted: string;
  site_id?: string | null;
  site_verificado_at?: string | null;
  site_extranjera_desde?: string | null;
};

async function handler() {
  // Modo institucional: no aplica (Capa C) — nadie conecta cuentas de MP.
  if (esInstitucional()) {
    console.log("[verificar-cuentas-mp] modo institucional: no aplica");
    return NextResponse.json({ ok: true, mensaje: "modo institucional: no aplica" });
  }

  const admin = createAdminClient();

  // Las columnas site_id / site_verificado_at pueden no estar migradas todavía y
  // PostgREST falla la query ENTERA si se nombra una columna inexistente. Se
  // intenta con ellas y se cae al select base: el cron avisa igual, solo pierde
  // la parte de "hace cuánto que no la puedo verificar".
  let conColumnasSite = true;
  let filas: CuentaMp[] = [];
  const conSite = await admin
    .from("medicos_mp_accounts")
    .select(
      "medico_id, mp_user_id, access_token_encrypted, site_id, site_verificado_at, site_extranjera_desde"
    )
    .eq("estado", "activo");
  if (conSite.error) {
    conColumnasSite = false;
    const base = await admin
      .from("medicos_mp_accounts")
      .select("medico_id, mp_user_id, access_token_encrypted")
      .eq("estado", "activo");
    if (base.error) {
      return NextResponse.json({ error: base.error.message }, { status: 500 });
    }
    filas = (base.data ?? []) as CuentaMp[];
  } else {
    filas = (conSite.data ?? []) as CuentaMp[];
  }

  if (filas.length === 0) {
    return NextResponse.json({ ok: true, revisadas: 0, extranjeras: [], no_verificables: [] });
  }

  const { data: medicos, error: medicosError } = await admin
    .from("medicos")
    .select("id, nombre_completo, email, es_cuenta_test")
    .in("id", filas.map((c) => c.medico_id));
  // Si esto falla no podemos filtrar cuentas de prueba ni nombrar a nadie:
  // mejor 500 (el watchdog lo ve) que correr a ciegas y mandar mails raros.
  if (medicosError) {
    return NextResponse.json({ error: medicosError.message }, { status: 500 });
  }

  // Fuera las cuentas de prueba, mismo filtro que usa todo el panel admin. Un
  // test user de Mercado Pago puede ser de otro sitio o tener un token sandbox
  // que no contesta: mandar un 🔴 nombrando a un médico que no existe para el
  // negocio es ruido en el mismo canal donde vive el watchdog.
  const nombrePorId = new Map<string, string>();
  for (const m of (medicos ?? []) as {
    id: string;
    nombre_completo: string | null;
    email: string | null;
    es_cuenta_test: boolean | null;
  }[]) {
    if (m.es_cuenta_test) continue;
    nombrePorId.set(m.id, m.nombre_completo || m.email || m.id);
  }

  const cuentas = filas.filter((c) => nombrePorId.has(c.medico_id));
  const omitidasTest = filas.length - cuentas.length;
  if (cuentas.length === 0) {
    return NextResponse.json({
      ok: true,
      revisadas: 0,
      omitidas_test: omitidasTest,
      extranjeras: [],
      no_verificables: [],
    });
  }

  const extranjeras: {
    medicoId: string;
    nombre: string;
    siteId: string;
    pais: string;
    desde: string;
  }[] = [];
  const noVerificables: { medicoId: string; nombre: string; motivo: string; ultimoOk: string | null }[] = [];
  let argentinas = 0;

  const ahoraIso = new Date().toISOString();

  // Deja registrado el país verificado. Best-effort: si la migración todavía no
  // corrió, el update falla y el cron sigue — la alerta es lo que no puede fallar.
  // `site_extranjera_desde` marca desde cuándo conocemos el problema (alimenta la
  // cadencia del mail) y se BORRA en cuanto la cuenta vuelve a ser argentina.
  async function marcarSite(medicoId: string, siteId: string, desde: string | null) {
    const { error } = await admin
      .from("medicos_mp_accounts")
      .update({
        site_id: siteId,
        site_verificado_at: ahoraIso,
        site_extranjera_desde: desde,
      })
      .eq("medico_id", medicoId);
    if (error) {
      logWarn("[CRON/VERIFICAR-MP]", "No se pudo guardar el país de la cuenta", {
        medicoId,
        error: error.message,
      });
    }
  }

  for (let i = 0; i < cuentas.length; i += LOTE) {
    const lote = cuentas.slice(i, i + LOTE);
    await Promise.all(
      lote.map(async (cuenta) => {
        const nombre = nombrePorId.get(cuenta.medico_id) ?? cuenta.medico_id;

        let token: string;
        try {
          token = decrypt(cuenta.access_token_encrypted);
        } catch {
          // No poder desencriptar no dice nada del país: es un problema nuestro.
          noVerificables.push({
            medicoId: cuenta.medico_id,
            nombre,
            motivo: "no se pudo leer el token guardado",
            ultimoOk: cuenta.site_verificado_at ?? null,
          });
          return;
        }

        const chequeo = await consultarSiteMp(token);
        if (chequeo.estado === "argentina") {
          argentinas++;
          await marcarSite(cuenta.medico_id, chequeo.siteId, null);
          return;
        }
        if (chequeo.estado === "extranjera") {
          // Si ya venía marcada, conservamos la fecha original: es la que dice si
          // el caso es nuevo (mail diario) o crónico (mail semanal).
          const desde = cuenta.site_extranjera_desde ?? ahoraIso;
          extranjeras.push({
            medicoId: cuenta.medico_id,
            nombre,
            siteId: chequeo.siteId,
            pais: paisDeSite(chequeo.siteId),
            desde,
          });
          await marcarSite(cuenta.medico_id, chequeo.siteId, desde);
          return;
        }
        noVerificables.push({
          medicoId: cuenta.medico_id,
          nombre,
          motivo: chequeo.motivo,
          ultimoOk: cuenta.site_verificado_at ?? null,
        });
      })
    );
  }

  if (extranjeras.length > 0) {
    // Cadencia: mientras haya un caso NUEVO (detectado hace menos de 3 días) el
    // mail sale todos los días. Si todos los casos ya son viejos, pasa a semanal
    // — el problema sigue visible en el panel y el mail deja de ser paisaje.
    // Sin las columnas migradas no sabemos la antigüedad: se asume nuevo (o sea,
    // exactamente el comportamiento diario de antes).
    const corteNuevo = Date.now() - DIAS_CASO_NUEVO * 24 * 3_600_000;
    const hayCasoNuevo = extranjeras.some((e) => Date.parse(e.desde) > corteNuevo);
    const horasThrottle = hayCasoNuevo ? HORAS_ALERTA_CASO_NUEVO : HORAS_ALERTA_CASO_VIEJO;
    const notaCadencia = hayCasoNuevo
      ? ""
      : "\n\n(Este aviso ya no sale todos los días: mientras siga sin resolverse te llega una vez por semana. Si aparece un caso nuevo, vuelve a ser diario.)";
    const lista = extranjeras
      .map((e) => `● ${e.nombre} — cuenta de ${e.pais} (sitio ${e.siteId})`)
      .join("\n");
    await sendDoctoAlertThrottled(
      "mp-cuenta-extranjera",
      horasThrottle,
      extranjeras.length === 1
        ? "🔴 Un médico tiene la cuenta de cobros de otro país"
        : `🔴 ${extranjeras.length} médicos tienen la cuenta de cobros de otro país`,
      `${lista}\n\nQué significa: la cuenta de Mercado Pago conectada no es argentina, así que los pagos se generan en la moneda y el checkout de ese país. Ningún paciente argentino le puede pagar — el cobro falla siempre, aunque el médico figure disponible y acepte la consulta.\n\n¿Tenés que hacer algo? Sí: escribile y pedile que conecte una cuenta de Mercado Pago de Argentina (Perfil → Mercado Pago → Conectar). Mientras tanto no le entra un peso.\n\nOJO: no le tocamos nada automáticamente — la cuenta sigue conectada igual y el médico sigue habilitado. Si querés bajarlo hasta que lo arregle, es decisión tuya.${notaCadencia}\n\n———\nDetalle técnico (para Claude): cron verificar-cuentas-mp (${horaArgentina()} hs), GET /users/me → site_id ≠ ${MP_SITE_ARGENTINA}. IDs: ${extranjeras.map((e) => e.medicoId).join(", ")}.`
    );
  }

  // "No pude verificar" ≠ "cuenta extranjera". Solo se avisa cuando la ceguera se
  // vuelve crónica: nunca se pudo verificar, o hace más de 3 días que no.
  const corte = Date.now() - DIAS_SIN_VERIFICAR_PARA_AVISAR * 24 * 3_600_000;
  const cronicas = noVerificables.filter(
    (n) => !n.ultimoOk || Date.parse(n.ultimoOk) < corte
  );
  // Sin las columnas migradas no sabemos hace cuánto: avisamos solo si NINGUNA
  // cuenta se pudo verificar (eso ya no es un hipo, es la API o el token caídos).
  const avisarCeguera = conColumnasSite
    ? cronicas.length > 0
    : noVerificables.length > 0 && argentinas === 0 && extranjeras.length === 0;

  if (avisarCeguera) {
    const lista = (conColumnasSite ? cronicas : noVerificables)
      .map((n) => `● ${n.nombre} — ${n.motivo}`)
      .join("\n");
    await sendDoctoAlertThrottled(
      "mp-cuenta-no-verificable",
      20,
      "🟡 No pude chequear de qué país son algunas cuentas de cobro",
      `${lista}\n\nQué significa: Mercado Pago no contestó (o el token guardado no sirve), así que NO sé si esas cuentas son argentinas. No marcamos a nadie: un timeout no es una cuenta extranjera.\n\n¿Tenés que hacer algo? No de inmediato. Si este mail se repite varios días seguidos, decile a Claude: "investigá el cron verificar-cuentas-mp".\n\n———\nDetalle técnico (para Claude): cron verificar-cuentas-mp, GET /users/me sin respuesta útil. Cuentas activas revisadas: ${cuentas.length} · argentinas OK: ${argentinas}.`
    );
  }

  console.log(
    "[cron/verificar-cuentas-mp]",
    JSON.stringify({
      revisadas: cuentas.length,
      omitidas_test: omitidasTest,
      argentinas,
      extranjeras: extranjeras.length,
      no_verificables: noVerificables.length,
      columnas_site: conColumnasSite,
    })
  );

  // `argentinas` es la prueba de vida del mecanismo: si post-deploy da 0 con
  // cuentas activas, GET /users/me no acepta el token OAuth del médico y todo
  // esto es un no-op fail-open (ver "Verificación post-deploy" en el doc).
  return NextResponse.json({
    ok: true,
    revisadas: cuentas.length,
    omitidas_test: omitidasTest,
    argentinas,
    extranjeras: extranjeras.map((e) => ({ medico_id: e.medicoId, site_id: e.siteId })),
    no_verificables: noVerificables.map((n) => ({ medico_id: n.medicoId, motivo: n.motivo })),
  });
}

export const GET = withCron("verificar-cuentas-mp", handler);
