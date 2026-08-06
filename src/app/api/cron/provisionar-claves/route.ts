import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { provisionarClaves } from "@/lib/firma/claves";
import { withCron } from "@/lib/cron-guard";

/**
 * Red de contención de la firma electrónica (auditoría 06/08/2026).
 *
 * `medico_claves` es el par de claves que firma los PDFs. Es distinto de la
 * firma manuscrita (la imagen), pero `perfilMedicoCompleto` exige las dos, y
 * sin ambas el médico NO puede ponerse disponible ni abrir agenda — con el
 * cartel genérico "Completá tu perfil", sin decirle qué falta.
 *
 * Hasta hoy las claves solo se creaban desde el wizard de onboarding (y desde
 * un banner que es código muerto). Resultado: 15 médicos APROBADOS sin claves,
 * varios con la firma manuscrita ya cargada. El registro ya las provisiona
 * (fix del 06/08), pero hacía falta algo que cierre el agujero histórico y
 * cualquier futuro camino que se olvide de llamarla.
 *
 * Idempotente: `provisionarClaves` devuelve la clave existente si ya hay una
 * activa. No toca cuentas de test.
 */
export const maxDuration = 60;

export const GET = withCron("provisionar-claves", async () => {
  const admin = createAdminClient();

  const [{ data: medicos }, { data: claves }] = await Promise.all([
    admin
      .from("medicos")
      .select("id, nombre_completo, es_cuenta_test")
      .eq("estado_registro", "aprobado"),
    admin.from("medico_claves").select("medico_id").eq("activa", true),
  ]);

  const conClaves = new Set((claves ?? []).map((c) => c.medico_id));
  const faltan = (medicos ?? []).filter((m) => !conClaves.has(m.id) && !m.es_cuenta_test);

  const provisionados: string[] = [];
  const fallidos: string[] = [];
  for (const m of faltan) {
    try {
      await provisionarClaves(m.id);
      provisionados.push(m.nombre_completo);
    } catch (e) {
      fallidos.push(`${m.nombre_completo}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (provisionados.length > 0) {
    console.log(`[provisionar-claves] ${provisionados.length} médicos desbloqueados:`, provisionados.join(", "));
  }
  if (fallidos.length > 0) {
    console.error(`[provisionar-claves] fallaron ${fallidos.length}:`, fallidos.join(" | "));
  }

  return NextResponse.json({
    revisados: (medicos ?? []).length,
    faltaban: faltan.length,
    provisionados: provisionados.length,
    fallidos,
  });
});
