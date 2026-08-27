import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withCron } from "@/lib/cron-guard";
import { cortarSiInstitucional } from "@/lib/institucional/capa-c";
import { asegurarTokenMp, MARGEN_RENOVACION_MS } from "@/lib/mp-token";
import { sendDoctoAlertThrottled } from "@/lib/alertas";
import { logInfo, logWarn } from "@/lib/logger";

/**
 * Renovación preventiva de los tokens de cobro de Mercado Pago.
 *
 * POR QUÉ: los tokens de MP vencen y hasta ahora NADA los renovaba — el
 * `refresh_token` se guardaba al conectar y no se leía en ningún lado. El
 * vencimiento se descubría dentro del checkout, o sea con el paciente ya
 * pidiendo la consulta y el profesional habiendo aceptado. Ver `@/lib/mp-token`.
 *
 * El checkout ahora se auto-repara, pero eso deja la primera renovación
 * colgando de que justo haya un paciente pagando. Este cron la adelanta: cada
 * 6 horas renueva todo lo que venza dentro de la ventana de margen, así ningún
 * pago se encuentra con un token muerto.
 *
 * Lo que NO hace: desconectar ni suspender a nadie. Si una cuenta no se puede
 * renovar, se avisa y la decisión es de una persona — mismo criterio que el
 * cron de verificación de país (un falso positivo que apague los cobros de un
 * profesional sano es peor que el problema).
 */

export const maxDuration = 120;

const LOTE = 5;

async function handler() {
  const corte = cortarSiInstitucional("renovar-tokens-mp");
  if (corte) return corte;

  const admin = createAdminClient();

  // 'revocado' queda afuera: el refresh no puede resucitar una autorización que
  // el profesional sacó desde Mercado Pago. 'expirado' SÍ entra — es justo el
  // estado que dejaba el checkout viejo y el que hay que intentar recuperar.
  const { data: cuentas, error } = await admin
    .from("medicos_mp_accounts")
    .select("medico_id, expires_at, estado, medicos!inner(disponible, estado_registro, es_cuenta_test)")
    .in("estado", ["activo", "expirado", "error"]);

  if (error) {
    logWarn("[cron/renovar-tokens-mp]", "No se pudieron leer las cuentas", { detalle: error.message });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  type Fila = {
    medico_id: string;
    expires_at: string;
    estado: string;
    medicos: { disponible: boolean; estado_registro: string; es_cuenta_test: boolean } | null;
  };

  const todas = (cuentas ?? []) as unknown as Fila[];
  const reales = todas.filter((c) => c.medicos?.es_cuenta_test !== true);

  // Solo las que vencen dentro del margen (o ya vencieron). El resto no se toca:
  // renovar de más rota el refresh token vigente sin ninguna ganancia.
  const limite = Date.now() + MARGEN_RENOVACION_MS;
  const aRenovar = reales.filter((c) => {
    const t = new Date(c.expires_at).getTime();
    return !Number.isFinite(t) || t <= limite;
  });

  const renovadas: string[] = [];
  const fallidas: Array<{ medicoId: string; motivo: string; publicado: boolean }> = [];

  for (let i = 0; i < aRenovar.length; i += LOTE) {
    await Promise.all(
      aRenovar.slice(i, i + LOTE).map(async (c) => {
        // Margen infinito = forzar el refresh: ya sabemos que entra en ventana.
        const r = await asegurarTokenMp(c.medico_id, Number.POSITIVE_INFINITY);
        if (r.ok) renovadas.push(c.medico_id);
        else
          fallidas.push({
            medicoId: c.medico_id,
            motivo: r.motivo,
            publicado: c.medicos?.disponible === true && c.medicos?.estado_registro === "aprobado",
          });
      })
    );
  }

  // Lo urgente no es que falle una renovación: es que un profesional PUBLICADO
  // no pueda cobrar. Eso es una consulta que se va a caer al apretar Pagar.
  const incobrablesPublicados = fallidas.filter((f) => f.publicado);

  if (incobrablesPublicados.length > 0) {
    await sendDoctoAlertThrottled(
      "cobros-incobrables",
      6,
      `⚠️ ${incobrablesPublicados.length} profesional(es) publicados sin cobros`,
      [
        "Estos profesionales figuran disponibles pero su cuenta de Mercado Pago no se pudo renovar.",
        "Un paciente puede pedirles consulta y el pago va a fallar al final del flujo.",
        "",
        ...incobrablesPublicados.map((f) => `- medico_id ${f.medicoId} — ${f.motivo}`),
        "",
        "Hay que pedirles que reconecten Mercado Pago desde su perfil.",
      ].join("\n")
    );
  }

  logInfo(
    "[cron/renovar-tokens-mp]",
    JSON.stringify({
      cuentas: reales.length,
      en_ventana: aRenovar.length,
      renovadas: renovadas.length,
      fallidas: fallidas.length,
      incobrables_publicados: incobrablesPublicados.length,
    })
  );

  return NextResponse.json({
    ok: true,
    cuentas: reales.length,
    en_ventana: aRenovar.length,
    renovadas: renovadas.length,
    fallidas: fallidas.map((f) => ({ medico_id: f.medicoId, motivo: f.motivo, publicado: f.publicado })),
  });
}

export const GET = withCron("renovar-tokens-mp", handler);
