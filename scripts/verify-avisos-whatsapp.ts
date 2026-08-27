/**
 * ¿Le avisamos al profesional? ¿Le llegó? ¿Lo leyó? ¿En qué minuto?
 *
 * POR QUÉ EXISTE (27/08/2026):
 *   Un pedido de consulta inmediata se cancela solo a los 10 minutos si nadie lo
 *   acepta (`PLAZO_SIN_ACEPTAR_MIN`). Ese plazo solo es justo si el aviso llegó
 *   —y se leyó— bien adentro de la ventana. Hasta hoy nadie podía decir si eso
 *   pasaba: `whatsapp_envios` guarda cada intento desde el 21/08 y NINGÚN código
 *   del repo la lee. El registro existe y nunca se miró.
 *
 * EL PUNTO CIEGO QUE ESTO DESTAPA:
 *   `resultado = 'enviado'` significa "Twilio aceptó la llamada a su API". Nada
 *   más. No dice que le llegó al celular del profesional, ni que lo leyó. El
 *   envío no pide `StatusCallback` y no hay webhook de Twilio, así que el estado
 *   real nunca entró a nuestra base.
 *
 *   Pero SÍ guardamos el `twilio_sid`, y Twilio conserva el estado de cada
 *   mensaje. Este script se lo pregunta, mensaje por mensaje, hacia atrás.
 *
 * QUÉ RESPONDE, por cada pedido de consulta:
 *   - si se envió el aviso, y si no, por qué (sin celular, flag apagado, error).
 *   - a los cuántos minutos del pedido salió.
 *   - qué dice Twilio HOY: entregado, leído, fallado, o todavía en cola.
 *   - si eso pasó dentro de los 10 minutos o después de que el pedido ya murió.
 *
 * USO:
 *   npx tsx scripts/verify-avisos-whatsapp.ts [días]     (por defecto 3)
 *
 * REQUIERE:
 *   SUPABASE_ACCESS_TOKEN, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN.
 *
 * SOLO LECTURA: no escribe en la base ni manda un solo mensaje.
 *
 * OJO — la salida trae datos de personas reales. Sirve para actuar, no para
 * pegar en el repo, en un PR ni en un issue: el repo es público.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const PROJECT_REF = "irpupskopjahbqqvckue";
const MGMT_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
const PLAZO_SIN_ACEPTAR_MIN = 10;

function loadEnvLocal() {
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

async function q(token: string, query: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(MGMT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  if (data && typeof data === "object" && !Array.isArray(data) && "message" in data) {
    throw new Error(String((data as { message: string }).message));
  }
  return data as Record<string, unknown>[];
}

/** Estado real del mensaje según Twilio. `read` solo llega si el celular reporta lectura. */
async function estadoTwilio(
  sid: string,
  cuenta: string,
  authToken: string
): Promise<{ estado: string; enviadoAt: string | null }> {
  const auth = Buffer.from(`${cuenta}:${authToken}`).toString("base64");
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${cuenta}/Messages/${sid}.json`,
    { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(15_000) }
  );
  if (!res.ok) return { estado: `error ${res.status}`, enviadoAt: null };
  const j = (await res.json()) as { status?: string; date_sent?: string | null };
  return { estado: String(j.status ?? "?"), enviadoAt: j.date_sent ?? null };
}

function minutosEntre(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const d = (Date.parse(b) - Date.parse(a)) / 60000;
  return Number.isFinite(d) ? Math.round(d * 10) / 10 : null;
}

async function main() {
  loadEnvLocal();
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const twSid = process.env.TWILIO_ACCOUNT_SID;
  const twToken = process.env.TWILIO_AUTH_TOKEN;
  if (!token) {
    console.error("❌ Falta SUPABASE_ACCESS_TOKEN.");
    process.exit(2);
  }
  const dias = Number(process.argv[2] ?? 3) || 3;

  console.log(`\nAVISOS AL PROFESIONAL — últimos ${dias} día(s)`);
  console.log(`El pedido se cancela solo a los ${PLAZO_SIN_ACEPTAR_MIN} minutos si nadie lo acepta.\n`);

  // 1) ¿Se intentó avisar? El desglose por resultado responde "¿mandamos o no?".
  console.log("1) RESULTADO DE CADA INTENTO DE AVISO");
  const porResultado = await q(
    token,
    `select plantilla, resultado, count(*)::int as cantidad
       from whatsapp_envios
      where created_at > now() - interval '${dias} days'
      group by 1,2 order by cantidad desc`
  );
  console.table(porResultado);
  console.log("   'enviado' = Twilio aceptó la llamada. NO dice que llegó ni que lo leyeron.");

  // 2) Pedido por pedido: cuándo se pidió, cuándo salió el aviso, qué dice Twilio.
  console.log("\n2) PEDIDO POR PEDIDO");
  const filas = await q(
    token,
    `select c.id            as consulta_id,
            c.created_at    as pedido_at,
            c.aceptada_at,
            c.estado,
            m.nombre_completo as profesional,
            w.created_at    as aviso_at,
            w.resultado,
            w.twilio_sid,
            w.twilio_error_code
       from consultas c
       left join whatsapp_envios w
              on w.consulta_id = c.id and w.plantilla = 'aceptar_paciente'
       left join medicos m on m.id = c.medico_id
      where c.created_at > now() - interval '${dias} days'
      order by c.created_at desc
      limit 60`
  );

  const salida: Record<string, unknown>[] = [];
  for (const f of filas) {
    const pedido = String(f.pedido_at);
    const avisoAt = f.aviso_at ? String(f.aviso_at) : null;
    let entrega = "—";

    if (f.twilio_sid && twSid && twToken) {
      const r = await estadoTwilio(String(f.twilio_sid), twSid, twToken);
      const minEntrega = minutosEntre(pedido, r.enviadoAt);
      entrega =
        minEntrega === null
          ? r.estado
          : `${r.estado} (min ${minEntrega}${minEntrega > PLAZO_SIN_ACEPTAR_MIN ? " ⚠️ TARDE" : ""})`;
    } else if (f.twilio_sid) {
      entrega = "sin credenciales Twilio para preguntar";
    }

    const minAviso = minutosEntre(pedido, avisoAt);
    salida.push({
      pedido: pedido.slice(11, 16),
      profesional: f.profesional ?? "—",
      aviso: f.resultado ?? "NUNCA SE INTENTÓ",
      min_aviso: minAviso ?? "—",
      twilio_dice: entrega,
      error: f.twilio_error_code ?? "",
      la_aceptaron: f.aceptada_at ? "sí" : "NO",
    });
  }
  console.table(salida);

  const nunca = salida.filter((s) => s.aviso === "NUNCA SE INTENTÓ").length;
  const noAceptadas = salida.filter((s) => s.la_aceptaron === "NO").length;
  console.log(`\n   ${salida.length} pedidos · ${noAceptadas} sin aceptar · ${nunca} sin ningún intento de aviso.`);
  if (!twSid || !twToken) {
    console.log("   ⏭  Sin TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN no se pudo preguntar entrega ni lectura.");
  } else {
    console.log("   'read' = el celular reportó lectura. 'delivered' = llegó, sin confirmación de lectura.");
    console.log("   'queued'/'sent' sin avanzar = nunca se confirmó la entrega en el teléfono.");
  }
  console.log("");
}

main().catch((err) => {
  console.error("❌ Error:", err instanceof Error ? err.message : err);
  process.exit(2);
});
