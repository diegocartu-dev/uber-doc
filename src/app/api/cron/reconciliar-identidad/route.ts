import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reconciliarIdentidad, type MedicoIdentidad } from "@/lib/didit/reconciliar";

/**
 * Cron cada 10 min: BACKSTOP de la validación de identidad biométrica (Didit).
 *
 * El webhook de Didit es la vía principal (reacciona al instante cuando el médico
 * termina la verificación). Este cron existe porque un webhook NUNCA es garantía
 * de entrega: si la URL queda mal apuntada, si Didit no reintenta, o si nuestro
 * endpoint estuvo caído, el resultado se pierde EN SILENCIO y el médico queda
 * trabado. Caso real 07/2026: el webhook apuntaba al dominio pelado docto.com.ar,
 * Vercel redirigía 307 → www, y 24 verificaciones aprobadas nunca llegaron a
 * nuestra base — nadie se enteró durante semanas.
 *
 * Reconcilia a los médicos con sesión Didit iniciada y sin validar: le pregunta a
 * Didit el resultado autoritativo y aplica el MISMO cruce anti-suplantación que el
 * webhook (lógica compartida en `reconciliarIdentidad`). Nunca depender solo del
 * webhook para una transición crítica — misma lección que Realtime/LiveKit.
 */

// Didit (obtenerDecisionDidit, 15s) + REFEPS en el peor caso (~51s: token frío +
// 2 reintentos del Bus) corren en serie por candidato → hasta ~66s. 90s da margen.
export const maxDuration = 90;

const MAX_POR_CORRIDA = 10;
// Estados terminales de Didit: no tiene sentido re-consultarlos (no cambian sin una
// sesión NUEVA, que crear-sesion registra con otro session_id + status no-terminal).
// Nota: son NULL-safe abajo; hoy todos los pendientes están en "Not Started" (el
// webhook nunca pudo escribir su estado), así que en la primera corrida no se saltea
// a nadie y el backfill los procesa a todos.
const TERMINALES = new Set(["Declined", "Expired", "Abandoned"]);

export async function GET(req: Request) {
  // Fail-closed: sin CRON_SECRET configurado, "Bearer undefined" pasaría el check.
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: pendientes, error } = await admin
    .from("medicos")
    .select(
      "id, nombre_completo, dni, numero_matricula, identidad_validada, didit_session_id, didit_status, biometria_exenta, es_cuenta_test"
    )
    .not("didit_session_id", "is", null)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[cron/reconciliar-identidad] query falló:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Filtro NULL-safe en JS (default de columnas booleanas nuevas puede ser NULL):
  // pendientes reales = con sesión, no validados, no exentos, no test, no terminales.
  const candidatos = (pendientes ?? [])
    .filter(
      (m) =>
        !!m.didit_session_id &&
        !m.identidad_validada &&
        !m.es_cuenta_test &&
        !m.biometria_exenta &&
        !TERMINALES.has(m.didit_status ?? "")
    )
    .slice(0, MAX_POR_CORRIDA);

  if (candidatos.length === 0) {
    return NextResponse.json({ ok: true, procesados: 0 });
  }

  const resultados = await Promise.allSettled(
    candidatos.map((m) =>
      reconciliarIdentidad(
        admin,
        {
          id: m.id,
          dni: m.dni,
          numero_matricula: m.numero_matricula,
          identidad_validada: !!m.identidad_validada,
        } satisfies MedicoIdentidad,
        m.didit_session_id as string
      )
    )
  );

  const resumen = candidatos.map((m, i) => {
    const r = resultados[i];
    return {
      medico: m.nombre_completo,
      resultado:
        r.status === "fulfilled"
          ? r.value.outcome
          : `error: ${String(r.reason).slice(0, 120)}`,
    };
  });
  const validados = resultados.filter(
    (r) => r.status === "fulfilled" && r.value.outcome === "validado"
  ).length;

  console.log(
    "[cron/reconciliar-identidad]",
    JSON.stringify({ procesados: candidatos.length, validados, resumen })
  );
  return NextResponse.json({ ok: true, procesados: candidatos.length, validados, resumen });
}
