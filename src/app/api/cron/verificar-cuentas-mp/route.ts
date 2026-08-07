import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendDoctoAlertThrottled } from "@/lib/alertas";
import { withCron } from "@/lib/cron-guard";
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

export const maxDuration = 60;

// Cada cuenta pega una vez a la API de MP. De a 5 en paralelo entramos holgados
// en los 60 s aún con la API lenta (8 s de timeout por cuenta).
const LOTE = 5;
// Días sin poder verificar una cuenta antes de avisar. Un hipo puntual de la API
// no merece un mail; tres días seguidos sin poder mirar, sí.
const DIAS_SIN_VERIFICAR_PARA_AVISAR = 3;

type CuentaMp = {
  medico_id: string;
  mp_user_id: string;
  access_token_encrypted: string;
  site_id?: string | null;
  site_verificado_at?: string | null;
};

async function handler() {
  const admin = createAdminClient();

  // Las columnas site_id / site_verificado_at pueden no estar migradas todavía y
  // PostgREST falla la query ENTERA si se nombra una columna inexistente. Se
  // intenta con ellas y se cae al select base: el cron avisa igual, solo pierde
  // la parte de "hace cuánto que no la puedo verificar".
  let conColumnasSite = true;
  let filas: CuentaMp[] = [];
  const conSite = await admin
    .from("medicos_mp_accounts")
    .select("medico_id, mp_user_id, access_token_encrypted, site_id, site_verificado_at")
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

  const cuentas = filas;
  if (cuentas.length === 0) {
    return NextResponse.json({ ok: true, revisadas: 0, extranjeras: [], no_verificables: [] });
  }

  const { data: medicos } = await admin
    .from("medicos")
    .select("id, nombre_completo, email")
    .in("id", cuentas.map((c) => c.medico_id));
  const nombrePorId = new Map<string, string>(
    (medicos ?? []).map((m: { id: string; nombre_completo: string | null; email: string | null }) => [
      m.id,
      m.nombre_completo || m.email || m.id,
    ])
  );

  const extranjeras: { medicoId: string; nombre: string; siteId: string; pais: string }[] = [];
  const noVerificables: { medicoId: string; nombre: string; motivo: string; ultimoOk: string | null }[] = [];
  let argentinas = 0;

  const ahoraIso = new Date().toISOString();

  // Deja registrado el país verificado. Best-effort: si la migración todavía no
  // corrió, el update falla y el cron sigue — la alerta es lo que no puede fallar.
  async function marcarSite(medicoId: string, siteId: string) {
    const { error } = await admin
      .from("medicos_mp_accounts")
      .update({ site_id: siteId, site_verificado_at: ahoraIso })
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
          await marcarSite(cuenta.medico_id, chequeo.siteId);
          return;
        }
        if (chequeo.estado === "extranjera") {
          extranjeras.push({
            medicoId: cuenta.medico_id,
            nombre,
            siteId: chequeo.siteId,
            pais: paisDeSite(chequeo.siteId),
          });
          await marcarSite(cuenta.medico_id, chequeo.siteId);
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
    const lista = extranjeras
      .map((e) => `● ${e.nombre} — cuenta de ${e.pais} (sitio ${e.siteId})`)
      .join("\n");
    await sendDoctoAlertThrottled(
      "mp-cuenta-extranjera",
      20,
      extranjeras.length === 1
        ? "🔴 Un médico tiene la cuenta de cobros de otro país"
        : `🔴 ${extranjeras.length} médicos tienen la cuenta de cobros de otro país`,
      `${lista}\n\nQué significa: la cuenta de Mercado Pago conectada no es argentina, así que los pagos se generan en la moneda y el checkout de ese país. Ningún paciente argentino le puede pagar — el cobro falla siempre, aunque el médico figure disponible y acepte la consulta.\n\n¿Tenés que hacer algo? Sí: escribile y pedile que conecte una cuenta de Mercado Pago de Argentina (Perfil → Mercado Pago → Conectar). Mientras tanto no le entra un peso.\n\nOJO: no le tocamos nada automáticamente — la cuenta sigue conectada igual y el médico sigue habilitado. Si querés bajarlo hasta que lo arregle, es decisión tuya.\n\n———\nDetalle técnico (para Claude): cron verificar-cuentas-mp (${horaArgentina()} hs), GET /users/me → site_id ≠ ${MP_SITE_ARGENTINA}. IDs: ${extranjeras.map((e) => e.medicoId).join(", ")}.`
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
      argentinas,
      extranjeras: extranjeras.length,
      no_verificables: noVerificables.length,
      columnas_site: conColumnasSite,
    })
  );

  return NextResponse.json({
    ok: true,
    revisadas: cuentas.length,
    argentinas,
    extranjeras: extranjeras.map((e) => ({ medico_id: e.medicoId, site_id: e.siteId })),
    no_verificables: noVerificables.map((n) => ({ medico_id: n.medicoId, motivo: n.motivo })),
  });
}

export const GET = withCron("verificar-cuentas-mp", handler);
