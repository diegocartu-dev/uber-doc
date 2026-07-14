import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reconciliarIdentidad, type MedicoIdentidad } from "@/lib/didit/reconciliar";
import { getFlag } from "@/lib/feature-flags";
import { enviarEmailRecordatorioIdentidad } from "@/lib/email";
import { withCron } from "@/lib/cron-guard";

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

async function handler(req: Request) {
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

  // OJO: sin early-return acá — aunque no haya nada que reconciliar, el bloque
  // de recordatorios de abajo tiene que correr igual (con 0 candidatos,
  // allSettled([]) resuelve vacío y sigue de largo).
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

  if (candidatos.length > 0) {
    console.log(
      "[cron/reconciliar-identidad]",
      JSON.stringify({ procesados: candidatos.length, validados, resumen })
    );
  }

  // ── Recordatorio al MÉDICO trabado (gate sin muro, 13/07/2026) ──────────────
  // Con el gate ACTIVO, un aprobado no exento sin validar no aparece en la
  // clínica. El empujón va al médico por mail (decisión Diego: al admin se le
  // avisa con el badge del panel, no por mail). Timing: >24 h desde la
  // aprobación (que no pise el mail de bienvenida) y máximo 1 mail cada 72 h
  // por médico (identidad_recordatorio_at). Incluye a los que nunca iniciaron
  // sesión de Didit (didit_session_id null — el filtro de arriba no los ve).
  let recordatorios = 0;
  if (await getFlag("identidad_gate_activa")) {
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const hace72h = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    // Tope temporal (gate Roberto #263 O2): se insiste solo los primeros 30 días
    // post-aprobación (~10 mails máx.); después queda el badge del panel admin y
    // la gestión manual. Los "Declined" se excluyen del mail automático: un
    // rechazo de Didit lo revisa el admin (badge rojo) ANTES de invitar a
    // reintentar — puede no ser un problema de foto.
    const hace30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: trabados, error: errTrabados } = await admin
      .from("medicos")
      .select("id, nombre_completo, identidad_recordatorio_at, didit_status")
      .eq("estado_registro", "aprobado")
      .eq("es_cuenta_test", false)
      .neq("identidad_validada", true)
      .neq("biometria_exenta", true)
      .lt("verificado_at", hace24h)
      .gte("verificado_at", hace30d)
      .order("verificado_at", { ascending: true })
      .limit(50);
    if (errTrabados) {
      console.error("[cron/reconciliar-identidad] query trabados falló:", errTrabados.message);
    } else {
      const aRecordar = (trabados ?? [])
        .filter((m) => m.didit_status !== "Declined")
        .filter((m) => !m.identidad_recordatorio_at || m.identidad_recordatorio_at < hace72h)
        .slice(0, 10);
      for (const m of aRecordar) {
        await enviarEmailRecordatorioIdentidad(m.id);
        // Chequear el error del throttle (gate Roberto #263 O3): si este update
        // falla, el médico se re-mailearía a los 10 min — al menos que quede rastro.
        const { error: errThrottle } = await admin
          .from("medicos")
          .update({ identidad_recordatorio_at: new Date().toISOString() })
          .eq("id", m.id);
        if (errThrottle) {
          console.error(
            "[cron/reconciliar-identidad] no se pudo registrar el throttle del recordatorio:",
            errThrottle.message
          );
        }
        recordatorios++;
      }
      if (recordatorios > 0) {
        console.log(
          "[cron/reconciliar-identidad] recordatorios enviados:",
          JSON.stringify(aRecordar.map((m) => m.nombre_completo))
        );
      }
    }
  }

  return NextResponse.json({ ok: true, procesados: candidatos.length, validados, recordatorios, resumen });
}

export const GET = withCron("reconciliar-identidad", handler);
